// State store and privacy boundary auditor for the Zurich Bullion & Custody Clearinghouse console.

import { bytesToHex } from './crypto';

export type CustodyPhase = 'LOCKED' | 'SETTLED' | 'FROZEN' | 'ARBITRATED' | 'RECLAIMED';

export interface BullionTrancheEntry {
  readonly trancheId: string;
  readonly depositorPubHex: string;
  readonly beneficiaryPubHex: string;
  readonly arbiterPubHex: string;
  readonly commitmentHex: string;
  readonly publicFloorUsd: bigint;
  readonly denominationCode: number;
  readonly openedAtEpoch: number;
  readonly timelockExpiry: number;
  readonly custodianAttested: boolean;
  phase: CustodyPhase;
}

export interface LocalCustodyVault {
  secretKey: Uint8Array;
  depositorPub: Uint8Array;
  beneficiaryPub: Uint8Array;
  arbiterPub: Uint8Array;
  custodianPub: Uint8Array;
  shieldedDepositUsd: bigint;
  publicFloorUsd: bigint;
  denominationCode: number;
  timelockSeconds: number;
  escrowSalt: Uint8Array;
  custodianDepositSalt: Uint8Array;
  selectedTrancheId: string | null;
}

export interface LeakageAuditReport {
  readonly clean: boolean;
  readonly exposedArtifacts: string[];
}

export interface ClearinghouseLedgerStore {
  readonly arbiterAuthorityHex: string;
  readonly tranches: Map<string, BullionTrancheEntry>;
  readonly spentNullifiers: Map<string, string>;
  readonly disputeDossiers: Map<string, string>;
  readonly certifiedCustodians: Set<string>;
  readonly attestedDeposits: Map<string, string>;
  registerCustodian: (custodianHex: string) => void;
  recordDepositAttestation: (depositorHex: string, depositCommitHex: string) => void;
  lockBullionTranche: (entry: BullionTrancheEntry) => void;
  settleToBeneficiary: (trancheId: string, nullifierHex: string) => void;
  freezeUnderDispute: (trancheId: string, reasonDigestHex: string) => void;
  executeArbitrationVerdict: (trancheId: string, nullifierHex: string) => void;
  reclaimExpiredTranche: (trancheId: string, nullifierHex: string, nowEpoch: number) => void;
  auditZeroKnowledgeBoundary: (vault: LocalCustodyVault) => LeakageAuditReport;
}

