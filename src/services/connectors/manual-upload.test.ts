import { describe, expect, it } from 'vitest';
import { ManualUploadAdapter } from './manual-upload';

describe('manual document uploads', () => {
  it('accepts a valid PDF and only lists it for its owner', () => {
    const adapter = new ManualUploadAdapter();
    const bytes = new TextEncoder().encode('%PDF-1.7 demo');
    adapter.ingest({ ownerId: 'owner-a', fileName: 'permit.pdf', mimeType: 'application/pdf', bytes, documentType: 'permit' });
    expect(adapter.listOwned('owner-a')).toHaveLength(1);
    expect(adapter.listOwned('owner-b')).toHaveLength(0);
    expect(adapter.listOwned('owner-a')[0]).toMatchObject({ source: 'manual', simulated: false, sourceVerified: false, status: 'NEEDS_REVIEW' });
  });

  it('rejects a file whose bytes do not match its claimed type', () => {
    const adapter = new ManualUploadAdapter();
    expect(() => adapter.ingest({ ownerId: 'owner-a', fileName: 'fake.pdf', mimeType: 'application/pdf', bytes: new TextEncoder().encode('not a PDF'), documentType: 'permit' })).toThrow('valid PDF');
  });

  it('keeps imported copies of shared source records isolated per owner', () => {
    const adapter = new ManualUploadAdapter();
    const reference = 'DL-MOCK-PAN-01';
    const metadata = { reference, documentType: 'pan', displayName: 'PAN sample', issuer: 'Mock issuer', issuedAt: null, expiresAt: null, maskedIdentifier: 'XXXPX****1F', simulated: true };
    const fetched = { reference, bytes: new TextEncoder().encode('%PDF-1.7 demo'), mimeType: 'application/pdf', metadata, sha256: 'sample-hash' };
    const ownerACopy = adapter.storeFetched('owner-a', fetched, true);
    const ownerBCopy = adapter.storeFetched('owner-b', fetched, true);
    expect(ownerACopy.reference).not.toBe(ownerBCopy.reference);
    expect(ownerACopy.sourceReference).toBe(reference);
    expect(adapter.listOwned('owner-a')).toHaveLength(1);
    expect(adapter.listOwned('owner-b')).toHaveLength(1);
  });
});