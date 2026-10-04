'use client';

import { useEffect, useMemo, useState, type ComponentProps, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { Link as LocaleLink, useRouter } from '@/i18n/routing';
import { ArrowLeft, ArrowRight, Bell, Check, CircleAlert, Clock3, FileText, Search, ShieldCheck, Upload } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { approvals, demoApplications, departments, knowledgeArticles, schemes, type DemoApplication } from '@/lib/demo-data';
import { calculateRisk, generateChecklist, validateApplication, type ProjectProfile } from '@/lib/engines';
import { estimateRegistrationTimeline, registrationCatalog } from '@/lib/registration-data';
import { WhatsAppGuide } from '@/components/whatsapp-guide';
import { JourneyTimeline } from '@/components/journey-timeline';

type DemoUser = { email: string; role: 'applicant' | 'officer' | 'nodal' | 'admin' };
type StoredApp = DemoApplication & { query?: string; response?: string };
type Issue = { id: string; subject: string; status: string; created: string };
type ApiDocument = { reference: string; documentType: string; displayName: string; status: string; source: 'manual' | 'digilocker'; simulated: boolean; sourceMatch: boolean; sourceVerified: boolean; mimeType: string; byteSize: number; verification?: { officeName: string | null; visitAt: string | null; note: string | null; verifiedAt: string } | null };
type LocalDocument = { reference: string; name: string; size: number; status: string; type: string; source: 'manual' | 'digilocker'; simulated: boolean; verification?: ApiDocument['verification'] };
type RemoteDigiLockerDocument = { reference: string; documentType: string; displayName: string; issuer: string; expiresAt: string | null; maskedIdentifier: string | null; simulated: boolean };
type ApiApplication = { id: string; projectName: string; status: string; submittedAt: string | null; subApplications: Array<{ dueAt: string | null; department: { code: string } }> };
type ApplicationListResponse = { data: ApiApplication[]; pagination: { totalPages: number } };

const APP_KEY = 'udyog-mitra-applications';
const PREVIEW_ROLE_KEY = 'udyog-mitra-preview-role';
const CERTIFICATES = ['UM-CERT-2026-001', 'UM-CERT-2026-002', 'UM-CERT-2026-003'];
const roleEmails = {
  applicant: 'applicant@udyogmitra.demo',
  officer: 'officer@udyogmitra.demo',
  nodal: 'nodal@udyogmitra.demo',
  admin: 'admin@udyogmitra.demo',
} as const;

function loadValue<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function saveValue(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function previewUserFor(role: DemoUser['role']): DemoUser {
  return { role, email: roleEmails[role] };
}

function mapApiDocument(document: ApiDocument): LocalDocument {
  return { reference: document.reference, name: document.displayName, size: document.byteSize, status: document.status, type: document.documentType, source: document.source, simulated: document.simulated, verification: document.verification };
}

export function WorkspacePage({ segments }: { segments: string[] }) {
  const t = useTranslations('Workspace');
  const applicationText = useTranslations('Applications');
  const documentText = useTranslations('Documents');
  const previewText = useTranslations('Preview');
  const timelineText = useTranslations('Timeline');
  const common = useTranslations('Common');
  const locale = useLocale() as 'en' | 'mr' | 'hi';
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const route = segments.join('/') || 'home';
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<ProjectProfile>({ activity: 'manufacturing', sector: 'Orange', investmentLakhs: 180, employees: 24, powerKw: 75, waterKld: 12, hazardous: false, stage: 'Planning', landType: 'MIDC' });
  const [loginRole, setLoginRole] = useState<DemoUser['role']>('applicant');
  const [previewUser, setPreviewUser] = useState<DemoUser | null>(null);
  const [previewUserLoaded, setPreviewUserLoaded] = useState(false);
  const [checklistReady, setChecklistReady] = useState(false);
  const [entityType, setEntityType] = useState('proprietorship');
  const checklist = useMemo(() => generateChecklist(profile), [profile]);
  const [applicationsList, setApplicationsList] = useState<StoredApp[]>(demoApplications);
  const [applicationPage, setApplicationPage] = useState(1);
  const [applicationPageCount, setApplicationPageCount] = useState(1);
  const [applicationsLoading, setApplicationsLoading] = useState(true);
  const [applicationsError, setApplicationsError] = useState(false);
  const [applicationRefresh, setApplicationRefresh] = useState(0);
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [selectedApplication, setSelectedApplication] = useState('');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [documents, setDocuments] = useState<LocalDocument[]>([]);
  const [applicationSubmitting, setApplicationSubmitting] = useState(false);
  const [articlesSearch, setArticlesSearch] = useState('');
  const [certificateId, setCertificateId] = useState('');
  const [formErrors, setFormErrors] = useState<string[]>([]);

  useEffect(() => {
    setApplicationsList(loadValue<StoredApp[]>(APP_KEY, demoApplications));
    setIssues(loadValue<Issue[]>('udyog-mitra-grievances', []));
    setDocuments(loadValue<LocalDocument[]>('udyog-mitra-documents', []));
    setSelectedApplication(new URLSearchParams(window.location.search).get('id') ?? '');
    setEntityType(loadValue('udyog-mitra-entity-type', 'proprietorship'));
    const savedRole = window.localStorage.getItem(PREVIEW_ROLE_KEY);
    if (savedRole && Object.hasOwn(roleEmails, savedRole)) setPreviewUser(previewUserFor(savedRole as DemoUser['role']));
    setPreviewUserLoaded(true);
    const savedProfile = loadValue<ProjectProfile | null>('udyog-mitra-profile', null);
    if (savedProfile) setProfile(savedProfile);
    setChecklistReady(Boolean(loadValue<ProjectProfile | null>('udyog-mitra-profile', null)));
  }, []);

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || session?.user.role !== 'applicant') return;
    const controller = new AbortController();
    void fetch('/api/documents', { signal: controller.signal, cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error('Documents unavailable');
      const result = await response.json() as { data: ApiDocument[] };
      if (!controller.signal.aborted) setDocuments(result.data.map(mapApiDocument));
    }).catch(() => undefined);
    return () => controller.abort();
  }, [session?.user.role, sessionStatus]);

  useEffect(() => {
    if (sessionStatus !== 'authenticated') {
      setApplicationsLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const params = new URLSearchParams({ search: query, page: String(applicationPage), pageSize: '25' });
    if (filter !== 'All') params.set('status', filter);
    setApplicationsLoading(true);
    setApplicationsError(false);
    void fetch(`/api/applications?${params}`, { signal: controller.signal, cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error('Application search failed');
      const payload = await response.json() as ApplicationListResponse;
      if (cancelled) return;
      setApplicationPageCount(Math.max(1, payload.pagination.totalPages));
      const records = payload.data.map((application): StoredApp => {
        const dueAt = application.subApplications.map((item) => item.dueAt).filter((date): date is string => Boolean(date)).sort()[0];
        const dueIn = dueAt ? Math.ceil((new Date(dueAt).getTime() - Date.now()) / 86_400_000) : 15;
        return {
          id: application.id, business: application.projectName, district: 'Pune', status: application.status,
          department: application.subApplications[0]?.department.code ?? 'Single Window', submitted: application.submittedAt?.slice(0, 10) ?? '',
          dueIn, risk: 24, ownerEmail: session?.user.email ?? '',
        };
      });
      setApplicationsList((current) => {
        const serverIds = new Set(records.map((record) => record.id));
        const localDrafts = applicationPage === 1 && session?.user.role === 'applicant'
          ? current.filter((record) => record.status === 'Draft' && record.ownerEmail === session.user.email && !serverIds.has(record.id))
          : [];
        const next = [...records, ...localDrafts];
        saveValue(APP_KEY, next);
        return next;
      });
    }).catch(() => {
      if (!cancelled) setApplicationsError(true);
    }).finally(() => {
      if (!cancelled) setApplicationsLoading(false);
    });
    return () => { cancelled = true; controller.abort(); };
  }, [applicationPage, applicationRefresh, filter, query, session?.user.email, session?.user.role, sessionStatus]);

  function updateProfile<K extends keyof ProjectProfile>(key: K, value: ProjectProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function persistApps(next: StoredApp[]) {
    setApplicationsList(next);
    saveValue(APP_KEY, next);
  }

  function startApplication() {
    const id = `UM-2026-${String(Math.floor(10000 + Math.random() * 89999))}`;
    const next: StoredApp = { id, business: 'My new business', district: 'Pune', status: 'Draft', department: 'Single Window', submitted: new Date().toISOString().slice(0, 10), dueIn: 30, risk: calculateRisk(profile), ownerEmail: session?.user.email ?? previewUser?.email ?? roleEmails.applicant };
    const all = [next, ...applicationsList];
    persistApps(all);
    saveValue('udyog-mitra-profile', profile);
    saveValue('udyog-mitra-entity-type', entityType);
    router.push(`/applications/${id}`);
  }

  async function saveAndSubmitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const documentIds = form.getAll('documentIds').map(String);
    const errors = validateApplication({
      pan: String(form.get('pan') || ''), gstin: String(form.get('gstin') || ''), mobile: String(form.get('mobile') || ''), pincode: String(form.get('pincode') || ''),
      investmentLakhs: Number(form.get('investment') || 0), msmeCategory: String(form.get('msme') || ''), plotArea: Number(form.get('plot') || 0), builtUpArea: Number(form.get('built') || 0), requiredDocumentCount: documentIds.length,
    });
    setFormErrors(errors);
    if (errors.length) return;
    if (!session && previewUser) {
      const id = `PREVIEW-${Date.now()}`;
      const localApplication: StoredApp = {
        id, business: String(form.get('business') || 'New business'), district: String(form.get('district') || 'Pune'), status: 'Submitted',
        department: 'Single Window', submitted: new Date().toISOString().slice(0, 10), dueIn: 15,
        risk: calculateRisk(profile), ownerEmail: previewUser.email,
      };
      persistApps([localApplication, ...applicationsList]);
      setNotice(previewText('localSave'));
      router.push('/applications');
      return;
    }
    setApplicationSubmitting(true);
    try {
      const response = await fetch('/api/applications', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        projectName: String(form.get('business') || 'New business'), projectStage: profile.stage, organizationType: entityType,
        approvalIds: checklist.map((approval) => approval.id), documentIds,
      }) });
      const result = await response.json() as { data?: { id: string }; error?: { message?: string } };
      if (!response.ok || !result.data) throw new Error(result.error?.message || 'Application submission failed');
      setApplicationRefresh((value) => value + 1);
      router.push('/applications');
    } catch {
      setNotice(applicationText('submitFailed'));
    } finally {
      setApplicationSubmitting(false);
    }
  }

  function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedRole = loginRole;
    const preview = previewUserFor(selectedRole);
    window.localStorage.setItem(PREVIEW_ROLE_KEY, selectedRole);
    setPreviewUser(preview);
    window.dispatchEvent(new Event('udyog-mitra-preview-change'));
    setNotice(previewText('active'));
    router.push(selectedRole === 'officer' ? '/officer/dashboard' : selectedRole === 'nodal' ? '/nodal/dashboard' : selectedRole === 'admin' ? '/admin' : '/dashboard');
  }

  async function registerAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: form.get('name'), email: form.get('email'), mobile: form.get('mobile'), otp: form.get('otp'), password: form.get('password') }),
    });
    if (!response.ok) {
      const data = await response.json() as { error?: { code?: string } };
      setNotice(data.error?.code === 'INVALID_INPUT' && form.get('otp') !== '123456' ? t('otpInvalid') : t('registerError'));
      return;
    }
    setNotice(t('registered'));
    router.push('/login');
  }

  async function officerAction(id: string, status: string) {
    const action = status === 'Approved' ? { action: 'approve' as const } : { action: 'reject' as const, reason: 'Illustrative rejection reason.' };
    const response = await fetch(`/api/applications/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(action) });
    if (!response.ok) { setNotice(t('demoAccounts')); return; }
    const result = await response.json() as { data: { status: string } };
    const updated = applicationsList.map((app) => app.id === id ? { ...app, status: result.data.status } : app);
    persistApps(updated);
    setNotice(status === 'Approved' ? t('approved') : t('queryRaised'));
  }

  async function raiseQuery(id: string) {
    const message = window.prompt(t('queryPrompt'));
    if (!message?.trim()) return;
    const response = await fetch(`/api/applications/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'query', deficiencies: [message.trim()] }) });
    if (!response.ok) { setNotice(t('demoAccounts')); return; }
    const result = await response.json() as { data: { status: string } };
    const updated = applicationsList.map((app) => app.id === id ? { ...app, status: result.data.status, query: message.trim() } : app);
    persistApps(updated);
    setNotice(t('queryRaised'));
  }

  function respondToQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = String(new FormData(event.currentTarget).get('response') || '');
    persistApps(applicationsList.map((app) => app.id === selectedApplication ? { ...app, status: 'Query Responded', response } : app));
    setNotice(t('saved'));
  }

  async function uploadDocument(event: FormEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const input = event.currentTarget;
    const validType = ['application/pdf', 'image/jpeg', 'image/png'].includes(file.type);
    if (!validType || file.size > 4 * 1024 * 1024) {
      setNotice(documentText('uploadLimits'));
      input.value = '';
      return;
    }
    if (!session && previewUser) {
      const previewDocument: LocalDocument = {
        reference: `PREVIEW-DOC-${Date.now()}`, name: file.name, size: file.size, status: 'NEEDS_REVIEW',
        type: input.dataset.documentType || 'Supporting document', source: 'manual', simulated: true,
      };
      setDocuments((current) => {
        const next = [previewDocument, ...current];
        saveValue('udyog-mitra-documents', next);
        return next;
      });
      setNotice(previewText('localSave'));
      input.value = '';
      return;
    }
    const form = new FormData();
    form.append('file', file);
    form.append('documentType', input.dataset.documentType || 'Supporting document');
    try {
      const response = await fetch('/api/documents', { method: 'POST', body: form });
      const result = await response.json() as { data?: ApiDocument; error?: { message?: string } };
      if (!response.ok || !result.data) throw new Error(result.error?.message || 'Upload failed');
      setDocuments((current) => [mapApiDocument(result.data!), ...current]);
      setNotice(t('saved'));
    } catch {
      setNotice(t('documentUploadFailed'));
    } finally {
      input.value = '';
    }
  }

  function createGrievance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = [{ id: `GRV-2026-${Math.floor(Math.random() * 89999 + 10000)}`, subject: String(form.get('subject')), status: 'Submitted', created: new Date().toLocaleDateString(locale) }, ...issues];
    setIssues(next);
    saveValue('udyog-mitra-grievances', next);
    setNotice(t('ticketCreated'));
    event.currentTarget.reset();
  }

  const role = session?.user.role ?? previewUser?.role;
  const userEmail = session?.user.email ?? previewUser?.email;
  const previewMode = !session && Boolean(previewUser);
  const shownApplications = applicationsList.filter((app) => {
    if (role === 'applicant' && app.ownerEmail !== userEmail) return false;
    const searchable = `${app.id} ${app.business} ${app.department} ${app.district} ${app.status}`.toLowerCase();
    const matchesSearch = searchable.includes(query.toLowerCase());
    const matchesFilter = filter === 'All' || app.status.toLowerCase().includes(filter.toLowerCase());
    return matchesSearch && matchesFilter;
  });

  const title = pageTitle(route, common, t);
  const requiresSession = ['apply', 'applications', 'track', 'dashboard', 'officer/dashboard', 'nodal/dashboard', 'admin', 'documents', 'inspections', 'grievance', 'notifications', 'profile'].includes(route)
    || route.startsWith('applications/') || route.startsWith('officer/applications/') || route.startsWith('journey/');
  const roleAllowed = previewMode ? true : route.startsWith('officer/') ? ['officer', 'nodal', 'admin'].includes(role ?? '')
    : route.startsWith('nodal/') ? ['nodal', 'admin'].includes(role ?? '')
      : route === 'admin' ? role === 'admin'
        : ['dashboard', 'apply', 'documents', 'profile', 'grievance'].includes(route) ? role === 'applicant'
          : true;

  if (requiresSession && !previewUserLoaded && sessionStatus !== 'authenticated') return <main id="main-content" className="workspace-page"><div className="workspace-wrap narrow"><div className="panel empty-state">{t('signIn')}…</div></div></main>;
  if (requiresSession && sessionStatus === 'loading' && !previewUser) return <main id="main-content" className="workspace-page"><div className="workspace-wrap narrow"><div className="panel empty-state">{t('signIn')}…</div></div></main>;
  if (requiresSession && sessionStatus !== 'authenticated' && !previewUser) return <main id="main-content" className="workspace-page"><div className="workspace-wrap narrow"><WorkspaceHeading title={t('signIn')} intro={t('legal')} /><Link className="button-primary" hrefLocalized="/login">{common('login')} <ArrowRight size={16} /></Link></div></main>;
  if (requiresSession && !roleAllowed) return <main id="main-content" className="workspace-page"><div className="workspace-wrap narrow"><WorkspaceHeading title={t('demoAccounts')} intro={t('legal')} /><Link className="button-primary" hrefLocalized="/login">{t('changeRole')} <ArrowRight size={16} /></Link></div></main>;

  if (route === 'know-your-approvals' || route.startsWith('checklist/')) return <main id="main-content" className="workspace-page"><div className="workspace-wrap"><WorkspaceHeading title={t('titleChecklist')} intro={t('introChecklist')} /><Wizard step={step} setStep={setStep} profile={profile} updateProfile={updateProfile} entityType={entityType} setEntityType={setEntityType} verifiedDocumentCount={documents.filter((document) => document.status === 'VERIFIED').length} documentCount={documents.length} checklistReady={checklistReady} onGenerate={() => { setChecklistReady(true); saveValue('udyog-mitra-profile', profile); saveValue('udyog-mitra-entity-type', entityType); }} checklist={checklist} locale={locale} startApplication={startApplication} t={t} /></div></main>;

  if (route.startsWith('journey/')) return <main id="main-content" className="workspace-page"><div className="workspace-wrap"><WorkspaceHeading title={timelineText('title')} intro={timelineText('intro')} /><JourneyTimeline applicationId={previewMode ? undefined : segments[1]} approvalIds={previewMode ? checklist.map((approval) => approval.id) : []} profile={profile} /></div></main>;

  if (route === 'whatsapp') return <WhatsAppGuide />;

  if (route === 'register') return <main id="main-content" className="workspace-page"><div className="workspace-wrap narrow"><WorkspaceHeading title={common('register')} intro={t('mockOtp')} /><form className="panel form-grid" onSubmit={registerAccount}><label>{t('fullName')}<input name="name" autoComplete="name" minLength={2} required /></label><label>{t('email')}<input type="email" name="email" autoComplete="email" required /></label><label>{t('mobile')}<input name="mobile" inputMode="numeric" autoComplete="tel-national" pattern="[6-9][0-9]{9}" required /></label><label>{t('otp')}<input name="otp" inputMode="numeric" defaultValue="123456" pattern="[0-9]{6}" required /></label><label>{t('password')}<input type="password" name="password" minLength={8} autoComplete="new-password" required /></label><p className="muted small">{t('passwordHint')} {t('mockOtp')}</p><button className="button-primary" type="submit">{t('createAccount')} <ArrowRight size={16} /></button>{notice && <p role="status" className="notice">{notice}</p>}</form></div></main>;

  if (route === 'login') return <main id="main-content" className="workspace-page"><div className="workspace-wrap narrow"><WorkspaceHeading title={t('signIn')} intro={previewText('loginIntro')} /><form className="panel form-grid" onSubmit={signIn}><label>{t('role')}<select name="role" value={loginRole} onChange={(event) => setLoginRole(event.target.value as DemoUser['role'])}><option value="applicant">{t('applicant')}</option><option value="officer">{t('officer')}</option><option value="nodal">{t('nodal')}</option><option value="admin">{t('admin')}</option></select></label><button className="button-primary" type="submit">{t('continue')} <ArrowRight size={16} /></button>{notice && <p role="status" className="notice">{notice}</p>}</form><p className="muted small">{t('legal')}</p></div></main>;

  if (route === 'apply') return <main id="main-content" className="workspace-page"><div className="workspace-wrap"><WorkspaceHeading title={t('submitApplication')} intro={t('legal')} /><ApplicationForm onSubmit={saveAndSubmitApplication} errors={formErrors} documents={documents} onUpload={uploadDocument} organizationType={entityType} submitting={applicationSubmitting} t={t} /><p aria-live="polite" className="notice">{notice}</p></div></main>;

  if (route === 'applications' || route === 'track' || route === 'dashboard' || route === 'officer/dashboard' || route === 'nodal/dashboard' || route === 'admin') {
    const isOfficer = Boolean(session && ['officer', 'nodal', 'admin'].includes(role ?? ''));
    return <main id="main-content" className="workspace-page"><div className="workspace-wrap"><WorkspaceHeading title={title} intro={route === 'dashboard' ? t('nextAction') : t('notOfficial')} />
      {route === 'dashboard' && <ApplicantOverview applications={applicationsList.filter((application) => application.ownerEmail === userEmail)} t={t} />}
      {(route === 'officer/dashboard' || route === 'nodal/dashboard' || route === 'admin') && <AnalyticsOverview t={t} />}
      {session && (route === 'nodal/dashboard' || route === 'admin') && <ManualVerificationQueue />}
      <div className="toolbar"><label className="search-field"><Search size={17} /><input aria-label={t('search')} placeholder={t('search')} value={query} onChange={(event) => { setQuery(event.target.value); setApplicationPage(1); }} /></label><label>{t('filter')} <select value={filter} onChange={(event) => { setFilter(event.target.value); setApplicationPage(1); }}><option value="All">{t('all')}</option><option>Submitted</option><option>Under Scrutiny</option><option>Query Raised</option><option>Approved</option><option>Rejected</option></select></label><Link className="button-primary" hrefLocalized="/know-your-approvals">{t('newApplication')} <ArrowRight size={15} /></Link></div>
      {applicationsLoading && <p className="muted" role="status">{applicationText('loadingApplications')}</p>}
      {applicationsError && <div className="insight" role="alert"><CircleAlert /><span>{applicationText('applicationsUnavailable')}</span><button className="button-quiet" onClick={() => setApplicationRefresh((value) => value + 1)}>{timelineText('retry')}</button></div>}
      {!applicationsLoading && !applicationsError && <ApplicationTable rows={route === 'dashboard' ? shownApplications.slice(0, 8) : shownApplications} officer={isOfficer} onApprove={officerAction} onQuery={raiseQuery} t={t} />}
      {applicationPageCount > 1 && <nav className="table-pagination" aria-label={t('applications')}><button className="button-quiet" disabled={applicationPage <= 1 || applicationsLoading} onClick={() => setApplicationPage((value) => value - 1)}><ArrowLeft size={15} />{t('back')}</button><span>{applicationText('pageOf', { page: applicationPage, total: applicationPageCount })}</span><button className="button-quiet" disabled={applicationPage >= applicationPageCount || applicationsLoading} onClick={() => setApplicationPage((value) => value + 1)}>{t('next')}<ArrowRight size={15} /></button></nav>}
      {route === 'dashboard' && <section className="panel"><h2>{t('nextAction')}</h2><p>{applicationsList.some((app) => app.status === 'Query Raised') ? t('respond') : t('titleChecklist')}</p><Link className="button-quiet" hrefLocalized={applicationsList.some((app) => app.status === 'Query Raised') ? '/applications' : '/know-your-approvals'}>{t('open')} <ArrowRight size={15} /></Link></section>}
    </div></main>;
  }

  if (route.startsWith('applications/') || route.startsWith('officer/applications/')) {
    const id = segments.at(-1);
    const app = shownApplications.find((item) => item.id === id);
    if (!app) return <main id="main-content" className="workspace-page"><div className="workspace-wrap narrow"><WorkspaceHeading title={t('noRecords')} intro={t('legal')} /></div></main>;
    return <main id="main-content" className="workspace-page"><div className="workspace-wrap"><WorkspaceHeading title={app?.id ?? t('applications')} intro={`${app?.business ?? ''} · ${app?.status ?? ''}`} /><div className="two-column"><section className="panel"><h2>{t('stageTimeline')}</h2><ol className="status-timeline">{['Draft', 'Submitted', 'Under Scrutiny', 'Query Raised', 'Approved'].map((status) => <li key={status} data-active={status === app?.status}>{status}</li>)}</ol><p>{t('risk')}: {app?.risk}/100</p><p>{t('due')}: {app?.dueIn} days</p><Link hrefLocalized={`/journey/${app.id}`} className="button-quiet">{timelineText('viewJourney')} <ArrowRight size={15} /></Link></section><section className="panel"><h2>{t('documents')}</h2>{app?.status === 'Query Raised' ? <form className="form-grid" onSubmit={respondToQuery}><p>{app.query}</p><label>{t('response')}<textarea name="response" required rows={4} /></label><button className="button-primary">{t('send')}</button></form> : <><p>{t('legal')}</p><Link hrefLocalized="/apply" className="button-quiet">{t('open')}</Link></>}</section></div></div></main>;
  }

  if (route === 'documents') return <main id="main-content" className="workspace-page"><div className="workspace-wrap"><WorkspaceHeading title={t('documents')} intro={documentText('uploadLimits')} /><DocumentPanel documents={documents} onUpload={uploadDocument} previewMode={previewMode} onImported={(document) => setDocuments((current) => { const next = [mapApiDocument(document), ...current]; if (previewMode) saveValue('udyog-mitra-documents', next); return next; })} t={t} /></div></main>;

  if (route === 'incentives' || route.startsWith('schemes')) return <main id="main-content" className="workspace-page"><div className="workspace-wrap"><WorkspaceHeading title={t('schemes')} intro={t('notOfficial')} /><div className="record-grid">{schemes.map((scheme) => <article className="panel scheme-card" key={scheme.id}><span className="section-kicker">{t('notOfficial')}</span><h2>{scheme.name[locale]}</h2><p>{scheme.description[locale]}</p><strong>{t('benefit')}: {scheme.benefit}</strong><p className="muted">{t('eligible')}: {scheme.tags.join(', ')}</p><button className="button-quiet" onClick={() => setNotice(t('schemeClaimed'))}>{t('applyScheme')} <ArrowRight size={15} /></button></article>)}</div>{notice && <p role="status" className="notice">{notice}</p>}</div></main>;

  if (route === 'knowledge' || route.startsWith('knowledge/')) {
    const filtered = knowledgeArticles.filter((article) => `${article.title[locale]} ${article.category} ${article.tags.join(' ')}`.toLowerCase().includes(articlesSearch.toLowerCase()));
    const article = segments[1] ? knowledgeArticles.find((item) => item.slug === segments[1]) : null;
    return <main id="main-content" className="workspace-page"><div className="workspace-wrap"><WorkspaceHeading title={t('knowledge')} intro={t('guidanceOnly')} />{article ? <article className="panel article-body"><span className="section-kicker">{article.category}</span><h2>{article.title[locale]}</h2><p>{article.title[locale]}. {t('guidanceOnly')} {t('legal')}</p><Link className="button-quiet" hrefLocalized="/knowledge"><ArrowLeft size={15} />{t('back')}</Link></article> : <><label className="search-field full"><Search size={17} /><input value={articlesSearch} onChange={(event) => setArticlesSearch(event.target.value)} placeholder={t('articleSearch')} /></label><div className="record-grid">{filtered.map((item) => <Link hrefLocalized={`/knowledge/${item.slug}`} className="panel article-card" key={item.slug}><span className="section-kicker">{item.category}</span><h2>{item.title[locale]}</h2><span className="service-arrow">{t('showMore')} <ArrowRight size={14} /></span></Link>)}</div></>}</div></main>;
  }

  if (route === 'grievance' || route.startsWith('grievance/')) return <main id="main-content" className="workspace-page"><div className="workspace-wrap"><WorkspaceHeading title={t('grievance')} intro={t('legal')} /><form className="panel form-grid" onSubmit={createGrievance}><label>{t('category')}<select name="category"><option>Service delay</option><option>Application query</option><option>Officer conduct</option><option>Other</option></select></label><label>{t('department')}<select name="department">{departments.map((department) => <option key={department}>{department}</option>)}</select></label><label>{t('subject')}<input name="subject" required maxLength={120} /></label><label>{t('description')}<textarea name="description" required rows={4} maxLength={1000} /></label><button className="button-primary">{t('createTicket')} <ArrowRight size={15} /></button></form><div className="record-list">{issues.map((issue) => <div className="record-row" key={issue.id}><span>{issue.id}</span><strong>{issue.subject}</strong><span className="status-pill">{issue.status}</span><span>{issue.created}</span></div>)}</div>{notice && <p role="status" className="notice">{notice}</p>}</div></main>;

  if (route === 'inspections') return <main id="main-content" className="workspace-page"><div className="workspace-wrap"><WorkspaceHeading title={t('inspectionPlanner')} intro={t('notOfficial')} /><div className="record-grid">{applicationsList.filter((app) => ['Inspection Scheduled', 'Under Scrutiny'].includes(app.status)).slice(0, 8).map((app, index) => <article className="panel inspection-card" key={app.id}><span className="section-kicker">{app.department}</span><h2>{app.business}</h2><p>{app.id} · {app.district}</p><p><Clock3 size={15} /> {new Date(Date.now() + (index + 1) * 86400000).toLocaleDateString(locale)}</p><button className="button-quiet" onClick={() => setNotice(t('visitAccepted'))}>{t('acceptSlot')}</button></article>)}</div>{notice && <p role="status" className="notice">{notice}</p>}</div></main>;

  if (route === 'notifications') return <main id="main-content" className="workspace-page"><div className="workspace-wrap"><WorkspaceHeading title={t('notifications')} intro={t('saved')} /><div className="record-list">{applicationsList.filter((app) => ['Query Raised', 'Inspection Scheduled', 'Approved'].includes(app.status)).slice(0, 12).map((app) => <div className="record-row" key={app.id}><Bell /><span>{app.id}: {app.status}</span><Link className="service-arrow" hrefLocalized={`/applications/${app.id}`}>{t('open')} <ArrowRight size={14} /></Link></div>)}</div></div></main>;

  if (route === 'profile') return <main id="main-content" className="workspace-page"><div className="workspace-wrap narrow"><WorkspaceHeading title={t('profile')} intro={t('legal')} /><form className="panel form-grid" onSubmit={(event) => { event.preventDefault(); saveValue('udyog-mitra-profile', profile); setNotice(t('saved')); }}><label>{t('legalName')}<input defaultValue="Sahyadri Foods Pvt Ltd" /></label><label>{t('activity')}<select value={profile.activity} onChange={(event) => updateProfile('activity', event.target.value as ProjectProfile['activity'])}><option value="manufacturing">{t('manufacturing')}</option><option value="service">{t('service')}</option><option value="trading">{t('trading')}</option></select></label><label>{t('investment')}<input type="number" value={profile.investmentLakhs} onChange={(event) => updateProfile('investmentLakhs', Number(event.target.value))} /></label><label>{t('employees')}<input type="number" value={profile.employees} onChange={(event) => updateProfile('employees', Number(event.target.value))} /></label><button className="button-primary">{t('save')}</button></form><p role="status" className="notice">{notice}</p></div></main>;

  if (route.startsWith('verify/')) return <main id="main-content" className="workspace-page"><div className="workspace-wrap narrow"><WorkspaceHeading title={t('certificateLookup')} intro={t('notOfficial')} /><section className="panel"><label>{t('certificateId')}<input value={certificateId || segments[1] || ''} onChange={(event) => setCertificateId(event.target.value)} /></label>{CERTIFICATES.includes(certificateId || segments[1]) ? <p className="verified-record"><ShieldCheck />{t('verifiedCertificate')} · {certificateId || segments[1]}</p> : <p className="muted">{t('notFound')}</p>}</section></div></main>;

  if (['about', 'contact', 'accessibility', 'privacy', 'terms', 'sitemap'].includes(route)) return <main id="main-content" className="workspace-page"><div className="workspace-wrap narrow"><WorkspaceHeading title={title} intro={route === 'contact' ? t('contact') : t('legal')} /><section className="panel article-body"><p>{t('legal')}</p><p>{common('prototype')}</p>{route === 'contact' && <p>{t('phone')}: 1800-000-2026 · {t('emailUs')}: support@udyogmitra.demo</p>}{route === 'sitemap' && <div className="record-grid compact">{['know-your-approvals', 'apply', 'applications', 'documents', 'inspections', 'incentives', 'grievance', 'knowledge', 'dashboard', 'officer/dashboard', 'admin'].map((item) => <Link className="button-quiet" hrefLocalized={`/${item}`} key={item}>{item.replaceAll('/', ' · ')}</Link>)}</div>}</section></div></main>;

  return <main id="main-content" className="workspace-page"><div className="workspace-wrap narrow"><WorkspaceHeading title="404" intro={t('noRecords')} /><Link hrefLocalized="/" className="button-primary">{t('backHome')} <ArrowRight size={15} /></Link></div></main>;
}

