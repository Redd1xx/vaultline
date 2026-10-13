// Client-side WebCrypto digest helpers for instant UI previews in the Zurich Clearinghouse console.
// Note: These SHA-256 digests are strictly for responsive UI feedback. Authoritative
// zero-knowledge circuit execution runs the compiled Compact contract in web/src/chain.ts.

const HEX_ALPHABET = '0123456789abcdef';

export function bytesToHex(raw: Uint8Array): string {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const byte = raw[i];
    out += HEX_ALPHABET[byte >> 4] + HEX_ALPHABET[byte & 0x0f];
  }
  return out;
}

export function hexToBytes(hexInput: string): Uint8Array {
  const normalized = hexInput.startsWith('0x') ? hexInput.slice(2) : hexInput;
  const pairCount = Math.floor(normalized.length / 2);
  const result = new Uint8Array(pairCount);
  for (let i = 0; i < pairCount; i++) {
    result[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return result;
}

function encodeFixedTag(tag: string): Uint8Array {
  const frame = new Uint8Array(32);
  const utf8 = new TextEncoder().encode(tag);
  frame.set(utf8.subarray(0, 32));
  return frame;
}

function uint64BigEndian(val: bigint | number): Uint8Array {
  const buf = new Uint8Array(8);
  const dv = new DataView(buf.buffer);
  dv.setBigUint64(0, BigInt(val), false);
  return buf;
}

export async function digestWithDomain(
  domainTag: string,
  ...segments: Array<Uint8Array | bigint | number>
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [encodeFixedTag(domainTag)];
  let totalBytes = 32;

  for (const item of segments) {
    const chunk =
      typeof item === 'bigint' || typeof item === 'number'
        ? uint64BigEndian(item)
        : item;
    chunks.push(chunk);
    totalBytes += chunk.byteLength;
  }

  const payload = new Uint8Array(totalBytes);
  let cursor = 0;
  for (const chunk of chunks) {
    payload.set(chunk, cursor);
    cursor += chunk.byteLength;
  }

  const digest = await crypto.subtle.digest('SHA-256', payload);
  return new Uint8Array(digest);
}

export function deriveDepositorIdentity(secretKey: Uint8Array): Promise<Uint8Array> {
  return digestWithDomain('vaultline:depositor:v1', secretKey);
}

export function deriveBeneficiaryIdentity(secretKey: Uint8Array): Promise<Uint8Array> {
  return digestWithDomain('vaultline:beneficiary:v1', secretKey);
}

export function deriveArbiterIdentity(secretKey: Uint8Array): Promise<Uint8Array> {
  return digestWithDomain('vaultline:arbiter:v1', secretKey);
}

export function deriveCustodianIdentity(secretKey: Uint8Array): Promise<Uint8Array> {
  return digestWithDomain('vaultline:custodian:v1', secretKey);
}

export function previewDepositAttestation(
  depositorPub: Uint8Array,
  principalAmount: bigint,
  assetCode: number,
  depositSalt: Uint8Array,
): Promise<Uint8Array> {
  return digestWithDomain(
    'vaultline:deposit-attest:v1',
    depositorPub,
    principalAmount,
    assetCode,
    depositSalt,
  );
}

export function previewEscrowCommitment(
  principalAmount: bigint,
  assetCode: number,
  expiryEpoch: number,
  publicFloor: bigint,
  depositorPub: Uint8Array,
  blindingSalt: Uint8Array,
): Promise<Uint8Array> {
  return digestWithDomain(
    'vaultline:escrow:v1',
    principalAmount,
    assetCode,
    expiryEpoch,
    publicFloor,
    depositorPub,
    blindingSalt,
  );
}

export function previewNullifierDigest(
  blindingSalt: Uint8Array,
  trancheIdBytes: Uint8Array,
): Promise<Uint8Array> {
  return digestWithDomain('vaultline:settle-nullifier:v2', trancheIdBytes, blindingSalt);
}

export function previewReleaseCertificate(
  commitmentBytes: Uint8Array,
  recipientPub: Uint8Array,
): Promise<Uint8Array> {
  return digestWithDomain('vaultline:release-token:v1', commitmentBytes, recipientPub);
}

export function previewDisputeCommitment(reasonBytes: Uint8Array): Promise<Uint8Array> {
  return digestWithDomain('vaultline:dispute:v1', reasonBytes);
}
