import { z } from 'zod';
import type { ProjectProfile } from '@/lib/engines';
import { consentLedger } from '../governance/consent';
import { auditSink } from '../governance/audit';
import { maskPii } from '../governance/pii-mask';
import { reviewQueue } from '../governance/review-queue';
import { bm25Search } from '../knowledge/search';
import { createLanguageProvider } from './l1-language/gemini-provider';
import { ensureGroundedNumbers } from './l1-language/grounded-reply';
import { GroundedFactSchema, SupportedLanguageSchema, type GroundedFact } from './l1-language/contracts';
import { AgentToolNameSchema, createAgentToolRegistry, type AgentToolRegistry } from './tools';
import { VerificationInputSchema } from './l3-verify/contracts';

export const OrchestrationRequestSchema = z.object({
  message: z.string().trim().min(1).max(1000), language: SupportedLanguageSchema.optional(),
  userId: z.string().nullable().default(null), externalProcessingConsent: z.boolean().default(false),
  role: z.enum(['applicant', 'officer', 'nodal', 'admin']).nullable().default(null),
  profile: z.object({
    activity: z.enum(['manufacturing', 'service', 'trading']), sector: z.string(), investmentLakhs: z.number().nonnegative(),
    employees: z.number().int().nonnegative(), powerKw: z.number().nonnegative(), waterKld: z.number().nonnegative(),
    hazardous: z.boolean(), stage: z.string(), landType: z.string(),
  }).optional(), document: VerificationInputSchema.optional(),
}).strict();
export type OrchestrationRequest = z.input<typeof OrchestrationRequestSchema>;

export const OrchestrationResponseSchema = z.object({
  answer: z.string(), intent: z.string(), language: SupportedLanguageSchema, facts: z.array(GroundedFactSchema),
  sources: z.array(z.object({ title: z.string(), href: z.string() }).strict()), reasonTrace: z.array(z.string()),
  confidence: z.number().min(0).max(1), needsHuman: z.boolean(), nextBestAction: z.string().nullable(), model: z.string(), toolCall: AgentToolNameSchema.nullable(),
}).strict();
export type OrchestrationResponse = z.infer<typeof OrchestrationResponseSchema>;

const defaultProfile: ProjectProfile = {
  activity: 'manufacturing', sector: 'Orange', investmentLakhs: 180, employees: 24, powerKw: 75,
  waterKld: 12, hazardous: false, stage: 'Planning', landType: 'MIDC',
};