function pageTitle(route: string, common: ReturnType<typeof useTranslations>, t: ReturnType<typeof useTranslations>) {
  if (route.startsWith('officer/')) return t('officer');
  if (route.startsWith('nodal/')) return t('nodal');
  if (route === 'admin') return t('admin');
  if (route === 'applications' || route === 'track') return common(route === 'track' ? 'track' : 'apply');
  if (route === 'dashboard') return t('dashboard');
  if (route === 'about') return t('about');
  if (route === 'contact') return t('contact');
  if (route === 'incentives' || route.startsWith('schemes')) return t('schemes');
  if (route === 'knowledge' || route.startsWith('knowledge/')) return t('knowledge');
  if (route === 'grievance' || route.startsWith('grievance/')) return t('grievance');
  if (route === 'inspections') return t('inspectionPlanner');
  if (route === 'documents') return t('documents');
  if (route === 'notifications') return t('notifications');
  if (route === 'profile') return t('profile');
  if (route.startsWith('verify/')) return t('certificateLookup');
  if (route === 'privacy' || route === 'terms') return t('privacy');
  if (route === 'accessibility') return common('screenReader');
  if (route === 'sitemap') return common('home');
  return common('contact');
}

function WorkspaceHeading({ title, intro }: { title: string; intro: string }) {
  return <header className="workspace-heading"><span className="section-kicker">UDYOG MITRA · PROTOTYPE</span><h1>{title}</h1><p>{intro}</p></header>;
}

