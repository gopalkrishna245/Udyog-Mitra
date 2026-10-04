<div align="center">
	<img src="public/udyog-mitra-icon.svg" alt="Udyog Mitra mark" width="88" height="88" />
	<h1>Udyog Mitra</h1>
	<p><strong>A multilingual single-window guide for Maharashtra entrepreneurs</strong></p>
	<p>Approvals · Applications · Documents · Incentives · Compliance</p>
	<p><a href="https://udyog-mitra-gov.vercel.app">Open the deployed preview</a></p>
	<p>
		<img src="https://img.shields.io/badge/Next.js-15.5-111111?logo=next.js" alt="Next.js 15.5" />
		<img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5.9" />
		<img src="https://img.shields.io/badge/Languages-English%20%7C%20Hindi%20%7C%20Marathi-147D72" alt="English, Hindi, and Marathi" />
		<img src="https://img.shields.io/badge/Status-Prototype-E47C22" alt="Prototype" />
	</p>
</div>

> **Prototype notice**: Udyog Mitra is a demonstration project, not an official government website. Approval rules, fees, timelines, schemes, and records are illustrative. Do not enter real personal or business information.

## At a Glance

Udyog Mitra brings common startup and industrial setup tasks into one guided workspace. Entrepreneurs can explore legal business forms and registrations, create an illustrative approval checklist, estimate a journey timeline, attach documents, and track application status. The interface supports English, Hindi, and Marathi, with browser-based voice assistance and a WhatsApp help guide.

| Area | What you can explore |
| --- | --- |
| Business setup | Legal forms, common registrations, typical documents, and official portal links |
| Approval journey | Activity-based checklist, dependencies, timeline ranges, and missing-document guidance |
| Applications | Searchable, filterable, paginated records and applicant/officer views |
| Documents | Uploads, reusable application attachments, sample DigiLocker import, and manual review status |
| Udyam Saathi | Multilingual guided answers, local rules fallback, voice input, sources, and next-step links |
| Access | Installable PWA, mobile layouts, local demo preview, and role-based demo accounts |

## Quick Start

**Requirements:** Node.js 20+ and npm.

```bash
git clone https://github.com/devvcancode/Udyog-Mitra.git
cd Udyog-Mitra
cp .env.example .env
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:3000/en](http://localhost:3000/en). The localized routes are `/en`, `/hi`, and `/mr`.

Set a private local `NEXTAUTH_SECRET` in `.env` before testing server-backed sign-in. The **Continue** button on the demo login page also offers a browser-only preview if the auth service is unavailable; preview records stay in that browser and do not reach backend APIs. Never commit `.env` or share secrets in issues or chat.

## Demo Roles

Seeded local accounts use the password `demo123`:

| Role | Email |
| --- | --- |
| Applicant | `applicant@udyogmitra.demo` |
| Applicant, components | `foundry@udyogmitra.demo` |
| Applicant, textiles | `textiles@udyogmitra.demo` |
| Department officer, MPCB | `officer@udyogmitra.demo` |
| Nodal officer | `nodal@udyogmitra.demo` |
| Administrator | `admin@udyogmitra.demo` |

To see the local preview without server authentication, open `/login`, choose a role, and select **Continue**. A preview banner marks browser-only mode. Staff review and protected server actions require a real session.

## Five-Minute Tour

1. Switch between English, हिंदी, and मराठी from the header.
2. Open **Know Your Approvals**, choose an activity and project profile, then view the legal-form catalog and illustrative timeline.
3. Continue to **Documents** to upload a sample file or inspect simulated DigiLocker records; select saved documents when creating an application.
4. Explore application tracking, incentives, inspections, and the local preview role flows.
5. Ask Udyam Saathi about approvals or a timeline. Review its sources and follow its next-step link. If Gemini is not configured or consent is not granted, the local rule-based provider remains available.

## Three-Layer Assistant

| Layer | Responsibility | Fallback / boundary |
| --- | --- | --- |
| L1 · Language | Detect language, classify intent, extract explicit project details, and phrase grounded answers | Rule-based provider when Gemini is unavailable or not consented |
| L2 · Rule core | Determine illustrative approvals, dependencies, readiness, and timeline ranges | Deterministic seeded rules and mock data remain available |
| L3 · Verification | Check document metadata/evidence and route uncertain cases to human review | Manual uploads and sample DigiLocker records never become government-verified evidence automatically |

Agent-tool failures are caught and return a safe handoff with a useful page destination. Registration KNN estimates use synthetic examples and are not official service-level commitments. See [AI architecture](docs/ai-architecture.md) and [verification pipeline](docs/verification-pipeline.md).

## Checks and Tools

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run --silent eval:training-jsonl > /tmp/udyog-mitra-l1.jsonl
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local Next.js app |
| `npm run db:migrate` | Apply local SQLite migrations |
| `npm run db:seed` | Load demo roles, users, approvals, and sample cases |
| `npm run db:migrate:turso` | Apply checked-in migrations to a configured Turso database |
| `npm test` | Run Vitest tests |
| `npm run typecheck` | Run TypeScript checks |
| `npm run lint` | Run ESLint |

## Deploy to Vercel

Vercel functions need persistent storage; local files and process memory are not durable. Configure a Turso/libSQL database, then set `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `NEXTAUTH_URL`, and a strong `NEXTAUTH_SECRET` in the Vercel project. `DATABASE_URL=file:./dev.db` is retained for Prisma schema tooling. Apply migrations and seed a new database once from a trusted terminal:

