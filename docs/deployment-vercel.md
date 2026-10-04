# Vercel Deployment

The app is a Next.js App Router project and builds on Vercel. Persistent application, document, and DigiLocker-consent records require a Turso/libSQL database; Vercel serverless filesystems and process memory are not durable.

## Configure

1. Create a Turso database and database auth token.
2. Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in the Vercel project for every environment. Also set `DATABASE_URL=file:./dev.db` so Prisma schema tooling can validate the SQLite-compatible schema; the runtime adapter connects to Turso.
3. Set a unique `NEXTAUTH_SECRET` and the deployed origin in `NEXTAUTH_URL`.
4. Add optional provider credentials only after onboarding: `GEMINI_API_KEY`, WhatsApp Cloud API variables, and approved identity/DigiLocker provider variables. Never prefix secrets with `NEXT_PUBLIC_`.
5. Import the repository into Vercel. `vercel.json` selects the Next.js build, `npm ci` runs `postinstall` to generate Prisma Client, and `npm run build` performs the production build.

## Apply Database Migrations

Before the first deployment and after schema changes, run `npm run db:migrate:turso` from a trusted machine with `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` set. The runner applies checked-in SQLite-compatible migrations in order and records them in `_UdyogMigrations`. On a new database, run `npm run db:seed` once with the same Turso variables to create demo roles, accounts, and catalog data. The seed script resets status history for seeded demo applications, so do not rerun it against a database containing user activity. Do not run migrations concurrently from multiple deployment builds.

Local development continues to use `DATABASE_URL=file:./dev.db`; `src/lib/prisma.ts` maps that to `prisma/dev.db` through the same libSQL adapter. `npm run db:migrate` remains the local Prisma migration command.

## Runtime Limits

The document upload limit is 4 MB to stay below Vercel's serverless request-body ceiling. Bytes are stored as database BLOBs and require human review; there is no malware scanner. Sample DigiLocker documents and simulated source matches are never considered verified. Consent and application/document links are database-backed. AI audit sinks, review queues, and external-AI consent still use in-memory prototype stores and must be made durable before production use.

Government identity verification is not provided by this deployment. Do not describe demo password/OTP authentication as Aadhaar or eKYC verification.