function Wizard({ step, setStep, profile, updateProfile, entityType, setEntityType, verifiedDocumentCount, documentCount, checklistReady, onGenerate, checklist, locale, startApplication, t }: {
  step: number; setStep: (step: number) => void; profile: ProjectProfile; updateProfile: <K extends keyof ProjectProfile>(key: K, value: ProjectProfile[K]) => void;
  entityType: string; setEntityType: (entityType: string) => void; verifiedDocumentCount: number; documentCount: number;
  checklistReady: boolean; onGenerate: () => void; checklist: typeof approvals; locale: 'en' | 'mr' | 'hi'; startApplication: () => void; t: ReturnType<typeof useTranslations>;
}) {
  const registrationText = useTranslations('Registration');
  const stageLabel: Record<string, string> = { Planning: t('planning'), 'Pre-establishment': t('preEstablishment'), 'Pre-operation': t('preOperation'), Operational: t('operational') };
  const grouped = ['Planning', 'Pre-establishment', 'Pre-operation', 'Operational'].map((stage) => ({ stage, items: checklist.filter((item) => item.stage === stage) })).filter((group) => group.items.length);
  const journeyDays = grouped.reduce((sum, group) => sum + Math.max(...group.items.map((item) => item.days)), 0);
  return <div className="wizard-layout"><aside className="wizard-progress panel"><span>{t('project')}</span>{[t('activity'), t('sector'), t('estimated')].map((label, index) => <button className={step === index ? 'active' : ''} onClick={() => setStep(index)} key={label}><span>{index + 1}</span>{label}</button>)}</aside><section className="panel wizard-panel">
    {!checklistReady ? <><div className="progress-track"><span style={{ width: `${((step + 1) / 3) * 100}%` }} /></div><h2>{step === 0 ? t('activity') : step === 1 ? t('sector') : t('project')}</h2>
      {step === 0 && <div className="form-grid two"><label>{t('activity')}<select value={profile.activity} onChange={(event) => updateProfile('activity', event.target.value as ProjectProfile['activity'])}><option value="manufacturing">{t('manufacturing')}</option><option value="service">{t('service')}</option><option value="trading">{t('trading')}</option></select></label><label>{t('sector')}<select value={profile.sector} onChange={(event) => updateProfile('sector', event.target.value)}><option value="Green">{t('green')}</option><option value="Orange">{t('orange')}</option><option value="Red">{t('red')}</option></select></label><label>{t('stage')}<select value={profile.stage} onChange={(event) => updateProfile('stage', event.target.value)}><option>Planning</option><option>Pre-establishment</option><option>Pre-operation</option><option>Operational</option></select></label><label>{t('land')}<select value={profile.landType} onChange={(event) => updateProfile('landType', event.target.value)}><option value="MIDC">{t('midc')}</option><option value="Non-MIDC">{t('nonMidc')}</option><option value="Municipal">{t('municipal')}</option></select></label></div>}
      {step === 1 && <div className="form-grid two"><label>{t('investment')}<input type="number" min="0" value={profile.investmentLakhs} onChange={(event) => updateProfile('investmentLakhs', Number(event.target.value))} /></label><label>{t('employees')}<input type="number" min="0" value={profile.employees} onChange={(event) => updateProfile('employees', Number(event.target.value))} /></label><label>{t('power')}<input type="number" min="0" value={profile.powerKw} onChange={(event) => updateProfile('powerKw', Number(event.target.value))} /></label><label>{t('water')}<input type="number" min="0" value={profile.waterKld} onChange={(event) => updateProfile('waterKld', Number(event.target.value))} /></label></div>}
      {step === 2 && <div className="form-grid"><label>{registrationText('entityType')}<select value={entityType} onChange={(event) => setEntityType(event.target.value)}>{registrationCatalog.filter((entry) => entry.group === 'entity').map((entry) => <option key={entry.id} value={entry.id}>{entry.name[locale]}</option>)}</select></label><label className="check-row"><input type="checkbox" checked={profile.hazardous} onChange={(event) => updateProfile('hazardous', event.target.checked)} />{t('hazardous')}</label><p className="muted">{t('introChecklist')}</p></div>}
      <div className="form-actions">{step > 0 && <button className="button-quiet" onClick={() => setStep(step - 1)}><ArrowLeft size={15} />{t('back')}</button>}{step < 2 ? <button className="button-primary" onClick={() => setStep(step + 1)}>{t('next')} <ArrowRight size={15} /></button> : <button className="button-primary" onClick={onGenerate}>{t('generate')} <ArrowRight size={15} /></button>}</div>
    </> : <><div className="result-heading"><div><span className="section-kicker">{t('notOfficial')}</span><h2>{t('checklist')}</h2></div><span className="estimate-pill"><Clock3 size={15} /> {t('estimated')}: {journeyDays} {t('days')}</span></div><p className="muted">{t('guidanceOnly')}</p><div className="timeline-groups">{grouped.map((group) => <section className="stage-group" key={group.stage}><h3>{stageLabel[group.stage]}</h3>{group.items.map((item) => <article className="approval-row" key={item.id}><div className="approval-main"><h4>{item.name[locale]}</h4><span>{t('authority')}: {item.department}</span><p>{t('why')}: {item.name[locale]} for {profile.activity} at the {stageLabel[item.stage].toLowerCase()} stage.</p><small>{t('documents')}: {item.documents[0][locale]}</small></div><div className="approval-meta"><span>{item.days} {t('days')}</span><span>₹{item.fee.toLocaleString(locale)}*</span></div></article>)}</section>)}</div><p className="prototype-note">* {t('notOfficial')} · {t('guidanceOnly')}</p><RegistrationPathway entityType={entityType} profile={profile} registrationCount={checklist.length} verifiedDocumentCount={verifiedDocumentCount} documentCount={documentCount} locale={locale} t={registrationText} /><JourneyTimeline approvalIds={checklist.map((item) => item.id)} profile={profile} /><button className="button-primary" onClick={startApplication}>{t('newApplication')} <ArrowRight size={16} /></button></>}
  </section></div>;
}

