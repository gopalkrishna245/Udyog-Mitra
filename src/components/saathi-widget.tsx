'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { ArrowRight, ArrowUp, Bot, Headphones, Mic, MicOff, MessageCircle, Minimize2, ThumbsDown, ThumbsUp, Volume2, VolumeX, X } from 'lucide-react';
import { createSpeechRecognition, type SpeechRecognitionLike, type SpeechWindow } from '@/lib/speech-provider';

type Message = { role: 'user' | 'assistant'; content: string; source?: { title: string; href: string }; handoff?: boolean; action?: string | null };
const HISTORY_KEY = 'udyog-mitra-saathi-history';
const speechLanguage: Record<string, string> = { en: 'en-IN', mr: 'mr-IN', hi: 'hi-IN' };

export function SaathiWidget() {
  const t = useTranslations('Saathi');
  const workspaceText = useTranslations('Workspace');
  const agentText = useTranslations('Agent');
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [consent, setConsent] = useState(false);
  const [externalConsent, setExternalConsent] = useState(false);
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [speechSupported, setSpeechSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const storedConsent = window.localStorage.getItem('udyog-mitra-saathi-consent') === 'true';
    setConsent(storedConsent);
    if (storedConsent) {
      try { setMessages(JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? '[]') as Message[]); } catch { setMessages([]); }
    }
    void fetch('/api/ai/consent', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) return;
      const result = await response.json() as { data?: { granted?: boolean } };
      setExternalConsent(Boolean(result.data?.granted));
    }).catch(() => undefined);
    setSpeechSupported(Boolean((window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition));
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey && event.key.toLowerCase() === 'v') { event.preventDefault(); setOpen(true); setVoiceMode(true); }
      if (event.key === 'Escape') { setVoiceMode(false); setOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);

  function updateConsent(accepted: boolean) {
    setConsent(accepted);
    window.localStorage.setItem('udyog-mitra-saathi-consent', String(accepted));
    if (!accepted) window.localStorage.removeItem(HISTORY_KEY);
  }

  function persist(next: Message[]) {
    setMessages(next);
    if (consent) window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next.slice(-50)));
  }

  async function updateExternalConsent(grant: boolean) {
    setConsentBusy(true);
    setConsentError(false);
    try {
      const response = await fetch('/api/ai/consent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: grant ? 'grant' : 'revoke' }) });
      if (!response.ok) throw new Error('Consent update failed');
      const result = await response.json() as { data?: { granted?: boolean } };
      setExternalConsent(Boolean(result.data?.granted));
      window.speechSynthesis?.cancel();
    } catch {
      setConsentError(true);
    } finally { setConsentBusy(false); }
  }

  async function sendMessage(message: string) {
    const clean = message.trim();
    if (!clean || busy) return;
    const next = [...messages, { role: 'user' as const, content: clean }];
    persist(next);
    setInput('');
    setBusy(true);
    try {
      const response = await fetch('/api/ai/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: clean, language: locale, externalProcessingConsent: externalConsent }) });
      const data = await response.json() as { data?: { answer: string; sources: Array<NonNullable<Message['source']>>; needsHuman: boolean; nextBestAction?: string | null }; error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message || 'Request failed');
      const result = data.data;
      const answer: Message = { role: 'assistant', content: result?.answer || t('handoff'), source: result?.sources[0], handoff: result?.needsHuman, action: result?.nextBestAction };
      const completed = [...next, answer];
      persist(completed);
      if (voiceMode && !muted) speak(answer.content);
    } catch {
      persist([...next, { role: 'assistant', content: t('handoff'), handoff: true }]);
    } finally { setBusy(false); }
  }

  function speak(text: string) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = speechLanguage[locale] ?? 'en-IN';
    utterance.rate = speed;
    const match = window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith(locale));
    if (match) utterance.voice = match;
    window.speechSynthesis.speak(utterance);
  }

  function startListening() {
    const recognition = createSpeechRecognition(window as SpeechWindow, speechLanguage[locale] ?? 'en-IN');
    if (!recognition) { setSpeechSupported(false); return; }
    window.speechSynthesis?.cancel();
    recognitionRef.current?.stop();
    recognitionRef.current = recognition;
    setListening(true);
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? '').join(' ').trim();
      if (transcript) void sendMessage(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognition.start();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  const quickReplies = [
    [t('quickApprovals'), '/know-your-approvals'],
    [t('quickTrack'), '/applications'],
    [t('quickSchemes'), '/incentives'],
    [t('quickDocuments'), '/documents'],
    [t('quickHelp'), '/contact'],
  ] as const;
  return <>
    <button className="saathi-launcher" aria-label={open ? t('close') : t('open')} onClick={() => setOpen(!open)}>{open ? <X size={21} /> : <MessageCircle size={21} />}<span>{t('name')}</span></button>
    {open && <aside className="saathi-panel" aria-label={t('name')}>
      <header className="saathi-header"><span className="saathi-avatar"><Bot size={18} /></span><span><strong>{t('name')}</strong><small>{t('guidance')}</small></span><button className="saathi-icon" onClick={() => setVoiceMode(true)} aria-label={t('voiceMode')} title={t('voiceMode')}><Headphones size={17} /></button><button className="saathi-icon" onClick={() => setOpen(false)} aria-label={t('close')}><Minimize2 size={17} /></button></header>
      <div className="saathi-messages" ref={scrollRef} aria-live="polite" aria-relevant="additions text">
        {messages.length === 0 && <div className="saathi-welcome"><p>{t('welcome')}</p><div className="saathi-quick">{quickReplies.map(([reply, destination]) => <button key={reply} onClick={() => { setOpen(false); router.push(destination); }}>{reply}</button>)}</div></div>}
        {messages.map((message, index) => <article className={`saathi-message ${message.role}`} key={`${index}-${message.content.slice(0, 8)}`}>
          <p>{message.content}</p>
          {message.source && <Link href={message.source.href as never} className="saathi-source">{t('source')}: {message.source.title}</Link>}
          {message.action?.startsWith('/') && !message.action.startsWith('//') && <Link href={message.action as never} className="saathi-source saathi-action">{workspaceText('open')} <ArrowRight size={14} /></Link>}
          {message.handoff && <p className="saathi-handoff">{agentText('humanReview')}</p>}
          {message.role === 'assistant' && <div className="saathi-feedback"><span>{t('helpful')}</span><button aria-label={t('yes')} onClick={(event) => event.currentTarget.classList.toggle('selected')}><ThumbsUp size={13} /></button><button aria-label={t('no')} onClick={(event) => event.currentTarget.classList.toggle('selected')}><ThumbsDown size={13} /></button></div>}
        </article>)}
        {busy && <p className="saathi-thinking" role="status">{t('thinking')}…</p>}
      </div>
      {!speechSupported && <p className="saathi-error" role="status">{t('unsupported')}</p>}
      <div className="saathi-consent">
        <label><input type="checkbox" checked={consent} onChange={(event) => updateConsent(event.target.checked)} />{t('consent')}</label>
        <label><input type="checkbox" checked={externalConsent} disabled={consentBusy} onChange={(event) => void updateExternalConsent(event.target.checked)} />{agentText('externalAiConsent')}</label>
        <small>{consentBusy ? agentText('consentSaving') : agentText('externalAiNotice')}</small>
        {consentError && <small role="alert">{agentText('consentError')}</small>}
      </div>
      <form className="saathi-compose" onSubmit={submit}><input value={input} onChange={(event) => setInput(event.target.value)} placeholder={t('placeholder')} aria-label={t('placeholder')} /><button type="button" onClick={startListening} aria-label={t('voice')} title={t('voice')}><Mic size={17} /></button><button type="submit" disabled={busy || !input.trim()} aria-label={t('send')}><ArrowUp size={18} /></button></form>
      <footer className="saathi-footer"><Link href="/contact">{t('help')}</Link><span>Alt+V</span></footer>
    </aside>}
    {voiceMode && <div className="voice-overlay" role="dialog" aria-modal="true" aria-label={t('voiceMode')}><button className="voice-close" onClick={() => { setVoiceMode(false); recognitionRef.current?.stop(); window.speechSynthesis?.cancel(); }} aria-label={t('close')}><X /></button><span className={`voice-orb ${listening ? 'listening' : ''}`}><Bot size={42} /></span><h2>{listening ? t('listen') : busy ? t('thinking') : t('voiceMode')}</h2><p>{t('guidance')}</p><div className="voice-controls"><button className="button-primary" onClick={startListening} disabled={listening}><Mic size={18} />{t('voice')}</button><button className="button-quiet" onClick={() => { setMuted(!muted); window.speechSynthesis?.cancel(); }} aria-label={muted ? t('unmute') : t('mute')}>{muted ? <VolumeX /> : <Volume2 />}</button><label>{t('speed')}<input type="range" min="0.7" max="1.3" step="0.1" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} /></label><button className="button-quiet" onClick={() => window.speechSynthesis?.cancel()}><MicOff size={17} />{t('stop')}</button></div><div className="voice-transcript" aria-live="polite">{messages.at(-1)?.content ?? ''}</div></div>}
  </>;
}