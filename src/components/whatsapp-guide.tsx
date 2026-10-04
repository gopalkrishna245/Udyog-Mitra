'use client';

import { useLocale, useTranslations } from 'next-intl';
import { MessageCircle, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useState } from 'react';

const voiceLocale: Record<string, string> = { en: 'en-IN', mr: 'mr-IN', hi: 'hi-IN' };
type WhatsAppStatus = { ready: boolean; helpNumberConfigured: boolean };

export function WhatsAppGuide() {
  const t = useTranslations('WhatsApp');
  const locale = useLocale();
  const [reading, setReading] = useState(false);
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const number = process.env.NEXT_PUBLIC_WHATSAPP_HELP_NUMBER?.replace(/\D/g, '');
  const helpUrl = number ? `https://wa.me/${number}?text=${encodeURIComponent(t('prefill'))}` : null;

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/whatsapp/status', { signal: controller.signal, cache: 'no-store' }).then(async (response) => {
      if (!response.ok) return;
      const result = await response.json() as { data?: WhatsAppStatus };
      if (!controller.signal.aborted && result.data) setStatus(result.data);
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);

  function readSteps() {
    if (!('speechSynthesis' in window)) return;
    if (reading) { window.speechSynthesis.cancel(); setReading(false); return; }
    const message = [t('intro'), t('stepOne'), t('stepTwo'), t('stepThree'), t('privacy')].join(' ');
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = voiceLocale[locale] ?? 'en-IN';
    utterance.onend = () => setReading(false);
    utterance.onerror = () => setReading(false);
    setReading(true);
    window.speechSynthesis.speak(utterance);
  }

  return <main id="main-content" className="workspace-page"><div className="workspace-wrap narrow">
    <header className="workspace-heading"><span className="section-kicker">UDYOG MITRA · WHATSAPP</span><h1>{t('title')}</h1><p>{t('intro')}</p></header>
    <section className="panel whatsapp-guide">
      {status && <p className="whatsapp-status" aria-live="polite"><span className={`status-pill ${status.helpNumberConfigured ? 'success' : 'warning'}`}>{status.helpNumberConfigured ? t('supportReady') : t('supportNotReady')}</span><span className={`status-pill ${status.ready ? 'success' : 'warning'}`}>{status.ready ? t('automationReady') : t('automationDemo')}</span></p>}
      <ol><li>{t('stepOne')}</li><li>{t('stepTwo')}</li><li>{t('stepThree')}</li></ol>
      {helpUrl ? <a className="button-primary whatsapp-open" href={helpUrl} target="_blank" rel="noreferrer"><MessageCircle size={20} />{t('openWhatsApp')}</a> : <div className="whatsapp-unconfigured"><strong>{t('notConfigured')}</strong><p>{t('notConfiguredHelp')}</p></div>}
      <button className="button-quiet" type="button" onClick={readSteps}>{reading ? <VolumeX size={18} /> : <Volume2 size={18} />}{reading ? t('stopReading') : t('readSteps')}</button>
      <p className="whatsapp-privacy">{t('privacy')}</p>
      <p className="muted small">{t('prototype')} {t('cloudSetup')}</p>
    </section>
  </div></main>;
}