# Architecture

## Overview

- Next.js App Router renders the localized home and shared portal shell. `next-intl` owns `/en`, `/mr`, and `/hi`; `messages/` is the UI copy source.
- `src/components/workspace-page.tsx` hosts the localized prototype workflows. Browser storage supports repeatable demo actions; it is not authoritative or secure application storage.
- `src/lib/demo-data.ts` is the illustrative catalog. `src/lib/engines.ts` computes checklist applicability, pre-validation, risk score, and SLA state.
- Prisma models the relational data. Local development uses SQLite; the Prisma libSQL adapter can connect to persistent Turso/libSQL for Vercel. `prisma/seed.ts` populates local demonstration data.
- The three AI layers are explicit: L1 language routing/slot extraction with rule-based fallback, L2 deterministic approval/timeline rules, and L3 document evidence checks with human-review status. Tool failures return a logged safe route instead of discarding the user flow. The KNN registration estimate is trained on synthetic demo cases and is not an official SLA.
- NextAuth Credentials authenticates the seeded demo accounts. JWT sessions carry role claims; REST handlers enforce applicant ownership and officer department scope.
- `/api/saathi` performs bounded keyword retrieval, cites a source, rate-limits requests, and hands low-confidence questions to the helpdesk. An OpenAI-compatible provider is optional.
- Browser voice input/output uses Web Speech APIs behind `src/lib/speech-provider.ts`; audio is not sent to the server.

## Production work

Move browser-backed UI writes onto the authorized services, add durable notifications and cron scheduling, object storage and malware scanning, versioned official rules, and complete security/privacy/accessibility review. Sample content is not legal advice and must not determine statutory obligations.

## Request path

1. Locale middleware selects a language and the localized layout loads its message catalog.
2. Authenticated REST routes use NextAuth claims and Prisma.
3. The checklist engine maps project details to the illustrative approval catalog.
4. Saathi searches the article, approval, and scheme catalogs and returns sources plus a guidance-only disclaimer.