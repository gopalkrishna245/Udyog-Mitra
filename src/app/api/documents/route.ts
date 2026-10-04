import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isSameOrigin } from '@/lib/security';
import { ConnectorError } from '@/services/connectors/types';
import { prepareManualUpload } from '@/services/connectors/manual-upload';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Sign in required.' } }, { status: 401 });
  if (session.user.role !== 'applicant') return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Applicant role required.' } }, { status: 403 });
  const documents = await prisma.document.findMany({ where: { ownerId: session.user.id }, orderBy: { createdAt: 'desc' }, select: {
    id: true, type: true, fileName: true, status: true, source: true, sourceReference: true, sourceMatch: true,
    simulated: true, mimeType: true, byteSize: true, expiresAt: true,
    verificationRecords: { orderBy: { verifiedAt: 'desc' }, take: 1, select: { officeName: true, visitAt: true, note: true, verifiedAt: true } },
  } });
  return NextResponse.json({ data: documents.map((document) => ({
    reference: document.id, documentType: document.type, displayName: document.fileName, status: document.status,
    source: document.source, sourceReference: document.sourceReference, sourceMatch: document.sourceMatch,
    sourceVerified: false, simulated: document.simulated, mimeType: document.mimeType,
    byteSize: document.byteSize, expiresAt: document.expiresAt, verification: document.verificationRecords[0] ?? null,
  })), storage: 'database' });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: { code: 'INVALID_ORIGIN', message: 'Cross-origin request denied.' } }, { status: 403 });
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Sign in required.' } }, { status: 401 });
  if (session.user.role !== 'applicant') return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Applicant role required.' } }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const documentType = z.string().trim().min(1).max(80).safeParse(form?.get('documentType') ?? 'Supporting document');
  if (!(file instanceof File) || !documentType.success) return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'A document file and type are required.' } }, { status: 400 });
  try {
    const fetched = prepareManualUpload({ fileName: file.name.slice(0, 180), mimeType: file.type, bytes: new Uint8Array(await file.arrayBuffer()), documentType: documentType.data });
    const document = await prisma.document.create({ data: {
      ownerId: session.user.id, type: fetched.metadata.documentType, fileName: fetched.metadata.displayName,
      status: 'NEEDS_REVIEW', mimeType: fetched.mimeType, content: Buffer.from(fetched.bytes), byteSize: fetched.bytes.byteLength, sha256: fetched.sha256,
      source: 'manual', simulated: false, sourceMatch: false,
    }, select: { id: true, type: true, fileName: true, status: true, mimeType: true, byteSize: true, source: true, simulated: true, sourceMatch: true } });
    return NextResponse.json({ data: {
      reference: document.id, documentType: document.type, displayName: document.fileName, status: document.status,
      source: document.source, sourceReference: null, sourceMatch: document.sourceMatch, sourceVerified: false,
      simulated: document.simulated, mimeType: document.mimeType, byteSize: document.byteSize,
    }, storage: 'database' }, { status: 201 });
  } catch (error) {
    if (error instanceof ConnectorError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: 400 });
    throw error;
  }
}