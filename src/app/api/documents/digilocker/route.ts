import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { auditSink } from '@/services/governance/audit';
import { consentLedger } from '@/services/governance/consent';
import { ConnectorError } from '@/services/connectors/types';
import { mockDigiLockerSource } from '@/services/connectors/mock-digilocker';
import { isSameOrigin } from '@/lib/security';

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('grant') }).strict(),
  z.object({ action: z.literal('revoke') }).strict(),
  z.object({ action: z.literal('import'), reference: z.string().min(1).max(100) }).strict(),
]);

async function applicantSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'applicant') return null;
  return session.user;
}

async function activeConsent(userId: string) {
  return prisma.documentConsent.findFirst({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
}

function cacheConsent(userId: string, expiresAt: Date) {
  if (!consentLedger.hasConsent(userId, 'digilocker_fetch', 'list')) {
    consentLedger.grant({ subjectId: userId, purpose: 'digilocker_fetch', scope: ['list', 'fetch'], ttlMs: Math.max(1, expiresAt.getTime() - Date.now()) });
  }
}

export async function GET() {
  const user = await applicantSession();
  if (!user) return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Applicant sign-in required.' } }, { status: 401 });
  const consent = await activeConsent(user.id);
  const granted = Boolean(consent);
  if (consent) cacheConsent(user.id, consent.expiresAt);
  const documents = granted ? await mockDigiLockerSource.listDocuments(user.id) : [];
  return NextResponse.json({ data: { granted, expiresAt: consent?.expiresAt.toISOString() ?? null, simulated: true, documents } });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: { code: 'INVALID_ORIGIN', message: 'Cross-origin request denied.' } }, { status: 403 });
  const user = await applicantSession();
  if (!user) return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Applicant sign-in required.' } }, { status: 401 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'A DigiLocker action is required.' } }, { status: 400 });

  if (parsed.data.action === 'grant') {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await prisma.documentConsent.create({ data: { userId: user.id, expiresAt } });
    cacheConsent(user.id, expiresAt);
    auditSink.append({ actorId: user.id, action: 'consent.digilocker.grant', layer: 'governance', model: null, reasonTrace: ['governance.purpose_bound_consent'], input: { purpose: 'digilocker_fetch', scope: ['list', 'fetch'], simulated: true } });
    return NextResponse.json({ data: { granted: true, expiresAt: expiresAt.toISOString(), simulated: true } });
  }

  if (parsed.data.action === 'revoke') {
    const result = await prisma.documentConsent.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    const consent = consentLedger.list(user.id).find((item) => item.purpose === 'digilocker_fetch' && item.revokedAt === null);
    if (consent) consentLedger.revoke(consent.id, user.id);
    const revoked = result.count > 0;
    auditSink.append({ actorId: user.id, action: 'consent.digilocker.revoke', layer: 'governance', model: null, reasonTrace: ['governance.consent_revocation'], input: { purpose: 'digilocker_fetch', revoked } });
    return NextResponse.json({ data: { granted: false, revoked, simulated: true } });
  }

  if (!('reference' in parsed.data)) return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'A document reference is required.' } }, { status: 400 });
  const reference = parsed.data.reference;
  try {
    const consent = await activeConsent(user.id);
    if (!consent) return NextResponse.json({ error: { code: 'CONSENT_REQUIRED', message: 'Grant DigiLocker access before importing documents.' } }, { status: 409 });
    cacheConsent(user.id, consent.expiresAt);
    const candidate = (await mockDigiLockerSource.listDocuments(user.id)).find((item) => item.reference === reference);
    if (!candidate) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'DigiLocker document not found.' } }, { status: 404 });
    const verification = await mockDigiLockerSource.verifyAtSource(candidate);
    const fetched = await mockDigiLockerSource.fetchDocument(user.id, candidate.reference);
    const document = await prisma.document.create({ data: {
      ownerId: user.id, type: candidate.documentType, fileName: candidate.displayName,
      status: verification.matched ? 'SIMULATED_SOURCE_MATCH_NEEDS_REVIEW' : 'NEEDS_REVIEW',
      mimeType: fetched.mimeType, content: Buffer.from(fetched.bytes), byteSize: fetched.bytes.byteLength, sha256: fetched.sha256,
      source: 'digilocker', sourceReference: candidate.reference, simulated: true, sourceMatch: verification.matched,
      expiresAt: candidate.expiresAt ? new Date(candidate.expiresAt) : null,
    }, select: { id: true, type: true, fileName: true, status: true, mimeType: true, byteSize: true, sourceReference: true, source: true, simulated: true, sourceMatch: true, expiresAt: true } });
    auditSink.append({ actorId: user.id, action: 'document.digilocker.import.demo', layer: 'connector', model: 'mock-digilocker', reasonTrace: verification.reasonTrace, input: { documentType: candidate.documentType, reference: candidate.reference, simulated: true } });
    return NextResponse.json({ data: {
      reference: document.id, documentType: document.type, displayName: document.fileName, status: document.status,
      source: document.source, sourceReference: document.sourceReference, sourceMatch: document.sourceMatch,
      sourceVerified: false, simulated: document.simulated, mimeType: document.mimeType,
      byteSize: document.byteSize, expiresAt: document.expiresAt,
    }, simulated: true }, { status: 201 });
  } catch (error) {
    if (error instanceof ConnectorError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.code === 'CONSENT_REQUIRED' ? 409 : 400 });
    throw error;
  }
}