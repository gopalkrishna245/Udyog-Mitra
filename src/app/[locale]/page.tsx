import { useTranslations } from 'next-intl';
import { ArrowRight, BadgePercent, ClipboardCheck, FileCheck2, Landmark, ShieldCheck } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { HeroSearchForm } from '@/components/hero-search-form';

export default function HomePage() {
  const t = useTranslations('Home');
  const c = useTranslations('Common');
  const serviceItems = [
    { title: t('service1'), text: t('service1Text'), action: c('approvals'), href: '/know-your-approvals', Icon: ClipboardCheck, accent: '#0b527d', tint: '#e6f1f4' },
    { title: t('service2'), text: t('service2Text'), action: c('apply'), href: '/apply', Icon: FileCheck2, accent: '#a95627', tint: '#f8eee4' },
    { title: t('service3'), text: t('service3Text'), action: c('schemes'), href: '/incentives', Icon: BadgePercent, accent: '#0e746e', tint: '#e5f2ed' },
    { title: t('service4'), text: t('service4Text'), action: c('inspections'), href: '/inspections', Icon: ShieldCheck, accent: '#575f8d', tint: '#eceef8' },
  ];
  const steps = [t('step1'), t('step2'), t('step3'), t('step4'), t('step5')];
  return (
    <main id="main-content">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-inner"><div className="hero-copy">
          <span className="eyebrow">{t('eyebrow')}</span>
          <h1 id="hero-title">{t('title')}</h1>
          <p className="hero-description">{t('description')}</p>
          <HeroSearchForm />
          <div className="hero-actions"><Link className="button-primary" href="/know-your-approvals">{t('checklist')} <ArrowRight size={16} /></Link><Link className="button-secondary" href="/track">{t('track')}</Link></div>
        </div></div>
      </section>
      <section className="stats-band" aria-label="Illustrative portal statistics">
        {[['1,248', t('received')], ['864', t('approved')], ['18', t('daysSaved')], ['12', t('schemes')]].map(([value, label]) => <div className="stat" key={label}><div className="stat-value">{value}{label === t('daysSaved') ? 'd' : '+'}</div><div className="stat-label">{label}</div></div>)}
      </section>
      <section className="section"><div className="section-inner">
        <div className="section-heading"><div><p className="section-kicker">{c('approvals')}</p><h2 className="section-title">{t('services')}</h2><p className="section-intro">{t('servicesIntro')}</p></div><Link className="button-quiet" href="/know-your-approvals">{t('getStarted')} <ArrowRight size={16} /></Link></div>
        <div className="service-grid">{serviceItems.map(({ title, text, action, href, Icon, accent, tint }) => <Link className="service-card" href={href} key={title} style={{ '--accent': accent, '--tint': tint } as React.CSSProperties}><span className="service-icon"><Icon size={20} strokeWidth={1.8} /></span><h3>{title}</h3><p>{text}</p><span className="service-arrow">{action} <ArrowRight size={14} /></span></Link>)}</div>
      </div></section>
      <section className="section steps-section"><div className="section-inner"><div className="section-heading"><div><p className="section-kicker">{c('about')}</p><h2 className="section-title">{t('how')}</h2><p className="section-intro">{t('howIntro')}</p></div></div><div className="steps-grid">{steps.map((step, index) => <div className="step" key={step}><span className="step-number">{index + 1}</span><h3>{step}</h3></div>)}</div></div></section>
      <section className="section incentive-band"><div className="section-inner incentive-inner"><div><p className="section-kicker">{c('schemes')}</p><h2 className="section-title">{t('incentives')}</h2><p className="section-intro">{t('service3Text')}</p></div><Link className="button-primary" href="/incentives">{c('schemes')} <ArrowRight size={16} /></Link></div></section>
      <section className="section"><div className="section-inner"><p className="section-kicker">{c('knowledge')}</p><h2 className="section-title">{t('faq')}</h2><div className="faq-list" style={{ marginTop: 24 }}>{[1, 2, 3].map((id) => <details className="faq-item" key={id}><summary>{t(`faq${id}`)}<span aria-hidden="true">＋</span></summary><p>{t(`faq${id}Answer`)}</p></details>)}</div></div></section>
      <section className="section help-band"><div className="section-inner help-inner"><div><p className="section-kicker">{c('contact')}</p><h2 className="section-title">{t('helpline')}</h2><p className="section-intro">{t('helplineText')}</p></div><Link className="button-quiet" href="/contact"><Landmark size={17} />{c('contact')} <ArrowRight size={15} /></Link></div></section>
    </main>
  );
}