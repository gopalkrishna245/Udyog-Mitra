ALTER TABLE "Document" ADD COLUMN "mimeType" TEXT;
ALTER TABLE "Document" ADD COLUMN "content" BLOB;
ALTER TABLE "Document" ADD COLUMN "sha256" TEXT;
ALTER TABLE "Document" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "Document" ADD COLUMN "sourceReference" TEXT;
ALTER TABLE "Document" ADD COLUMN "simulated" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Document" ADD COLUMN "sourceMatch" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Document_ownerId_createdAt_idx" ON "Document"("ownerId", "createdAt");