function RegistrationPathway({ entityType, profile, registrationCount, verifiedDocumentCount, documentCount, locale, t }: {
  entityType: string; profile: ProjectProfile; registrationCount: number; verifiedDocumentCount: number; documentCount: number;
  locale: 'en' | 'mr' | 'hi'; t: ReturnType<typeof useTranslations>;
}) {
  const entity = registrationCatalog.find((entry) => entry.id === entityType) ?? registrationCatalog.find((entry) => entry.group === 'entity')!;
  const estimate = estimateRegistrationTimeline({
    registrations: registrationCount,
    complexity: Math.min(1, entity.complexity + registrationCount * .015),
    sectorRisk: profile.sector === 'Red' ? 1 : profile.sector === 'Orange' ? .5 : 0,
    documentsReady: documentCount ? verifiedDocumentCount / documentCount : 0,
    identityVerified: false,
  });
  const groups = ['entity', 'general', 'sector'] as const;
  return <section className="panel registration-pathway"><div className="timeline-heading"><div><span className="section-kicker">{t('title')}</span><h2>{entity.name[locale]}</h2></div><span className="estimate-pill">{estimate.minimumDays}–{estimate.maximumDays} {t('days')}</span></div><p>{entity.summary[locale]}</p><p><strong>{t('requiredDocuments')}:</strong> {entity.documents[0][locale]}</p><p><strong>{t('authority')}:</strong> {entity.authority} · <a href={entity.officialUrl} target="_blank" rel="noreferrer">{t('officialPortal')}</a></p><p className="muted small">{t('estimateNotice')} {t(estimate.confidence === 'medium' ? 'mediumConfidence' : 'lowConfidence')}</p><details><summary>{t('catalog')}</summary>{groups.map((group) => <details key={group}><summary>{t(`${group}Group`)}</summary><div className="timeline-groups">{registrationCatalog.filter((entry) => entry.group === group).map((entry) => <article className="approval-row" key={entry.id}><div className="approval-main"><h4>{entry.name[locale]}</h4><p>{entry.summary[locale]}</p><small>{t('requiredDocuments')}: {entry.documents[0][locale]}</small></div><a href={entry.officialUrl} target="_blank" rel="noreferrer">{t('officialPortal')} ↗</a></article>)}</div></details>)}</details></section>;
}