export async function orchestrate(rawRequest: OrchestrationRequest, tools: AgentToolRegistry = createAgentToolRegistry()): Promise<OrchestrationResponse> {
  const request = OrchestrationRequestSchema.parse(rawRequest);
  const externalConsent = Boolean(request.userId && request.externalProcessingConsent
    && consentLedger.hasConsent(request.userId, 'external_ai', 'process-chat'));
  const languageProvider = createLanguageProvider(externalConsent);
  const masked = maskPii(request.message);
  const language = request.language ?? await languageProvider.detectLanguage(request.message);
  const modelInput = externalConsent ? masked.text : request.message;
  const [intentResult, slots] = await Promise.all([
    languageProvider.classifyIntent(modelInput, language),
    languageProvider.extractSlots(modelInput, language),
  ]);
  const profile = request.profile ?? {
    ...defaultProfile,
    ...(slots.activity ? { activity: slots.activity } : {}),
    ...(slots.investmentLakhs !== null ? { investmentLakhs: slots.investmentLakhs } : {}),
  };
  let facts: GroundedFact[] = [];
  const sources: Array<{ title: string; href: string }> = [];
  let reasonTrace = [...intentResult.reasonTrace];
  let confidence = intentResult.confidence;
  let needsHuman = intentResult.confidence < .75;
  const toolMap = {
    find_approvals: 'startChecklist', timeline_estimate: 'estimateTimeline', track_application: 'trackApplication',
    fetch_documents: 'fetchDocuments', verify_document: 'verifyDocument', scheme_match: 'matchSchemes', grievance: 'createGrievance',
  } as const;
  const toolCall = intentResult.intent === 'talk_to_human' ? 'navigate' : toolMap[intentResult.intent as keyof typeof toolMap] ?? null;
  let nextBestAction: string | null = null;

  if (toolCall) {
    try {
      const toolResult = await tools.execute({
        name: toolCall, actorId: request.userId, role: request.role, profile, applicationId: slots.applicationId,
        approvalId: slots.approvalId,
        destination: intentResult.intent === 'talk_to_human' ? '/contact' : null,
        ...(request.document ? { document: request.document } : {}),
      });
      facts = toolResult.facts;
      sources.push(...toolResult.sources);
      reasonTrace = [...reasonTrace, ...toolResult.reasonTrace];
      confidence = Math.min(confidence, toolResult.confidence);
      needsHuman ||= toolResult.needsHuman;
      nextBestAction = toolResult.destination;
    } catch {
      confidence = 0;
      needsHuman = true;
      nextBestAction = fallbackDestination(toolCall);
      reasonTrace.push('orchestrator.tool.failure', 'orchestrator.rule_based_handoff');
    }
  } else {
    const matches = bm25Search(modelInput, language, 3);
    facts = matches.map((entry) => ({ key: entry.title, value: entry.body, source: `${entry.source}@${entry.version}` }));
    sources.push(...matches.map((entry) => ({ title: entry.title, href: entry.source.startsWith('knowledge:') ? `/knowledge/${entry.id}` : '/know-your-approvals' })));
    reasonTrace.push(matches.length ? 'knowledge.bm25.local_match' : 'knowledge.no_match');
    confidence = Math.min(confidence, matches.length ? .55 : .2);
    needsHuman ||= matches.length === 0;
  }

  const lowConfidence = confidence < .75;
  if (lowConfidence) {
    needsHuman = true;
    reasonTrace.push('orchestrator.confidence_below_threshold');
  }
  if (needsHuman && request.userId) reviewQueue.enqueue({ subjectId: request.userId, category: confidence < .75 ? 'low-confidence' : 'policy-handoff', reason: reasonTrace.at(-1) ?? 'orchestrator.human_handoff', referenceId: slots.applicationId });

  const generated = await languageProvider.generateGroundedReply({ language, facts, handoff: needsHuman && facts.length === 0 });
  const answer = ensureGroundedNumbers(generated, facts) ?? (language === 'mr' ? 'माहिती पडताळता आली नाही. कृपया अधिकाऱ्याशी संपर्क करा.' : language === 'hi' ? 'जानकारी की पुष्टि नहीं हो सकी। कृपया अधिकारी से संपर्क करें।' : 'I could not verify that information. Please contact an officer.');
  const response = OrchestrationResponseSchema.parse({
    answer, intent: intentResult.intent, language, facts, sources: sources.slice(0, 5), reasonTrace,
    confidence, needsHuman, nextBestAction: nextBestAction ?? (needsHuman ? '/contact' : null),
    model: externalConsent && process.env.GEMINI_API_KEY ? process.env.GEMINI_MODEL || 'gemini-2.0-flash' : 'rule-based',
    toolCall,
  });
  auditSink.append({ actorId: request.userId, action: `ai.${intentResult.intent}`, layer: 'orchestrator', model: response.model, reasonTrace, input: { message: request.message, language, redactions: masked.redactions, intent: intentResult.intent } });
  return response;
}

function fallbackDestination(tool: z.infer<typeof AgentToolNameSchema>) {
  const destinations: Record<typeof tool, string> = {
    startChecklist: '/know-your-approvals', estimateTimeline: '/know-your-approvals', fetchDocuments: '/documents',
    verifyDocument: '/documents', trackApplication: '/applications', matchSchemes: '/incentives',
    createGrievance: '/grievance', navigate: '/contact',
  };
  return destinations[tool];
}

export function grantExternalAiConsent(userId: string) {
  if (consentLedger.hasConsent(userId, 'external_ai', 'process-chat')) return consentLedger.list(userId).find((record) => record.purpose === 'external_ai' && record.revokedAt === null) ?? null;
  return consentLedger.grant({ subjectId: userId, purpose: 'external_ai', scope: ['process-chat'], ttlMs: 60 * 60 * 1000 });
}

export function grantDigiLockerConsent(userId: string) {
  return consentLedger.grant({ subjectId: userId, purpose: 'digilocker_fetch', scope: ['list', 'fetch'], ttlMs: 10 * 60 * 1000 });
}