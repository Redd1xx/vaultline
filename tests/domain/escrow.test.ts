import { describe, it, expect } from 'vitest';
import { EscrowDomain, EscrowStatus } from '../../contract/src/domain/escrow';

describe('Escrow Domain', () => {
  const dummyRecord = {
    depositor: new Uint8Array(32),
    beneficiary: new Uint8Array(32),
    commitment: new Uint8Array(32),
    status: EscrowStatus.active,
    createdAt: 1000n,
    deadline: 5000n,
    arbiter: new Uint8Array(32),
    minThreshold: 500n,
  };

  it('checks if escrow is active', () => {
    expect(EscrowDomain.isActive(dummyRecord)).toBe(true);
    const resolved = { ...dummyRecord, status: EscrowStatus.resolved };
    expect(EscrowDomain.isActive(resolved)).toBe(false);
  });

  it('checks if escrow is expired', () => {
    expect(EscrowDomain.isExpired(dummyRecord, 6000n)).toBe(true);
    expect(EscrowDomain.isExpired(dummyRecord, 4000n)).toBe(false);
  });
});
