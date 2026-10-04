import { createHash } from 'node:crypto';
import { ConnectorError, RemoteDocumentSchema, SourceVerificationSchema, type DocumentSource, type FetchedDocument, type RemoteDocument, type SourceVerification } from './types';

const maxBytes = 4 * 1024 * 1024;
const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png']);
type StoredFile = FetchedDocument & { ownerId: string; source: 'manual' | 'digilocker'; sourceMatch: boolean; sourceReference: string | null };

function matchesFileSignature(mimeType: string, bytes: Uint8Array) {
  if (mimeType === 'application/pdf') return new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-';
  if (mimeType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === 'image/png') return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  return false;
}

export class ManualUploadAdapter implements DocumentSource {
  readonly id = 'manual' as const;
  readonly capabilities = { listDocuments: true, fetchDocument: true, verifyAtSource: false };
  private readonly files = new Map<string, StoredFile>();

  async authorize(): Promise<{ status: 'authorized'; consentId: null; simulated: true }> { return { status: 'authorized', consentId: null, simulated: true }; }
  async listDocuments(userId: string): Promise<RemoteDocument[]> { return [...this.files.values()].filter((file) => file.ownerId === userId).map((file) => RemoteDocumentSchema.parse(file.metadata)); }
  async fetchDocument(userId: string, reference: string): Promise<FetchedDocument> {
    const file = this.files.get(reference);
    if (!file || file.ownerId !== userId) throw new ConnectorError('NOT_FOUND', 'Uploaded document not found for this user.');
    return { reference: file.reference, bytes: file.bytes, mimeType: file.mimeType, metadata: file.metadata, sha256: file.sha256 };
  }
  async verifyAtSource(): Promise<SourceVerification> { return SourceVerificationSchema.parse({ matched: false, simulated: true, issuer: null, reference: null, reasonTrace: ['connector.manual.no_source_of_truth'] }); }

  listOwned(userId: string) {
    return [...this.files.values()].filter((file) => file.ownerId === userId).map((file) => ({
      reference: file.reference, documentType: file.metadata.documentType, displayName: file.metadata.displayName,
      issuer: file.metadata.issuer, expiresAt: file.metadata.expiresAt, source: file.source,
      sourceReference: file.sourceReference,
      simulated: file.metadata.simulated, sourceMatch: file.sourceMatch, sourceVerified: false,
      mimeType: file.mimeType, byteSize: file.bytes.byteLength,
      status: file.sourceMatch ? 'SIMULATED_SOURCE_MATCH_NEEDS_REVIEW' : 'NEEDS_REVIEW',
    }));
  }

  storeFetched(ownerId: string, document: FetchedDocument, sourceMatch: boolean) {
    const reference = `DIGILOCKER-${crypto.randomUUID()}`;
    const metadata = RemoteDocumentSchema.parse({ ...document.metadata, reference });
    this.files.set(reference, { ...document, reference, metadata, ownerId, source: 'digilocker', sourceMatch, sourceReference: document.reference });
    return this.listOwned(ownerId).find((item) => item.reference === reference)!;
  }

  ingest(input: { ownerId: string; fileName: string; mimeType: string; bytes: Uint8Array; documentType: string }): RemoteDocument {
    const document = prepareManualUpload(input);
    this.files.set(document.reference, { ...document, ownerId: input.ownerId, source: 'manual', sourceMatch: false, sourceReference: null });
    return document.metadata;
  }
}

export function prepareManualUpload(input: { fileName: string; mimeType: string; bytes: Uint8Array; documentType: string }): FetchedDocument {
    if (!allowedTypes.has(input.mimeType) || input.bytes.byteLength === 0 || input.bytes.byteLength > maxBytes || !matchesFileSignature(input.mimeType, input.bytes)) throw new ConnectorError('INVALID_FILE', 'Upload a valid PDF, JPG, or PNG file up to 4 MB.');
    const reference = `MANUAL-${crypto.randomUUID()}`;
    const metadata = RemoteDocumentSchema.parse({ reference, documentType: input.documentType, displayName: input.fileName, issuer: 'Applicant upload (not verified)', issuedAt: null, expiresAt: null, maskedIdentifier: null, simulated: false });
    return { reference, bytes: input.bytes, mimeType: input.mimeType, metadata, sha256: createHash('sha256').update(input.bytes).digest('hex') };
}

export const manualUploadAdapter = new ManualUploadAdapter();