function DocumentPanel({ documents, onUpload, previewMode, onImported, t }: {
  documents: LocalDocument[]; onUpload: (event: FormEvent<HTMLInputElement>) => void;
  previewMode: boolean;
  onImported: (document: ApiDocument) => void; t: ReturnType<typeof useTranslations>;
}) {
  const dt = useTranslations('Documents');
  const [documentType, setDocumentType] = useState('supporting-document');
  const [remoteDocuments, setRemoteDocuments] = useState<RemoteDigiLockerDocument[]>([]);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/documents/digilocker', { signal: controller.signal, cache: 'no-store' }).then(async (response) => {
      if (!response.ok) return;
      const result = await response.json() as { data?: { granted: boolean; documents: RemoteDigiLockerDocument[] } };
      if (!controller.signal.aborted && result.data) {
        setConnected(result.data.granted);
        setRemoteDocuments(result.data.documents);
      }
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);

  async function loadDemoDocuments() {
    const response = await fetch('/api/documents/digilocker', { cache: 'no-store' });
    const result = await response.json() as { data?: { granted: boolean; documents: RemoteDigiLockerDocument[] } };
    if (!response.ok || !result.data) throw new Error('DigiLocker unavailable');
    setConnected(result.data.granted);
    setRemoteDocuments(result.data.documents);
  }

  async function connectDemo() {
    setBusy(true);
    setError(false);
    if (previewMode) {
      setConnected(true);
      setRemoteDocuments([{ reference: 'PREVIEW-DL-PAN', documentType: 'pan', displayName: `${dt('pan')} (sample)`, issuer: 'Sample issuer', expiresAt: null, maskedIdentifier: 'XXXX-XXXX', simulated: true }]);
      setBusy(false);
      return;
    }
    try {
      const response = await fetch('/api/documents/digilocker', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'grant' }) });
      if (!response.ok) throw new Error('Consent failed');
      await loadDemoDocuments();
    } catch { setError(true); }
    finally { setBusy(false); }
  }

  async function revokeDemo() {
    setBusy(true);
    setError(false);
    if (previewMode) {
      setConnected(false);
      setRemoteDocuments([]);
      setBusy(false);
      return;
    }
    try {
      const response = await fetch('/api/documents/digilocker', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'revoke' }) });
      if (!response.ok) throw new Error('Consent revocation failed');
      setConnected(false);
      setRemoteDocuments([]);
    } catch { setError(true); }
    finally { setBusy(false); }
  }

  async function importDemoDocument(reference: string) {
    setBusy(true);
    setError(false);
    if (previewMode) {
      const sample = remoteDocuments.find((document) => document.reference === reference);
      if (sample) onImported({
        reference: `PREVIEW-${reference}-${Date.now()}`, documentType: sample.documentType, displayName: sample.displayName,
        status: 'SIMULATED_SOURCE_MATCH_NEEDS_REVIEW', source: 'digilocker', simulated: true, sourceMatch: true,
        sourceVerified: false, mimeType: 'application/pdf', byteSize: 1024,
      });
      setRemoteDocuments((current) => current.filter((document) => document.reference !== reference));
      setBusy(false);
      return;
    }
    try {
      const response = await fetch('/api/documents/digilocker', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'import', reference }) });
      const result = await response.json() as { data?: ApiDocument };
      if (!response.ok || !result.data) throw new Error('Import failed');
      onImported(result.data);
      setRemoteDocuments((current) => current.filter((document) => document.reference !== reference));
    } catch { setError(true); }
    finally { setBusy(false); }
  }

  return <div className="document-workspace"><section className="panel form-grid"><h2>{dt('uploadTitle')}</h2><label>{dt('documentType')}<select value={documentType} onChange={(event) => setDocumentType(event.target.value)}><option value="supporting-document">{dt('supportingDocument')}</option><option value="pan">{dt('pan')}</option><option value="business-registration">{dt('businessRegistration')}</option><option value="tax-registration">{dt('taxRegistration')}</option><option value="premises-proof">{dt('premisesProof')}</option><option value="other">{dt('other')}</option></select></label><label className="upload-inline"><Upload size={17} />{t('upload')}<input type="file" accept=".pdf,.jpg,.jpeg,.png" data-document-type={documentType} onChange={onUpload} /></label><p className="muted small">{dt('uploadNotice')}</p></section>
    <section className="panel form-grid"><h2>{dt('digilockerTitle')}</h2><p>{dt('digilockerNotice')}</p>{connected ? <><button className="button-quiet" onClick={() => void revokeDemo()} disabled={busy}>{dt('revokeConsent')}</button>{remoteDocuments.map((document) => <div className="record-row" key={document.reference}><FileText size={16} /><span>{document.displayName} · {document.maskedIdentifier ?? document.issuer}</span><button className="button-quiet" onClick={() => void importDemoDocument(document.reference)} disabled={busy}>{dt('importDocument')}</button></div>)}{!remoteDocuments.length && <p className="muted small">{dt('noRemoteDocuments')}</p>}</> : <button className="button-primary" onClick={() => void connectDemo()} disabled={busy}>{dt('connectDemo')}</button>}{error && <p className="error-list" role="alert">{dt('connectorError')}</p>}</section>
    <section className="panel"><h2>{t('documents')}</h2>{documents.length ? <div className="record-list">{documents.map((document) => <article className="document-record" key={document.reference}><div className="record-row"><FileText /><span>{document.name}</span><span>{document.source === 'digilocker' ? dt('digilockerSource') : dt('manualSource')}</span><span className={`status-pill ${document.status === 'VERIFIED' ? 'success' : 'warning'}`}>{document.status === 'VERIFIED' ? document.simulated ? dt('verifiedDemo') : dt('verified') : document.status === 'REJECTED' ? dt('rejected') : document.simulated ? dt('demoReview') : dt('needsReview')}</span><span>{(document.size / 1024).toFixed(0)} KB</span></div>{document.verification && <p className="muted small">{dt('officeVisit')}: {document.verification.officeName ?? dt('notRecorded')}{document.verification.visitAt ? ` · ${new Date(document.verification.visitAt).toLocaleDateString()}` : ''}{document.verification.note ? ` · ${document.verification.note}` : ''}</p>}</article>)}</div> : <p className="muted small">{dt('empty')}</p>}</section></div>;
}

