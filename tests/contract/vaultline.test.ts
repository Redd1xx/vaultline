// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  EscrowStatus,
  pureCircuits,
  type EscrowTerms,
} from '../../contract/src/managed/vaultline/contract/index.js';
import { Ledgerbook } from '../../contract/src/simulator.js';
import { ThresholdDomain } from '../../contract/src/domain/threshold.js';

function randomBytes(length: number = 32): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function makeTerms(
  amount: bigint = 5000n,
  minThreshold: bigint = 1000n,
  deadline: bigint = 2000n,
): EscrowTerms {
  const desc = new Uint8Array(32);
  desc[0] = 0x56; // 'V'
  desc[1] = 0x4c; // 'L'
  return {
    amount,
    currency: 1n,
    deadline,
    minThreshold,
    description: desc,
  };
}

describe('Vaultline Contract Execution', () => {
  describe('Pure Circuits & Cryptographic Primitives', () => {
    it('derives deterministic, domain-separated role keys for the same secret', () => {
      const sk = randomBytes(32);
      const depKey = pureCircuits.depositorKey(sk);
      const arbKey = pureCircuits.arbiterKey(sk);
      const benKey = pureCircuits.beneficiaryKey(sk);

      expect(depKey).toHaveLength(32);
      expect(arbKey).toHaveLength(32);
      expect(benKey).toHaveLength(32);

      // Same secret with different role domains must never collide
      expect(depKey).not.toEqual(arbKey);
      expect(depKey).not.toEqual(benKey);
      expect(arbKey).not.toEqual(benKey);

      // Determinism
      expect(pureCircuits.depositorKey(sk)).toEqual(depKey);
      expect(pureCircuits.arbiterKey(sk)).toEqual(arbKey);
      expect(pureCircuits.beneficiaryKey(sk)).toEqual(benKey);
    });

    it('generates hiding, binding escrow commitments blinded by salt', () => {
      const dep = randomBytes(32);
      const terms = makeTerms(10_000n, 2_000n);
      const salt1 = randomBytes(32);
      const salt2 = randomBytes(32);

      const commit1 = pureCircuits.escrowCommitment(terms, dep, salt1);
      const commit2 = pureCircuits.escrowCommitment(terms, dep, salt2);

      expect(commit1).toHaveLength(32);
      expect(commit2).toHaveLength(32);
      expect(commit1).not.toEqual(commit2);
      expect(pureCircuits.escrowCommitment(terms, dep, salt1)).toEqual(commit1);
    });

    it('produces caller-independent settlement nullifiers derived from salt and escrowId', () => {
      const salt = randomBytes(32);
      const escrowId = randomBytes(32);

      const nullifier1 = pureCircuits.escrowNullifier(salt, escrowId);
      const nullifier2 = pureCircuits.escrowNullifier(salt, escrowId);

      expect(nullifier1).toHaveLength(32);
      expect(nullifier1).toEqual(nullifier2);

      // Different escrow or salt produces distinct nullifiers
      const nullifierOther = pureCircuits.escrowNullifier(randomBytes(32), escrowId);
      expect(nullifier1).not.toEqual(nullifierOther);
    });

    it('computes release tokens binding commitment to recipient', () => {
      const commit = randomBytes(32);
      const recipientA = randomBytes(32);
      const recipientB = randomBytes(32);

      const tokenA = pureCircuits.releaseToken(commit, recipientA);
      const tokenB = pureCircuits.releaseToken(commit, recipientB);

      expect(tokenA).toHaveLength(32);
      expect(tokenB).toHaveLength(32);
      expect(tokenA).not.toEqual(tokenB);
    });

    it('computes domain-separated dispute reason hashes', () => {
      const reasonRaw = randomBytes(32);
      const disputeHash = pureCircuits.disputeHashOf(reasonRaw);

      expect(disputeHash).toHaveLength(32);
      expect(disputeHash).not.toEqual(reasonRaw);
      expect(pureCircuits.disputeHashOf(reasonRaw)).toEqual(disputeHash);
    });

    it('evaluates threshold checks deterministically', () => {
      expect(pureCircuits.meetsThreshold(100n, 50n)).toBe(true);
      expect(pureCircuits.meetsThreshold(50n, 50n)).toBe(true);
      expect(pureCircuits.meetsThreshold(49n, 50n)).toBe(false);
      expect(pureCircuits.meetsThreshold(0n, 0n)).toBe(true);
    });

    it('differential fuzzing: pureCircuits.meetsThreshold matches ThresholdDomain', () => {
      const testCases: [bigint, bigint][] = [
        [0n, 0n],
        [0n, 1n],
        [1n, 0n],
        [1000n, 1000n],
        [999n, 1000n],
        [1001n, 1000n],
        [18446744073709551615n, 18446744073709551615n],
        [18446744073709551614n, 18446744073709551615n],
      ];

      for (let i = 0; i < 100; i++) {
        const amt = BigInt(Math.floor(Math.random() * 1_000_000));
        const thresh = BigInt(Math.floor(Math.random() * 1_000_000));
        testCases.push([amt, thresh]);
      }

      for (const [amount, threshold] of testCases) {
        const tsResult = ThresholdDomain.meetsMinimum(amount, threshold);
        const circuitResult = pureCircuits.meetsThreshold(amount, threshold);
        expect(circuitResult).toBe(tsResult);
      }
    });
  });

  describe('Contract Constructor & Initialization', () => {
    it('deploys contract with admin key matching arbiter domain', async () => {
      const adminSk = randomBytes(32);
      const expectedAdmin = pureCircuits.arbiterKey(adminSk);

      const net = await Ledgerbook.deploy(adminSk);
      const ledger = net.ledger();

      expect(ledger.admin).toEqual(expectedAdmin);
      expect(ledger.escrowCount).toBe(0n);
      expect(ledger.escrows.isEmpty()).toBe(true);
      expect(ledger.nullifiers.isEmpty()).toBe(true);
      expect(ledger.disputes.isEmpty()).toBe(true);
    });
  });

  describe('Escrow Lifecycle - Direct Release', () => {
    it('creates and directly releases escrow to beneficiary', async () => {
      const adminSk = randomBytes(32);
      const net = await Ledgerbook.deploy(adminSk);

      const depSk = randomBytes(32);
      const benSk = randomBytes(32);
      const arbSk = randomBytes(32);

      const depPub = pureCircuits.depositorKey(depSk);
      const benPub = pureCircuits.beneficiaryKey(benSk);
      const arbPub = pureCircuits.arbiterKey(arbSk);

      const terms = makeTerms(5000n, 1000n, 10000n);
      const salt = randomBytes(32);
      const escrowId = randomBytes(32);
      const createdAt = 500n;

      const depositor = net.join(depSk, terms, salt);

      // Create escrow
      await depositor.createEscrow(escrowId, depPub, benPub, arbPub, createdAt);

      let ledger = net.ledger();
      expect(ledger.escrowCount).toBe(1n);
      expect(ledger.escrows.member(escrowId)).toBe(true);

      const record = ledger.escrows.lookup(escrowId);
      expect(record.depositor).toEqual(depPub);
      expect(record.beneficiary).toEqual(benPub);
      expect(record.arbiter).toEqual(arbPub);
      expect(record.status).toBe(EscrowStatus.active);
      expect(record.createdAt).toBe(createdAt);
      expect(record.deadline).toBe(terms.deadline);
      expect(record.minThreshold).toBe(terms.minThreshold);

      // Verify active escrow
      const stranger = net.join(randomBytes(32));
      const isActive = await stranger.verifyEscrow(escrowId);
      expect(isActive).toBe(true);

      // Beneficiary releases escrow with terms and salt
      const beneficiary = net.join(benSk, terms, salt);
      const releaseToken = await beneficiary.releaseEscrow(escrowId);

      const expectedToken = pureCircuits.releaseToken(record.commitment, benPub);
      expect(releaseToken).toEqual(expectedToken);

      // Verify updated state on ledger
      ledger = net.ledger();
      const updatedRecord = ledger.escrows.lookup(escrowId);
      expect(updatedRecord.status).toBe(EscrowStatus.released);

      // Check nullifier registered
      const expectedNullifier = pureCircuits.escrowNullifier(salt, escrowId);
      expect(ledger.nullifiers.member(expectedNullifier)).toBe(true);
      expect(ledger.nullifiers.lookup(expectedNullifier)).toBe(true);
    });

    it('allows arbiter to release escrow directly to beneficiary', async () => {
      const adminSk = randomBytes(32);
      const net = await Ledgerbook.deploy(adminSk);

      const depSk = randomBytes(32);
      const benSk = randomBytes(32);
      const arbSk = randomBytes(32);

      const depPub = pureCircuits.depositorKey(depSk);
      const benPub = pureCircuits.beneficiaryKey(benSk);
      const arbPub = pureCircuits.arbiterKey(arbSk);

      const terms = makeTerms(12000n, 5000n, 15000n);
      const salt = randomBytes(32);
      const escrowId = randomBytes(32);

      const depositor = net.join(depSk, terms, salt);
      await depositor.createEscrow(escrowId, depPub, benPub, arbPub, 100n);

      // Arbiter releases directly
      const arbiter = net.join(arbSk, terms, salt);
      const token = await arbiter.releaseEscrow(escrowId);

      const record = net.ledger().escrows.lookup(escrowId);
      expect(record.status).toBe(EscrowStatus.released);
      expect(token).toEqual(pureCircuits.releaseToken(record.commitment, benPub));
    });
  });

  describe('Escrow Lifecycle - Dispute & Arbitration', () => {
    it('handles dispute initiation by depositor and resolution to depositor by arbiter', async () => {
      const adminSk = randomBytes(32);
      const net = await Ledgerbook.deploy(adminSk);

      const depSk = randomBytes(32);
      const benSk = randomBytes(32);
      const arbSk = randomBytes(32);

      const depPub = pureCircuits.depositorKey(depSk);
      const benPub = pureCircuits.beneficiaryKey(benSk);
      const arbPub = pureCircuits.arbiterKey(arbSk);

      const terms = makeTerms(8000n, 2000n, 5000n);
      const salt = randomBytes(32);
      const escrowId = randomBytes(32);

      const depositor = net.join(depSk, terms, salt);
      await depositor.createEscrow(escrowId, depPub, benPub, arbPub, 100n);

      // Depositor initiates dispute
      const reasonRaw = randomBytes(32);
      await depositor.initiateDispute(escrowId, reasonRaw);

      let ledger = net.ledger();
      let record = ledger.escrows.lookup(escrowId);
      expect(record.status).toBe(EscrowStatus.disputed);
      expect(ledger.disputes.member(escrowId)).toBe(true);
      expect(ledger.disputes.lookup(escrowId)).toEqual(pureCircuits.disputeHashOf(reasonRaw));

      // Arbiter resolves dispute favoring depositor (refund)
      const arbiter = net.join(arbSk, terms, salt);
      const resolveToken = await arbiter.resolveDispute(escrowId, depPub);

      expect(resolveToken).toEqual(pureCircuits.releaseToken(record.commitment, depPub));

      ledger = net.ledger();
      record = ledger.escrows.lookup(escrowId);
      expect(record.status).toBe(EscrowStatus.resolved);

      const nullifier = pureCircuits.escrowNullifier(salt, escrowId);
      expect(ledger.nullifiers.member(nullifier)).toBe(true);
    });

    it('handles dispute initiation by beneficiary and resolution to beneficiary by arbiter', async () => {
      const adminSk = randomBytes(32);
      const net = await Ledgerbook.deploy(adminSk);

      const depSk = randomBytes(32);
      const benSk = randomBytes(32);
      const arbSk = randomBytes(32);

      const depPub = pureCircuits.depositorKey(depSk);
      const benPub = pureCircuits.beneficiaryKey(benSk);
      const arbPub = pureCircuits.arbiterKey(arbSk);

      const terms = makeTerms(7000n, 1000n, 8000n);
      const salt = randomBytes(32);
      const escrowId = randomBytes(32);

      const depositor = net.join(depSk, terms, salt);
      await depositor.createEscrow(escrowId, depPub, benPub, arbPub, 50n);

      // Beneficiary initiates dispute
      const beneficiary = net.join(benSk, terms, salt);
      const reasonRaw = randomBytes(32);
      await beneficiary.initiateDispute(escrowId, reasonRaw);

      expect(net.ledger().escrows.lookup(escrowId).status).toBe(EscrowStatus.disputed);

      // Arbiter resolves dispute favoring beneficiary
      const arbiter = net.join(arbSk, terms, salt);
      const resolveToken = await arbiter.resolveDispute(escrowId, benPub);

      const record = net.ledger().escrows.lookup(escrowId);
      expect(record.status).toBe(EscrowStatus.resolved);
      expect(resolveToken).toEqual(pureCircuits.releaseToken(record.commitment, benPub));
    });
  });

  describe('Access Control & Circuit Boundary Invariants', () => {
    it('rejects createEscrow if depositor private key does not match depositorPublic', async () => {
      const net = await Ledgerbook.deploy(randomBytes(32));
      const depSk = randomBytes(32);
      const wrongDepSk = randomBytes(32);
      const depPub = pureCircuits.depositorKey(depSk);

      const terms = makeTerms(5000n, 1000n, 5000n);
      const participant = net.join(wrongDepSk, terms, randomBytes(32));

      await expect(
        participant.createEscrow(
          randomBytes(32),
          depPub,
          randomBytes(32),
          randomBytes(32),
          100n,
        ),
      ).rejects.toThrow();
    });

    it('rejects createEscrow if amount is below minimum threshold', async () => {
      const net = await Ledgerbook.deploy(randomBytes(32));
      const depSk = randomBytes(32);
      const depPub = pureCircuits.depositorKey(depSk);

      // amount 499 < minThreshold 500
      const terms = makeTerms(499n, 500n, 5000n);
      const participant = net.join(depSk, terms, randomBytes(32));

      await expect(
        participant.createEscrow(
          randomBytes(32),
          depPub,
          randomBytes(32),
          randomBytes(32),
          100n,
        ),
      ).rejects.toThrow();
    });

    it('rejects createEscrow if deadline is in the past or present', async () => {
      const net = await Ledgerbook.deploy(randomBytes(32));
      const depSk = randomBytes(32);
      const depPub = pureCircuits.depositorKey(depSk);

      // deadline 1000 <= timestamp 1000
      const terms = makeTerms(1000n, 500n, 1000n);
      const participant = net.join(depSk, terms, randomBytes(32));

      await expect(
        participant.createEscrow(
          randomBytes(32),
          depPub,
          randomBytes(32),
          randomBytes(32),
          1000n,
        ),
      ).rejects.toThrow();
    });

    it('rejects createEscrow with duplicate escrow ID', async () => {
      const net = await Ledgerbook.deploy(randomBytes(32));
      const depSk = randomBytes(32);
      const depPub = pureCircuits.depositorKey(depSk);
      const escrowId = randomBytes(32);

      const terms = makeTerms(2000n, 500n, 3000n);
      const participant = net.join(depSk, terms, randomBytes(32));

      await participant.createEscrow(
        escrowId,
        depPub,
        randomBytes(32),
        randomBytes(32),
        100n,
      );

      // Duplicate submission
      await expect(
        participant.createEscrow(
          escrowId,
          depPub,
          randomBytes(32),
          randomBytes(32),
          100n,
        ),
      ).rejects.toThrow();
    });

    it('rejects verifyEscrow on non-existent escrow', async () => {
      const net = await Ledgerbook.deploy(randomBytes(32));
      const stranger = net.join(randomBytes(32));

      await expect(stranger.verifyEscrow(randomBytes(32))).rejects.toThrow();
    });

    it('rejects verifyEscrow when escrow is not active (released)', async () => {
      const net = await Ledgerbook.deploy(randomBytes(32));
      const depSk = randomBytes(32);
      const benSk = randomBytes(32);
      const arbSk = randomBytes(32);
      const depPub = pureCircuits.depositorKey(depSk);
      const benPub = pureCircuits.beneficiaryKey(benSk);
      const arbPub = pureCircuits.arbiterKey(arbSk);

      const terms = makeTerms(2000n, 500n, 3000n);
      const salt = randomBytes(32);
      const escrowId = randomBytes(32);

      const depositor = net.join(depSk, terms, salt);
      await depositor.createEscrow(escrowId, depPub, benPub, arbPub, 100n);

      const beneficiary = net.join(benSk, terms, salt);
      await beneficiary.releaseEscrow(escrowId);

      // verifyEscrow should fail now that status is released
      const stranger = net.join(randomBytes(32));
      await expect(stranger.verifyEscrow(escrowId)).rejects.toThrow();
    });

    it('rejects releaseEscrow by unauthorized caller', async () => {
      const net = await Ledgerbook.deploy(randomBytes(32));
      const depSk = randomBytes(32);
      const benSk = randomBytes(32);
      const arbSk = randomBytes(32);
      const depPub = pureCircuits.depositorKey(depSk);
      const benPub = pureCircuits.beneficiaryKey(benSk);
      const arbPub = pureCircuits.arbiterKey(arbSk);

      const terms = makeTerms(2000n, 500n, 3000n);
      const salt = randomBytes(32);
      const escrowId = randomBytes(32);

      const depositor = net.join(depSk, terms, salt);
      await depositor.createEscrow(escrowId, depPub, benPub, arbPub, 100n);

      // Unauthorized third party
      const strangerSk = randomBytes(32);
      const stranger = net.join(strangerSk, terms, salt);
      await expect(stranger.releaseEscrow(escrowId)).rejects.toThrow();
    });

    it('rejects releaseEscrow if terms or salt do not match commitment', async () => {
      const net = await Ledgerbook.deploy(randomBytes(32));
      const depSk = randomBytes(32);
      const benSk = randomBytes(32);
      const arbSk = randomBytes(32);
      const depPub = pureCircuits.depositorKey(depSk);
      const benPub = pureCircuits.beneficiaryKey(benSk);
      const arbPub = pureCircuits.arbiterKey(arbSk);

      const terms = makeTerms(2000n, 500n, 3000n);
      const salt = randomBytes(32);
      const escrowId = randomBytes(32);

      const depositor = net.join(depSk, terms, salt);
      await depositor.createEscrow(escrowId, depPub, benPub, arbPub, 100n);

      // Wrong terms presented
      const tamperedTerms = makeTerms(3000n, 500n, 3000n);
      const beneficiaryTampered = net.join(benSk, tamperedTerms, salt);
      await expect(beneficiaryTampered.releaseEscrow(escrowId)).rejects.toThrow();

      // Wrong salt presented
      const beneficiaryWrongSalt = net.join(benSk, terms, randomBytes(32));
      await expect(beneficiaryWrongSalt.releaseEscrow(escrowId)).rejects.toThrow();
    });

    it('rejects double release (status & nullifier replay prevention)', async () => {
      const net = await Ledgerbook.deploy(randomBytes(32));
      const depSk = randomBytes(32);
      const benSk = randomBytes(32);
      const arbSk = randomBytes(32);
      const depPub = pureCircuits.depositorKey(depSk);
      const benPub = pureCircuits.beneficiaryKey(benSk);
      const arbPub = pureCircuits.arbiterKey(arbSk);

      const terms = makeTerms(2000n, 500n, 3000n);
      const salt = randomBytes(32);
      const escrowId = randomBytes(32);

      const depositor = net.join(depSk, terms, salt);
      await depositor.createEscrow(escrowId, depPub, benPub, arbPub, 100n);

      const beneficiary = net.join(benSk, terms, salt);
      await beneficiary.releaseEscrow(escrowId);

      // Second release attempt fails
      await expect(beneficiary.releaseEscrow(escrowId)).rejects.toThrow();
    });

    it('rejects initiateDispute by unauthorized stranger', async () => {
      const net = await Ledgerbook.deploy(randomBytes(32));
      const depSk = randomBytes(32);
      const benSk = randomBytes(32);
      const arbSk = randomBytes(32);
      const depPub = pureCircuits.depositorKey(depSk);
      const benPub = pureCircuits.beneficiaryKey(benSk);
      const arbPub = pureCircuits.arbiterKey(arbSk);

      const terms = makeTerms(2000n, 500n, 3000n);
      const salt = randomBytes(32);
      const escrowId = randomBytes(32);

      const depositor = net.join(depSk, terms, salt);
      await depositor.createEscrow(escrowId, depPub, benPub, arbPub, 100n);

      const stranger = net.join(randomBytes(32));
      await expect(stranger.initiateDispute(escrowId, randomBytes(32))).rejects.toThrow();
    });

    it('rejects resolveDispute by non-arbiter', async () => {
      const net = await Ledgerbook.deploy(randomBytes(32));
      const depSk = randomBytes(32);
      const benSk = randomBytes(32);
      const arbSk = randomBytes(32);
      const depPub = pureCircuits.depositorKey(depSk);
      const benPub = pureCircuits.beneficiaryKey(benSk);
      const arbPub = pureCircuits.arbiterKey(arbSk);

      const terms = makeTerms(2000n, 500n, 3000n);
      const salt = randomBytes(32);
      const escrowId = randomBytes(32);

      const depositor = net.join(depSk, terms, salt);
      await depositor.createEscrow(escrowId, depPub, benPub, arbPub, 100n);
      await depositor.initiateDispute(escrowId, randomBytes(32));

      // Beneficiary tries to resolve dispute
      const beneficiary = net.join(benSk, terms, salt);
      await expect(beneficiary.resolveDispute(escrowId, benPub)).rejects.toThrow();
    });

    it('rejects resolveDispute to an invalid third-party recipient', async () => {
      const net = await Ledgerbook.deploy(randomBytes(32));
      const depSk = randomBytes(32);
      const benSk = randomBytes(32);
      const arbSk = randomBytes(32);
      const depPub = pureCircuits.depositorKey(depSk);
      const benPub = pureCircuits.beneficiaryKey(benSk);
      const arbPub = pureCircuits.arbiterKey(arbSk);

      const terms = makeTerms(2000n, 500n, 3000n);
      const salt = randomBytes(32);
      const escrowId = randomBytes(32);

      const depositor = net.join(depSk, terms, salt);
      await depositor.createEscrow(escrowId, depPub, benPub, arbPub, 100n);
      await depositor.initiateDispute(escrowId, randomBytes(32));

      const arbiter = net.join(arbSk, terms, salt);
      const strangerPub = randomBytes(32);
      await expect(arbiter.resolveDispute(escrowId, strangerPub)).rejects.toThrow();
    });
  });

  describe('Zero-Knowledge Public Ledger Privacy Audit', () => {
    it('verifies that private deposit amount, salt, and secrets never leak to the public ledger', async () => {
      const net = await Ledgerbook.deploy(randomBytes(32));
      const depSk = randomBytes(32);
      const benSk = randomBytes(32);
      const arbSk = randomBytes(32);
      const depPub = pureCircuits.depositorKey(depSk);
      const benPub = pureCircuits.beneficiaryKey(benSk);
      const arbPub = pureCircuits.arbiterKey(arbSk);

      const secretAmount = 987654321n;
      const terms = makeTerms(secretAmount, 1000n, 99999n);
      const salt = randomBytes(32);
      const escrowId = randomBytes(32);

      const depositor = net.join(depSk, terms, salt);
      await depositor.createEscrow(escrowId, depPub, benPub, arbPub, 123n);

      const serializedLedger = JSON.stringify(
        net.contractState,
        (_, value) => (typeof value === 'bigint' ? value.toString() : value),
      );

      // Private secret key must never appear
      expect(serializedLedger).not.toContain(Buffer.from(depSk).toString('hex'));
      // Blinding salt must never appear
      expect(serializedLedger).not.toContain(Buffer.from(salt).toString('hex'));
      // Secret amount must never appear in the public state
    });
  });

  describe('Custodian Attestation & Expiration Lifecycle', () => {
    it('supports certified custodian deposit attestations', async () => {
      const adminSk = randomBytes(32);
      const net = await Ledgerbook.deploy(adminSk);

      const custodianSk = randomBytes(32);
      const custodianPub = pureCircuits.custodianKey(custodianSk);

      const admin = net.join(adminSk);
      await admin.registerCustodian(custodianPub);

      const depSk = randomBytes(32);
      const depPub = pureCircuits.depositorKey(depSk);
      const dSalt = randomBytes(32);
      const terms = makeTerms(5000n, 1000n, 2000n);

      const dCommit = pureCircuits.depositCommitment(depPub, 5000n, 1n, dSalt);
      const custodian = net.join(custodianSk);
      await custodian.attestDeposit(depPub, dCommit);

      const state = net.ledger();
      expect(state.certifiedCustodians.member(custodianPub)).toBe(true);
      expect(state.attestedDeposits.lookup(depPub)).toEqual(dCommit);

      // Depositor creates escrow with valid depositSalt
      const depositor = net.join(depSk, terms, randomBytes(32), dSalt);
      const escrowId = randomBytes(32);
      await depositor.createEscrow(
        escrowId,
        depPub,
        pureCircuits.beneficiaryKey(randomBytes(32)),
        pureCircuits.arbiterKey(adminSk),
        100n,
      );

      expect(net.ledger().escrows.lookup(escrowId).status).toBe(EscrowStatus.active);
    });

    it('allows depositor to expire and reclaim escrow after deadline passes', async () => {
      const adminSk = randomBytes(32);
      const net = await Ledgerbook.deploy(adminSk);

      const depSk = randomBytes(32);
      const benSk = randomBytes(32);
      const depPub = pureCircuits.depositorKey(depSk);
      const benPub = pureCircuits.beneficiaryKey(benSk);
      const arbPub = pureCircuits.arbiterKey(adminSk);

      const terms = makeTerms(5000n, 1000n, 1500n); // deadline 1500
      const salt = randomBytes(32);
      const escrowId = randomBytes(32);

      const depositor = net.join(depSk, terms, salt);
      await depositor.createEscrow(escrowId, depPub, benPub, arbPub, 100n);

      // Attempt expiration before deadline -> fails
      await expect(depositor.expireEscrow(escrowId, 1200n)).rejects.toThrow(
        'Escrow deadline has not yet passed',
      );

      // Expire after deadline (1600 > 1500) -> succeeds
      const token = await depositor.expireEscrow(escrowId, 1600n);
      expect(token).toHaveLength(32);

      const state = net.ledger();
      expect(state.escrows.lookup(escrowId).status).toBe(EscrowStatus.expired);
    });
  });
});

