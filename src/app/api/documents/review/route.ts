import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isSameOrigin } from '@/lib/security';

const reviewSchema = z.object({
  documentId: z.string().min(1),
  status: z.enum(['VERIFIED', 'REJECTED']),
  officeName: z.string().trim().min(2).max(160),
  visitAt: z.string().datetime().optional(),
  reference: z.string().trim().max(120).optional(),
  note: z.string().trim().min(10).max(1000),
}).strict();

function isReviewer(role: string | undefined) {
  return role === 'admin' || role === 'nodal';
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Sign in required.' } }, { status: 401 });
  if (!isReviewer(session.user.role)) return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Nodal officer or admin role required.' } }, { status: 403 });
  const documents = await prisma.document.findMany({
    where: { status: { notIn: ['VERIFIED', 'REJECTED'] } },
    orderBy: { createdAt: 'asc' }, take: 100,
    select: { id: true, fileName: true, type: true, status: true, source: true, simulated: true, sourceMatch: true, createdAt: true, owner: { select: { name: true, businessProfile: { select: { legalName: true } } } } },
  });
  return NextResponse.json({ data: documents.map((document) => ({
    documentId: document.id, fileName: document.fileName, documentType: document.type, status: document.status,
    source: document.source, simulated: document.simulated, sourceMatch: document.sourceMatch,
    submittedAt: document.createdAt, ownerName: document.owner.businessProfile?.legalName ?? document.owner.name,
  })) });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: { code: 'INVALID_ORIGIN', message: 'Cross-origin request denied.' } }, { status: 403 });
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Sign in required.' } }, { status: 401 });
  if (!isReviewer(session.user.role)) return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Nodal officer or admin role required.' } }, { status: 403 });
  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Office, decision, and review note are required.', issues: parsed.error.issues } }, { status: 400 });
  const document = await prisma.document.findUnique({ where: { id: parsed.data.documentId }, select: { id: true, ownerId: true, status: true, simulated: true } });
  if (!document) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Document not found.' } }, { status: 404 });
  if (['VERIFIED', 'REJECTED'].includes(document.status)) return NextResponse.json({ error: { code: 'ALREADY_REVIEWED', message: 'This document already has a final review status.' } }, { status: 409 });

  const visitAt = parsed.data.visitAt ? new Date(parsed.data.visitAt) : null;
  await prisma.$transaction(async (tx) => {
    await tx.document.update({ where: { id: document.id }, data: { status: parsed.data.status } });
    await tx.verificationRecord.create({ data: {
      documentId: document.id, provider: 'manual-officer-review', status: parsed.data.status,
      reference: parsed.data.reference || null, officeName: parsed.data.officeName, visitAt, note: parsed.data.note,
    } });
    await tx.auditLog.create({ data: {
      actorId: session.user.id, action: `DOCUMENT_${parsed.data.status}`, entity: 'Document', entityId: document.id,
      details: { ownerId: document.ownerId, officeName: parsed.data.officeName, visitAt: visitAt?.toISOString() ?? null, simulated: document.simulated },
    } });
  });
  return NextResponse.json({ data: { documentId: document.id, status: parsed.data.status, simulated: document.simulated } });
}