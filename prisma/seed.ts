import { hash } from 'bcryptjs';
import { approvalDependencies, approvals, departments, demoApplications, knowledgeArticles, schemes } from '../src/lib/demo-data';
import { prisma } from '../src/lib/prisma';

async function main() {
  const passwordHash = await hash('demo123', 10);
  const roleNames = ['Applicant', 'Department Officer', 'Nodal Officer', 'Admin'];
  const roles = await Promise.all(roleNames.map((name) => prisma.role.upsert({ where: { name }, update: {}, create: { name } })));
  const departmentRows = await Promise.all(departments.map((code) => prisma.department.upsert({
    where: { code }, update: {}, create: { code, nameEn: code, nameMr: code, nameHi: code },
  })));
  const departmentByCode = new Map(departmentRows.map((department) => [department.code, department]));

  const users = await Promise.all([
    ['applicant@udyogmitra.demo', 'Demo Applicant', 'Applicant', null],
    ['foundry@udyogmitra.demo', 'Demo Foundry Applicant', 'Applicant', null],
    ['textiles@udyogmitra.demo', 'Demo Textiles Applicant', 'Applicant', null],
    ['officer@udyogmitra.demo', 'Demo Department Officer', 'Department Officer', departmentByCode.get('MPCB')?.id],
    ['nodal@udyogmitra.demo', 'Demo Nodal Officer', 'Nodal Officer', null],
    ['admin@udyogmitra.demo', 'Demo Administrator', 'Admin', null],
  ].map(async ([email, name, roleName, departmentId]) => {
    const user = await prisma.user.upsert({
      where: { email: String(email) }, update: { departmentId: departmentId ? String(departmentId) : null, passwordHash },
        create: { email: String(email), name: String(name), passwordHash, departmentId: departmentId ? String(departmentId) : null, roles: { connect: { id: roles.find((role) => role.name === roleName)?.id } } },
    });
    if (!(await prisma.businessProfile.findUnique({ where: { userId: user.id } })) && roleName === 'Applicant') {
      const legalName = String(email).startsWith('foundry@') ? 'Nirman Components' : String(email).startsWith('textiles@') ? 'Pragati Textiles' : 'Sahyadri Foods Pvt Ltd';
      await prisma.businessProfile.create({ data: { userId: user.id, legalName, activity: 'manufacturing', investmentLakhs: 180, employeeCount: 24 } });
    }
    return user;
  }));

  for (const item of approvals) {
    const department = departmentByCode.get(item.department) ?? departmentRows[0];
    await prisma.approval.upsert({
      where: { id: item.id }, update: { departmentId: department.id }, create: {
        id: item.id, nameEn: item.name.en, nameMr: item.name.mr, nameHi: item.name.hi,
        descriptionEn: `${item.name.en} is required at the ${item.stage.toLowerCase()} stage. Illustrative data.`,
        descriptionMr: `${item.name.mr} आवश्यक आहे. ही नमुना माहिती आहे.`, descriptionHi: `${item.name.hi} आवश्यक है। यह उदाहरण डेटा है।`,
        stage: item.stage, slaDays: item.days, fee: item.fee, departmentId: department.id, deemedEligible: item.deemedEligible,
      },
    });
  }
  for (const dependency of approvalDependencies) {
    await prisma.approvalDependency.upsert({
      where: { approvalId_dependsOnId: dependency }, update: {}, create: dependency,
    });
  }
  for (const item of schemes) {
    await prisma.scheme.upsert({ where: { id: item.id }, update: {}, create: {
      id: item.id, nameEn: item.name.en, nameMr: item.name.mr, nameHi: item.name.hi,
      descriptionEn: item.description.en, descriptionMr: item.description.mr, descriptionHi: item.description.hi, benefit: item.benefit,
    } });
  }
  for (const item of knowledgeArticles) {
    await prisma.knowledgeArticle.upsert({ where: { slug: item.slug }, update: {}, create: {
      id: item.slug, slug: item.slug, titleEn: item.title.en, titleMr: item.title.mr, titleHi: item.title.hi,
      contentEn: `${item.title.en}. Requirements depend on the sector, location, project size, and current rules. Confirm requirements with the responsible authority. This prototype is guidance only, not legal advice.`,
      contentMr: `${item.title.mr}. आवश्यकता क्षेत्र, ठिकाण व प्रकल्पाच्या आकारावर अवलंबून असतात. संबंधित प्राधिकरणाकडून पुष्टी करा.`,
      contentHi: `${item.title.hi}। आवश्यकताएं क्षेत्र, स्थान और परियोजना के आकार पर निर्भर करती हैं। संबंधित प्राधिकरण से पुष्टि करें।`, category: item.category,
    } });
  }
  const applicantProfiles = await Promise.all(users.slice(0, 3).map((user) => prisma.businessProfile.findUniqueOrThrow({ where: { userId: user.id } })));
  for (const [index, item] of demoApplications.entries()) {
    const applicationId = item.id;
    await prisma.application.upsert({ where: { id: applicationId }, update: {
      businessProfileId: applicantProfiles[index % applicantProfiles.length].id, projectName: item.business, projectStage: 'Pre-establishment', status: item.status, submittedAt: new Date(item.submitted),
    }, create: {
      id: applicationId, businessProfileId: applicantProfiles[index % applicantProfiles.length].id, projectName: item.business, projectStage: 'Pre-establishment', status: item.status,
      submittedAt: new Date(item.submitted),
    } });
    await prisma.query.deleteMany({ where: { applicationId } });
    await prisma.applicationStatusHistory.deleteMany({ where: { applicationId } });
    await prisma.subApplication.deleteMany({ where: { applicationId } });
    const selectedApprovals = Array.from({ length: 5 }, (_, offset) => approvals[(index + offset * 5) % approvals.length]);
    const approvalRows = await prisma.approval.findMany({ where: { id: { in: selectedApprovals.map((approval) => approval.id) } } });
    const statusHistory = await prisma.applicationStatusHistory.create({ data: { applicationId, status: item.status, note: 'Illustrative seeded case status.' } });
    const subApplications = await prisma.subApplication.createMany({ data: approvalRows.map((approval) => ({
      applicationId, approvalId: approval.id, departmentId: approval.departmentId, status: item.status,
      dueAt: new Date(Date.now() + item.dueIn * 86_400_000),
    })) });
    await prisma.auditLog.upsert({
      where: { id: `seed-${applicationId}` }, update: { action: `SEEDED_${item.status.toUpperCase().replaceAll(' ', '_')}` },
      create: { id: `seed-${applicationId}`, action: `SEEDED_${item.status.toUpperCase().replaceAll(' ', '_')}`, entity: 'Application', entityId: applicationId, details: { illustrative: true, subApplications: subApplications.count, historyId: statusHistory.id } },
    });
  }
  console.log(`Seeded ${users.length} users, ${roleNames.length} roles, ${approvals.length} approvals, ${schemes.length} schemes, ${knowledgeArticles.length} guides, ${demoApplications.length} applications, and approximately ${demoApplications.length * 5} departmental reviews.`);
}

main().finally(() => prisma.$disconnect());