export function createClearinghouseStore(arbiterAuthorityHex: string): ClearinghouseLedgerStore {
  const tranches = new Map<string, BullionTrancheEntry>();
  const spentNullifiers = new Map<string, string>();
  const disputeDossiers = new Map<string, string>();
  const certifiedCustodians = new Set<string>();
  const attestedDeposits = new Map<string, string>();

  function requireTranche(trancheId: string): BullionTrancheEntry {
    const found = tranches.get(trancheId);
    if (!found) {
      throw new Error(`Custody tranche 0x${trancheId.slice(0, 12)} not registered on clearing ledger.`);
    }
    return found;
  }

  function registerCustodian(custodianHex: string): void {
    certifiedCustodians.add(custodianHex);
  }

  function recordDepositAttestation(depositorHex: string, depositCommitHex: string): void {
    attestedDeposits.set(depositorHex, depositCommitHex);
  }

  function lockBullionTranche(entry: BullionTrancheEntry): void {
    if (tranches.has(entry.trancheId)) {
      throw new Error('Duplicate custody tranche identifier rejected by ledger.');
    }
    tranches.set(entry.trancheId, entry);
  }

  function settleToBeneficiary(trancheId: string, nullifierHex: string): void {
    const record = requireTranche(trancheId);
    if (record.phase !== 'LOCKED') {
      throw new Error(`Cannot release tranche in ${record.phase} phase; must be LOCKED.`);
    }
    if (spentNullifiers.has(nullifierHex)) {
      throw new Error('Nullifier replay rejected: settlement certificate already consumed.');
    }
    record.phase = 'SETTLED';
    spentNullifiers.set(nullifierHex, trancheId);
  }

  function freezeUnderDispute(trancheId: string, reasonDigestHex: string): void {
    const record = requireTranche(trancheId);
    if (record.phase !== 'LOCKED') {
      throw new Error(`Dispute freeze requires LOCKED custody status (current: ${record.phase}).`);
    }
    record.phase = 'FROZEN';
    disputeDossiers.set(trancheId, reasonDigestHex);
  }

  function executeArbitrationVerdict(trancheId: string, nullifierHex: string): void {
    const record = requireTranche(trancheId);
    if (record.phase !== 'FROZEN') {
      throw new Error(`Arbitration resolution requires FROZEN status (current: ${record.phase}).`);
    }
    if (spentNullifiers.has(nullifierHex)) {
      throw new Error('Nullifier replay rejected: tranche already settled.');
    }
    record.phase = 'ARBITRATED';
    spentNullifiers.set(nullifierHex, trancheId);
  }

  function reclaimExpiredTranche(trancheId: string, nullifierHex: string, nowEpoch: number): void {
    const record = requireTranche(trancheId);
    if (record.phase !== 'LOCKED') {
      throw new Error(`Timelock reclamation requires LOCKED status (current: ${record.phase}).`);
    }
    if (nowEpoch < record.timelockExpiry) {
      throw new Error(
        `Timelock window still active (${nowEpoch}s < ${record.timelockExpiry}s expiration).`,
      );
    }
    if (spentNullifiers.has(nullifierHex)) {
      throw new Error('Nullifier replay rejected: tranche already settled.');
    }
    record.phase = 'RECLAIMED';
    spentNullifiers.set(nullifierHex, trancheId);
  }

  function auditZeroKnowledgeBoundary(vault: LocalCustodyVault): LeakageAuditReport {
    const publicSnapshot = JSON.stringify(
      {
        arbiterAuthorityHex,
        trancheTotal: tranches.size,
        tranches: Array.from(tranches.values()),
        spentNullifiers: Array.from(spentNullifiers.entries()),
        disputeDossiers: Array.from(disputeDossiers.entries()),
        attestedDeposits: Array.from(attestedDeposits.entries()),
      },
      (_key, val) => (typeof val === 'bigint' ? val.toString() : val),
    ).toLowerCase();

    const exposedArtifacts: string[] = [];

    const skHex = bytesToHex(vault.secretKey).toLowerCase();
    if (publicSnapshot.includes(skHex)) {
      exposedArtifacts.push('ParticipantSecretKey');
    }

    const saltHex = bytesToHex(vault.escrowSalt).toLowerCase();
    if (publicSnapshot.includes(saltHex)) {
      exposedArtifacts.push('EscrowBlindingSalt');
    }

    const depSaltHex = bytesToHex(vault.custodianDepositSalt).toLowerCase();
    if (publicSnapshot.includes(depSaltHex)) {
      exposedArtifacts.push('CustodianDepositSalt');
    }

    // Only flag principal deposit if it differs from the public floor and appears in public JSON
    const depositStr = vault.shieldedDepositUsd.toString();
    if (
      vault.shieldedDepositUsd !== vault.publicFloorUsd &&
      (publicSnapshot.includes(`"${depositStr}"`) || publicSnapshot.includes(`:${depositStr}`))
    ) {
      exposedArtifacts.push('ShieldedPrincipalAmount');
    }

    return {
      clean: exposedArtifacts.length === 0,
      exposedArtifacts,
    };
  }

  return {
    arbiterAuthorityHex,
    tranches,
    spentNullifiers,
    disputeDossiers,
    certifiedCustodians,
    attestedDeposits,
    registerCustodian,
    recordDepositAttestation,
    lockBullionTranche,
    settleToBeneficiary,
    freezeUnderDispute,
    executeArbitrationVerdict,
    reclaimExpiredTranche,
    auditZeroKnowledgeBoundary,
  };
}
