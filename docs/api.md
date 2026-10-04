# API

JSON errors use `{ "error": { "code": "...", "message": "..." } }`; success responses use `{ "data": ... }`, except Saathi's answer payload.

| Method and path | Access | Purpose |
| --- | --- | --- |
| `GET/POST /api/auth/[...nextauth]` | Public / NextAuth CSRF | Credentials sign-in, sign-out, and session. |
| `GET /api/applications` | Signed in | Applicants see only their business profile's records; officers are scoped to their department. Supports `search`, `status`, `page` (default 1), and `pageSize` (default 25, maximum 100). Search covers application ID, project/business name, district, and department code. Returns `{ "data": [...], "pagination": { "page", "pageSize", "total", "totalPages" } }`. |
| `POST /api/applications` | Applicant | Validate and create an application and parallel departmental work items. Accepts owner-checked `documentIds` and a legal `organizationType`; links saved documents without changing verification status. Same-origin required. |
| `GET/POST /api/documents` | Applicant | List owned document metadata or upload a PDF/JPG/PNG (maximum 4 MB); same-origin required. Bytes and provenance are stored in Prisma, but uploads are not malware-scanned and remain review-required. |
| `GET/POST /api/documents/digilocker` | Applicant | List synthetic sample documents after consent; grant/revoke short-lived consent or import a sample. Every response is marked simulated and requires review; this is not a live DigiLocker integration. |
| `GET/POST /api/documents/review` | Nodal officer or admin | List pending records or record a manual office visit and final `VERIFIED`/`REJECTED` decision with notes; writes a verification record and audit log. Simulated samples remain explicitly simulated. |
| `GET /api/applications/:id` | Signed in | Checks applicant ownership and officer department scope before returning a case. |
| `PATCH /api/applications/:id` | Officer, nodal, or admin | Approve, reject with a mandatory reason, or raise a consolidated deficiency query; writes history and audit records. Same-origin required. |
| `POST /api/ai/chat` | Public or signed in, rate-limited | L1 intent/slot routing, L2 facts, L3 tools, consent arbitration, sources, and human handoff. Thirty requests per minute per actor/IP. |
| `GET/POST /api/ai/consent` | Signed in | Read, grant, or revoke one-hour `external_ai/process-chat` consent. Phase A ledger is in-memory. |
| `POST /api/saathi` | Public, rate-limited | Backwards-compatible retrieval endpoint; the widget uses the orchestrated `/api/ai/chat` gateway. |
| `GET /api/whatsapp/status` | Public | Reports mock/Cloud API mode and missing setting names only; never returns secrets. |
| `GET /api/whatsapp/webhook` | Meta verification token | Verifies the Cloud API webhook challenge. |
| `POST /api/whatsapp/webhook` | Meta HMAC signature | Validates `X-Hub-Signature-256`, masks inbound PII, records counts only, and acknowledges the event. |

The AI route accepts `{ "message": "...", "language": "en" | "mr" | "hi", "externalProcessingConsent": false }`. Gemini runs only for an authenticated user with explicit consent and `GEMINI_API_KEY`; otherwise the local rule provider responds. A numeric-claim guard permits only values present in L2/L3 facts. Application status is returned only through an injected owner/department-scoped reader.

The WhatsApp status endpoint is diagnostic only. Live Meta messaging requires an approved Business app, phone-number registration, HTTPS webhook, valid access token, and user opt-in. Missing provider settings keep the demo in mock mode; it does not claim delivery.