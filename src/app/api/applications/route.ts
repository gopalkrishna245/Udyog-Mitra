import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isSameOrigin } from '@/lib/security';

const createSchema = z.object({
  projectName: z.string().trim().min(2).max(120), projectStage: z.string().trim().min(1).max(80),
  organizationType: z.string().trim().min(1).max(50).default('proprietorship'),
  approvalIds: z.array(z.string()).min(1).max(30), documentIds: z.array(z.string().min(1)).max(30).default([]),
});
const listQuerySchema = z.object({
  search: z.string().trim().max(120).default(''),
  status: z.enum(['Submitted', 'Under Scrutiny', 'Query Raised', 'Approved', 'Rejected']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Sign in required.' } }, { status: 401 });
  const params = listQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!params.success) return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Invalid application search options.', issues: params.error.issues } }, { status: 400 });
  const { search, status, page, pageSize } = params.data;
  const scope = session.user.role === 'applicant'
    ? { businessProfile: { userId: session.user.id } }
    : session.user.role === 'officer'
      ? {
          subApplications: {
            some: {
              department: {
                users: { some: { id: session.user.id } },
              },
            },
          },
        }
      : {};
  const where = {
    ...scope,
    ...(status ? { status } : {}),
    ...(search ? { OR: [
      { id: { contains: search } },
      { projectName: { contains: search } },
      { businessProfile: { legalName: { contains: search } } },
      { businessProfile: { location: { district: { contains: search } } } },
      { subApplications: { some: { department: { code: { contains: search } } } } },
    ] } : {}),
  };
  const scopedReviews = session.user.role === 'officer' ? { department: { users: { some: { id: session.user.id } } } } : {};
  const [applications, total] = await Promise.all([
    prisma.application.findMany({ where, include: {
      subApplications: { where: scopedReviews, include: { approval: true, department: true } },
      businessProfile: { select: { legalName: true, activity: true, investmentLakhs: true, employeeCount: true } },
    }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.application.count({ where }),
  ]);
  return NextResponse.json({ data: applications, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: { code: 'INVALID_ORIGIN', message: 'Cross-origin request denied.' } }, { status: 403 });
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'applicant') return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Applicant role required.' } }, { status: session?.user ? 403 : 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'Project name, stage, and approvals are required.', issues: parsed.error.issues } }, { status: 400 });
  const profile = await prisma.businessProfile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return NextResponse.json({ error: { code: 'PROFILE_REQUIRED', message: 'Complete the business profile first.' } }, { status: 409 });
  const requestedApprovals = await prisma.approval.findMany({ where: { id: { in: parsed.data.approvalIds } } });
  if (requestedApprovals.length !== new Set(parsed.data.approvalIds).size) return NextResponse.json({ error: { code: 'UNKNOWN_APPROVAL', message: 'One or more approvals were not found.' } }, { status: 400 });
  if (new Set(parsed.data.documentIds).size !== parsed.data.documentIds.length) return NextResponse.json({ error: { code: 'DUPLICATE_DOCUMENT', message: 'A document was selected more than once.' } }, { status: 400 });
  const requestedDocuments = await prisma.document.findMany({ where: { id: { in: parsed.data.documentIds }, ownerId: session.user.id }, select: { id: true } });
  if (requestedDocuments.length !== parsed.data.documentIds.length) return NextResponse.json({ error: { code: 'INVALID_DOCUMENT', message: 'One or more selected documents are unavailable for this account.' } }, { status: 400 });
  const id = `UM-2026-${Date.now().toString().slice(-8)}`;
  const application = await prisma.$transaction(async (tx) => {
    await tx.businessProfile.update({ where: { id: profile.id }, data: { organizationType: parsed.data.organizationType } });
    return tx.application.create({ data: {
    id, businessProfileId: profile.id, projectName: parsed.data.projectName, projectStage: parsed.data.projectStage, status: 'Submitted', submittedAt: new Date(),
    subApplications: { create: requestedApprovals.map((approval) => ({ approvalId: approval.id, departmentId: approval.departmentId, status: 'Submitted', dueAt: new Date(Date.now() + approval.slaDays * 86_400_000) })) },
    statusHistory: { create: { actorId: session.user.id, status: 'Submitted', note: 'Common application submitted.' } },
    documentLinks: { create: requestedDocuments.map((document) => ({ documentId: document.id })) },
    } });
  });
  await prisma.auditLog.create({ data: { actorId: session.user.id, action: 'APPLICATION_SUBMITTED', entity: 'Application', entityId: id, details: { approvalCount: requestedApprovals.length, documentCount: requestedDocuments.length } } });
  return NextResponse.json({ data: application }, { status: 201 });
}