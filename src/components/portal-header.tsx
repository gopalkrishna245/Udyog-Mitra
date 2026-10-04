'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter, Link } from '@/i18n/routing';
import { ChevronDown, Download, MapPinned, Menu, MessageCircle, X } from 'lucide-react';

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
type PreviewRole = 'applicant' | 'officer' | 'nodal' | 'admin';
const PREVIEW_ROLE_KEY = 'udyog-mitra-preview-role';
const previewRoles = new Set<PreviewRole>(['applicant', 'officer', 'nodal', 'admin']);

const items = [
  ['home', '/'], ['about', '/about'], ['approvals', '/know-your-approvals'], ['apply', '/apply'],
  ['track', '/track'], ['schemes', '/incentives'], ['inspections', '/inspections'],
  ['grievance', '/grievance'], ['knowledge', '/knowledge'], ['dashboard', '/dashboard'], ['contact', '/contact'],
] as const;

export function PortalHeader() {
  const t = useTranslations('Common');
  const pwaText = useTranslations('PWA');
  const previewText = useTranslations('Preview');
  const whatsappText = useTranslations('WhatsApp');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [contrast, setContrast] = useState(false);
  const [dark, setDark] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [previewRole, setPreviewRole] = useState<PreviewRole | null>(null);

  useEffect(() => {
    const syncPreviewRole = () => {
      const role = window.localStorage.getItem(PREVIEW_ROLE_KEY) as PreviewRole | null;
      setPreviewRole(role && previewRoles.has(role) ? role : null);
    };
    const captureInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    syncPreviewRole();
    window.addEventListener('storage', syncPreviewRole);
    window.addEventListener('udyog-mitra-preview-change', syncPreviewRole);
    window.addEventListener('beforeinstallprompt', captureInstallPrompt);
    return () => {
      window.removeEventListener('storage', syncPreviewRole);
      window.removeEventListener('udyog-mitra-preview-change', syncPreviewRole);
      window.removeEventListener('beforeinstallprompt', captureInstallPrompt);
    };
  }, []);

  function setDisplay(mode: 'dark-mode' | 'contrast-mode', active: boolean) {
    document.documentElement.classList.toggle(mode, active);
  }

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  function exitPreview() {
    window.localStorage.removeItem(PREVIEW_ROLE_KEY);
    setPreviewRole(null);
    window.dispatchEvent(new Event('udyog-mitra-preview-change'));
    router.push('/login');
  }

  return (
    <>
      <div className="utility-bar">
        <div className="utility-inner">
          <div className="utility-links">
            <a href="#main-content">{t('skip')}</a>
            <a href="#main-content">{t('screenReader')}</a>
            <span className="text-controls" aria-label="Text size controls">
              <button onClick={() => { document.documentElement.style.fontSize = '90%'; }} aria-label="Decrease text size">A-</button>
              <button onClick={() => { document.documentElement.style.fontSize = '100%'; }} aria-label="Reset text size">A</button>
              <button onClick={() => { document.documentElement.style.fontSize = '110%'; }} aria-label="Increase text size">A+</button>
              <button onClick={() => { setContrast(!contrast); setDisplay('contrast-mode', !contrast); }} aria-pressed={contrast} aria-label="Toggle high contrast">◐</button>
              <button onClick={() => { setDark(!dark); setDisplay('dark-mode', !dark); }} aria-pressed={dark} aria-label="Toggle dark theme">◑</button>
            </span>
          </div>
          <div className="language-switch" aria-label={t('language')}>
            {(['mr', 'hi', 'en'] as const).map((code) => (
              <button key={code} aria-current={locale === code ? 'true' : undefined} onClick={() => router.replace(pathname, { locale: code })}>
                {code === 'mr' ? 'मराठी' : code === 'hi' ? 'हिंदी' : 'English'}
              </button>
            ))}
            <Link href="/login">{t('loginShort')}</Link>
            <Link href="/register">{t('register')}</Link>
            <Link className="whatsapp-nav-link" href="/whatsapp" aria-label={whatsappText('menuLabel')} title={whatsappText('menuLabel')}><MessageCircle size={15} /><span>{whatsappText('menuLabel')}</span></Link>
            {installPrompt && <button className="install-app-button" onClick={() => void installApp()}><Download size={14} />{pwaText('install')}</button>}
          </div>
        </div>
      </div>
      <div className="header-band">
        <div className="header-inner">
          <Link href="/" className="brand" aria-label="Udyog Mitra home">
            <span className="brand-mark"><Image src="/udyog-mitra-icon.svg" alt="" width={56} height={56} priority /></span>
            <span><span className="brand-title">उद्योग मित्र <span>/ Udyog Mitra</span></span><span className="brand-subtitle">{t('department')}</span></span>
          </Link>
          <div className="header-note"><MapPinned size={34} strokeWidth={1.5} aria-hidden="true" /><span>{t('headerNote')}</span></div>
        </div>
      </div>
      <nav className="main-nav" aria-label="Main navigation">
        <div className="nav-inner">
          <button className="nav-mobile-toggle" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={17} /> : <Menu size={17} />}{t('menu')}
          </button>
          <div className="nav-items" data-open={menuOpen}>
            {items.map(([key, href]) => <Link key={key} href={href} className="nav-link" aria-current={pathname === href ? 'page' : undefined}>{t(key)}</Link>)}
          </div>
          <Link className="nav-apply" href="/login">{t('login')} <ChevronDown size={13} aria-hidden="true" /></Link>
        </div>
      </nav>
      <div className="ticker" aria-label="Announcements">
        <div className="ticker-inner"><span className="ticker-tag">NOTICE</span><div className="ticker-track"><span className="ticker-line">{t('ticker1')} &nbsp; • &nbsp; {t('ticker2')} &nbsp; • &nbsp; {t('ticker3')} &nbsp; • &nbsp; {t('ticker1')} &nbsp; • &nbsp; {t('ticker2')} &nbsp; • &nbsp;</span></div></div>
      </div>
      {previewRole && <div className="preview-mode-banner" role="status"><span>{previewText('banner')}</span><button type="button" onClick={exitPreview}>{previewText('exit')}</button></div>}
    </>
  );
}