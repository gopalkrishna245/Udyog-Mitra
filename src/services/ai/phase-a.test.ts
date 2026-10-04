import { beforeEach, describe, expect, it } from 'vitest';
import { RuleBasedLanguageProvider } from './l1-language/rule-based-provider';
import { ensureGroundedNumbers } from './l1-language/grounded-reply';
import { InMemoryConsentLedger } from '../governance/consent';
import { maskPii } from '../governance/pii-mask';
import { MockDigiLockerSource } from '../connectors/mock-digilocker';
import { parseWhatsAppInbound, verifyMetaWebhookSignature } from '../connectors/whatsapp';
import { orchestrate } from './orchestrator';
import { AgentToolRegistry, createAgentToolRegistry } from './tools';
import { buildTuningJsonl } from '../../../evals/l1_training_data_generator';
import { createHmac } from 'node:crypto';

describe('Phase A L1 and governance boundaries', () => {
  it('detects romanized Marathi and extracts lakhs and Bhiwandi', async () => {
    const provider = new RuleBasedLanguageProvider();
    const message = 'maza 50 lakh cha unit Bhiwandi madhe aahe';
    expect(await provider.detectLanguage(message)).toBe('mr');
    await expect(provider.extractSlots(message, 'mr')).resolves.toMatchObject({ investmentLakhs: 50, district: 'Thane', activity: 'manufacturing' });
    await expect(provider.extractSlots('How long for Fire NOC?', 'en')).resolves.toMatchObject({ approvalId: 'fire' });
  });

  it('rejects grounded replies with figures absent from L2/L3 facts', () => {
    const facts = [{ key: 'sla', value: 15, source: 'catalog' }];
    expect(ensureGroundedNumbers('Processing takes 15 days.', facts)).toBe('Processing takes 15 days.');
    expect(ensureGroundedNumbers('Processing takes 12 days.', facts)).toBeNull();
  });

  it('masks Aadhaar, mobile, email, PAN, and GSTIN before audit/model boundaries', () => {
    const result = maskPii('Aadhaar 1234 5678 9012 mobile 9876543210 mail test@example.com PAN ABCDE1234F GSTIN 27ABCDE1234F1Z5');
    expect(result.text).not.toContain('1234 5678 9012');
    expect(result.text).not.toContain('9876543210');
    expect(result.text).not.toContain('test@example.com');
    expect(result.text).not.toContain('ABCDE1234F');
    expect(result.redactions.map((item) => item.kind)).toContain('aadhaar');
  });

  it('routes facts through L2 and applies the guidance-only rule', async () => {
    const result = await orchestrate({ message: 'How long for Fire NOC?', language: 'en', externalProcessingConsent: false });
    expect(result.facts.some((fact) => fact.key === 'medianJourneyDays')).toBe(true);
    expect(result.answer).toContain('Guidance only, not legal advice.');
    expect(result.answer).toContain(String(result.facts.find((fact) => fact.key === 'medianJourneyDays')?.value));
    expect(result.sources.length).toBeGreaterThan(0);
    expect(Number(result.facts.find((fact) => fact.key === 'medianJourneyDays')?.value)).toBeLessThan(30);
  });

  it('hands off safely when an agent tool fails and preserves a useful next action', async () => {
    const tools = new AgentToolRegistry().register('estimateTimeline', async () => { throw new Error('simulated timeline outage'); });
    const result = await orchestrate({ message: 'How long for Fire NOC?', language: 'en' }, tools);
    expect(result.needsHuman).toBe(true);
    expect(result.facts).toEqual([]);
    expect(result.nextBestAction).toBe('/know-your-approvals');
    expect(result.reasonTrace).toContain('orchestrator.rule_based_handoff');
  });

  it('produces one fact-free tuning example for every intent and locale', () => {
    const rows = buildTuningJsonl().split('\n').map((row) => JSON.parse(row) as { contents: Array<{ role: string; parts: Array<{ text: string }> }> });
    expect(rows).toHaveLength(30);
    expect(rows.every((row) => row.contents[1].parts[0].text.includes('statutory promise') || !/\d/.test(row.contents[1].parts[0].text))).toBe(true);
    expect(new Set(rows.map((row) => row.contents[0].parts[0].text.match(/\[language=(\w+)\]/)?.[1])).size).toBe(3);
  });
});

describe('consent-gated document connector', () => {
  let ledger: InMemoryConsentLedger;
  let source: MockDigiLockerSource;

  beforeEach(() => {
    ledger = new InMemoryConsentLedger();
    source = new MockDigiLockerSource(ledger);
  });

  it('does not list or fetch documents without purpose-bound consent', async () => {
    await expect(source.listDocuments('user-1')).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
    const record = ledger.grant({ subjectId: 'user-1', purpose: 'digilocker_fetch', scope: ['list'] });
    expect((await source.authorize('user-1', record)).status).toBe('authorized');
    await expect(source.listDocuments('user-1')).resolves.toHaveLength(7);
    await expect(source.fetchDocument('user-1', 'DL-MOCK-PAN-01')).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
  });

  it('requires a valid Meta webhook signature and masks inbound identifiers', () => {
    const secret = 'demo-secret';
    const body = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: '+919876543210', type: 'text', text: { body: 'My number 9876543210 needs help.' } }] } }] }] });
    const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(verifyMetaWebhookSignature(body, signature, secret)).toBe(true);
    expect(verifyMetaWebhookSignature(body, 'sha256=bad', secret)).toBe(false);
    const inbound = parseWhatsAppInbound(JSON.parse(body));
    expect(inbound[0].from).not.toContain('9876543210');
    expect(inbound[0].text).not.toContain('9876543210');
  });
});

describe('agent tool authorization', () => {
  it('returns application status only when the injected owner lookup authorizes the caller', async () => {
    const registry = createAgentToolRegistry({ readApplicationStatus: async (actorId, _role, applicationId) =>
      actorId === 'owner-1' && applicationId === 'UM-2026-00001' ? { status: 'Under Scrutiny', source: 'authorized record' } : null,
    });
    const denied = await registry.execute({ name: 'trackApplication', actorId: 'other-user', role: 'applicant', profile: undefined, applicationId: 'UM-2026-00001', destination: null, document: undefined });
    const allowed = await registry.execute({ name: 'trackApplication', actorId: 'owner-1', role: 'applicant', applicationId: 'UM-2026-00001' });
    expect(denied.facts).toEqual([]);
    expect(denied.needsHuman).toBe(true);
    expect(allowed.facts[0]?.value).toBe('Under Scrutiny');
  });

  it('rejects navigation outside the allowlist', async () => {
    const result = await createAgentToolRegistry().execute({ name: 'navigate', actorId: null, role: null, destination: '/api/applications' });
    expect(result.needsHuman).toBe(true);
    expect(result.destination).toBe('/contact');
  });
});