type ReviewItem = { documentId: string; fileName: string; documentType: string; status: string; source: string; simulated: boolean; sourceMatch: boolean; submittedAt: string; ownerName: string };

function ManualVerificationQueue() {
  const t = useTranslations('Review');
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/documents/review', { signal: controller.signal, cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error('Review queue unavailable');
      const result = await response.json() as { data: ReviewItem[] };
      if (!controller.signal.aborted) setItems(result.data);
    }).catch(() => { if (!controller.signal.aborted) setError(true); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  async function submitReview(event: FormEvent<HTMLFormElement>, documentId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const visitAt = String(form.get('visitAt') || '');
    setBusyId(documentId);
    setError(false);
    try {
      const response = await fetch('/api/documents/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        documentId, status: form.get('status'), officeName: form.get('officeName'), reference: form.get('reference'), note: form.get('note'),
        ...(visitAt ? { visitAt: new Date(visitAt).toISOString() } : {}),
      }) });
      if (!response.ok) throw new Error('Review could not be saved');
      setItems((current) => current.filter((item) => item.documentId !== documentId));
    } catch { setError(true); }
    finally { setBusyId(''); }
  }

  return <section className="panel review-queue"><div className="timeline-heading"><div><span className="section-kicker">{t('manual')}</span><h2>{t('title')}</h2></div><span className="estimate-pill">{items.length}</span></div><p className="muted small">{t('intro')}</p>{loading && <p role="status">{t('loading')}</p>}{error && <p className="error-list" role="alert">{t('error')}</p>}{!loading && !items.length && !error && <p className="muted small">{t('empty')}</p>}
    {items.map((item) => <details className="review-item" key={item.documentId}><summary><span>{item.fileName}</span><span>{item.ownerName}</span><span className="status-pill warning">{item.status}</span></summary><p className="muted small">{item.documentType} · {item.source}{item.sourceMatch || item.simulated ? ` · ${t('sampleWarning')}` : ''} · {new Date(item.submittedAt).toLocaleDateString()}</p><form className="form-grid" onSubmit={(event) => void submitReview(event, item.documentId)}><div className="form-grid two"><label>{t('decision')}<select name="status"><option value="VERIFIED">{t('verified')}</option><option value="REJECTED">{t('rejected')}</option></select></label><label>{t('office')}<input name="officeName" minLength={2} maxLength={160} required /></label><label>{t('visitAt')}<input type="datetime-local" name="visitAt" /></label><label>{t('reference')}<input name="reference" maxLength={120} /></label></div><label>{t('note')}<textarea name="note" minLength={10} maxLength={1000} rows={3} required /></label><button className="button-primary" type="submit" disabled={busyId === item.documentId}>{busyId === item.documentId ? t('saving') : t('recordVisit')}</button></form></details>)}
  </section>;
}

