# Verification Pipeline

The Phase A `VerificationProvider` accepts validated document metadata and returns a Zod-validated verdict. `MockVerificationProvider` checks type and size; a synthetic connector fixture may return a simulated verdict with a `SIMULATED_DEMO_SOURCE` flag. Manual uploads without live source evidence remain `NEEDS_REVIEW`. Nodal officers/admins can record an office visit, note, reference, and final `VERIFIED`/`REJECTED` result; this is a human review checkpoint, not a government source check. No OCR, cryptographic signature check, or live identity verification is claimed in Phase A.

Phase E will add normalization, malware scanning, OCR/classification, typed extraction, checksum and expiry checks, source-of-truth queries, cross-document consistency, tamper signals, human review, and immutable persisted verification runs. AI explanations may clarify checks but cannot override failed deterministic checks.

## Identity safeguards

- Never collect/store a full Aadhaar number or Aadhaar OTP. Use a consented DigiLocker reference or masked identifier only.
- `IDENTITY_PROVIDER=mock` is a demonstration setting, not a government identity check.
- Aadhaar authentication is limited to authorized AUA/KUA requesting agencies; this prototype is not enrolled.
- Production verification requires approved provider onboarding, security assessment, purpose limitation, retention rules, revocation, and human escalation.

## Authentication boundary

Current password sign-in and the registration form's fixed demo OTP (`123456`) do not verify a government identity, Aadhaar, or control of a real phone/email. `IDENTITY_PROVIDER=mock` is not eKYC. The application deliberately does not collect Aadhaar numbers or OTPs. Production access must remain behind an approved identity-provider integration and verified status check; do not mark users verified from the mock flow.