```bash
npm run db:migrate:turso
npm run db:seed
```

Do not rerun the seed against a database with user activity; it resets history for seeded sample applications. Full environment setup and migration guidance is in [Vercel deployment](docs/deployment-vercel.md).

## Data and Verification Boundaries

- The demo Continue path is browser-only; it does not authorize backend requests or represent a verified identity.
- Passwords and the fixed demo OTP are not Aadhaar, eKYC, or government-ID checks. The app does not request Aadhaar numbers or OTPs.
- DigiLocker records are synthetic. Live DigiLocker, government source checks, OCR, and identity verification need approved providers and configuration.
- Manual review records capture office, visit, and reviewer notes. A human `VERIFIED` decision is not a live government-source verification.
- Uploaded files are limited to 4 MB, stored as database BLOBs, and require human review. Malware scanning is not implemented.
- Gemini processing requires `GEMINI_API_KEY` and explicit user consent. Without both, Saathi uses local rule-based language; L2 remains authoritative for factual figures.
- WhatsApp stays in mock mode until Cloud API credentials are configured. A public help number is needed for the click-to-chat link.
- Audit sinks, review queues, and external-AI consent stores still have prototype-only in-memory components; review the production TODOs before real deployment.

## Project Map

| Path | Contents |
| --- | --- |
| `src/app/` | Localized Next.js pages and API routes |
| `src/components/` | Portal shell, service views, timeline, chat, and document workflows |
| `src/services/ai/` | L1 language providers, L2 rule core, L3 verification, and orchestration |
| `src/services/connectors/` | Manual upload, simulated DigiLocker, and WhatsApp integrations |
| `prisma/` | Database schema, migrations, and seed data |
| `messages/` | English, Hindi, and Marathi interface copy |
| `docs/` | Architecture, API, connector, verification, and deployment guides |

## Documentation

- [Architecture](docs/architecture.md)
- [API reference](docs/api.md)
- [Data model](docs/data-model.md)
- [AI architecture](docs/ai-architecture.md)
- [Document connectors](docs/connectors.md)
- [Timeline engine](docs/timeline-engine.md)
- [Verification pipeline](docs/verification-pipeline.md)
- [Vercel deployment](docs/deployment-vercel.md)