function ApplicationTable({ rows, officer, onApprove, onQuery, t }: { rows: StoredApp[]; officer: boolean; onApprove: (id: string, status: string) => void; onQuery: (id: string) => void; t: ReturnType<typeof useTranslations> }) {
  if (!rows.length) return <div className="panel empty-state"><CircleAlert /><p>{t('noRecords')}</p></div>;
  return <div className="table-wrap panel"><table><thead><tr><th>{t('appId')}</th><th>{t('businessName')}</th><th>{t('department')}</th><th>{t('district')}</th><th>{t('status')}</th><th>{t('due')}</th><th>{t('actions')}</th></tr></thead><tbody>{rows.map((app) => <tr key={app.id}><td><Link className="table-link" hrefLocalized={`/applications/${app.id}`}>{app.id}</Link></td><td>{app.business}</td><td>{app.department}</td><td>{app.district}</td><td><span className={`status-pill ${app.status === 'Query Raised' ? 'warning' : app.status === 'Approved' ? 'success' : ''}`}>{app.status}</span></td><td>{app.dueIn < 0 ? t('breached') : `${app.dueIn} d`}</td><td><div className="table-actions"><Link className="icon-action" hrefLocalized={`/applications/${app.id}`} aria-label={t('open')} title={t('open')}><ArrowRight size={15} /></Link>{officer && app.status !== 'Approved' && <><button className="icon-action success" onClick={() => onApprove(app.id, 'Approved')} title={t('approve')} aria-label={t('approve')}><Check size={15} /></button><button className="icon-action warning" onClick={() => onQuery(app.id)} title={t('raiseQuery')} aria-label={t('raiseQuery')}><CircleAlert size={15} /></button></>}</div></td></tr>)}</tbody></table></div>;
}

function ApplicantOverview({ applications, t }: { applications: StoredApp[]; t: ReturnType<typeof useTranslations> }) {
  const queryCount = applications.filter((app) => app.status === 'Query Raised').length;
  return <><div className="metric-grid"><Metric value={applications.length} label={t('applications')} /><Metric value={applications.filter((app) => app.status === 'Approved').length} label={t('approved')} /><Metric value={queryCount} label={t('queryRaised')} /><Metric value={applications.filter((app) => app.dueIn <= 3).length} label={t('atRisk')} /></div><div className="panel next-action"><span className="service-icon"><Bell size={20} /></span><div><strong>{t('nextAction')}</strong><p>{queryCount ? t('respond') : t('titleChecklist')}</p></div><Link className="button-quiet" hrefLocalized={queryCount ? '/applications' : '/know-your-approvals'}>{t('open')} <ArrowRight size={15} /></Link></div></>;
}

function AnalyticsOverview({ t }: { t: ReturnType<typeof useTranslations> }) {
  const chartData = departments.slice(0, 6).map((department, index) => ({ department, applications: [42, 34, 28, 22, 18, 14][index], breaches: [12, 8, 5, 9, 3, 4][index] }));
  return <><div className="metric-grid"><Metric value="30" label={t('totalApplications')} /><Metric value="18 d" label={t('averageDays')} /><Metric value="6" label={t('breaches')} /><Metric value="28%" label={t('queryRate')} /></div><section className="panel chart-panel"><div><h2>{t('analytics')}</h2><p className="muted">{t('notOfficial')}</p></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 12, right: 12, bottom: 32, left: -16 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="department" angle={-25} textAnchor="end" interval={0} tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="applications" fill="#0b527d" radius={[4, 4, 0, 0]} /><Bar dataKey="breaches" fill="#e88424" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></section><aside className="insight"><CircleAlert /><div><strong>{t('insight')}</strong><p>{t('insightText')}</p></div></aside></>;
}

function Metric({ value, label }: { value: string | number; label: string }) {
  return <div className="metric panel"><strong>{value}</strong><span>{label}</span></div>;
}

type LocalizedLinkProps = Omit<ComponentProps<'a'>, 'href'> & { hrefLocalized: string };
function Link({ hrefLocalized, ...props }: LocalizedLinkProps) {
  return <LocaleLink href={hrefLocalized as never} {...props} />;
}

function ApplicationForm({ onSubmit, errors, documents, onUpload, organizationType, submitting, t }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void; errors: string[]; documents: LocalDocument[]; onUpload: (event: FormEvent<HTMLInputElement>) => void; organizationType: string; submitting: boolean; t: ReturnType<typeof useTranslations> }) {
  const documentText = useTranslations('Documents');
  const applicationText = useTranslations('Applications');
  return <form className="application-form" onSubmit={onSubmit}><input type="hidden" name="organizationType" value={organizationType} />
    <div className="readiness-panel panel"><ShieldCheck /><div><strong>{t('readiness')}: {Math.max(0, 100 - errors.length * 18)}%</strong><span>{errors.length ? t('fixList') : t('readinessReady')}</span></div></div>
    <div className="two-column">
      <section className="panel form-grid two"><h2>{t('profile')}</h2><label>{t('legalName')}<input name="business" defaultValue="Sahyadri Foods Pvt Ltd" required /></label><label>{t('district')}<select name="district"><option>Pune</option><option>Nashik</option><option>Nagpur</option><option>Kolhapur</option><option>Raigad</option></select></label><label>{t('pan')}<input name="pan" defaultValue="ABCDE1234F" required /></label><label>{t('mobile')}<input name="mobile" defaultValue="9876543210" required /></label><label>{t('pincode')}<input name="pincode" defaultValue="411001" required /></label><label>GSTIN<input name="gstin" defaultValue="27ABCDE1234F1Z5" /></label><label>{t('investment')}<input type="number" name="investment" defaultValue="180" /></label><label>{t('msme')}<select name="msme"><option value="Micro">Micro</option><option value="Small">Small</option><option value="Medium">Medium</option><option value="Not MSME">Not MSME</option></select></label><label>{t('plotArea')}<input type="number" name="plot" defaultValue="1000" /></label><label>{t('builtUpArea')}<input type="number" name="built" defaultValue="700" /></label></section>
      <section className="panel form-grid"><h2>{t('documents')}</h2><label className="upload-inline"><Upload size={17} />{t('upload')}<input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={onUpload} /></label><p className="muted small">{documentText('uploadLimits')}</p><fieldset className="saved-document-list"><legend>{documentText('attachExisting')}</legend>{documents.length ? documents.map((document) => <label className="saved-document" key={document.reference}><input type="checkbox" name="documentIds" value={document.reference} /><span>{document.name}</span><span className={`status-pill ${document.status === 'VERIFIED' ? 'success' : 'warning'}`}>{document.status === 'VERIFIED' ? documentText('verified') : documentText('needsReview')}</span></label>) : <p className="muted small">{documentText('empty')}</p>}</fieldset></section>
    </div>
    {errors.length > 0 && <div className="error-list" role="alert"><strong>{t('fixList')}</strong>{errors.map((error) => <p key={error}>{error}</p>)}</div>}
    <button className="button-primary" type="submit" disabled={submitting}>{submitting ? applicationText('submitting') : t('submitApplication')} <ArrowRight size={16} /></button>
  </form>;
}