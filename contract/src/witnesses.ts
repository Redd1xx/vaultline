// SPDX-License-Identifier: Apache-2.0
//
// Private witness provider for the Vaultline bullion & escrow clearing contract.
//
// Custodian deposits, blinding salts, and confidential escrow terms remain confined
// to the caller's local memory space. The zero-knowledge circuit queries these
// witness hooks during proof generation without exposing raw amounts on-chain.

import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type {
  EscrowTerms,
  Ledger,
  Witnesses,
} from './managed/vaultline/contract/index.js';

export type { EscrowTerms };

/**
 * Off-chain secret material held by a clearinghouse participant
 * (depositor, beneficiary, custodian, or neutral arbitrator).
 */
export interface VaultlinePrivateState {
  readonly secretKey: Uint8Array;
  readonly terms?: EscrowTerms;
  readonly salt?: Uint8Array;
  readonly depositSalt?: Uint8Array;
}

export class WitnessError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'WitnessError';
    Object.setPrototypeOf(this, WitnessError.prototype);
  }
}

type ClearingWitnessContext = WitnessContext<Ledger, VaultlinePrivateState>;

const ZERO_DEPOSIT_SALT = new Uint8Array(32);

function requireDefined<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new WitnessError(`Missing required private witness field: ${label}`);
  }
  return value;
}

export function privateStateFor(
  secretKey: Uint8Array,
  terms?: EscrowTerms,
  salt?: Uint8Array,
  depositSalt?: Uint8Array,
): VaultlinePrivateState {
  return {
    secretKey,
    ...(terms !== undefined ? { terms } : {}),
    ...(salt !== undefined ? { salt } : {}),
    ...(depositSalt !== undefined ? { depositSalt } : {}),
  };
}

export const witnesses: Witnesses<VaultlinePrivateState> = {
  privateKey(ctx: ClearingWitnessContext): [VaultlinePrivateState, Uint8Array] {
    const local = ctx.privateState;
    return [local, local.secretKey];
  },

  escrowTerms(ctx: ClearingWitnessContext): [VaultlinePrivateState, EscrowTerms] {
    const local = ctx.privateState;
    const activeTerms = requireDefined(local.terms, 'escrowTerms');
    return [local, activeTerms];
  },

  escrowSalt(ctx: ClearingWitnessContext): [VaultlinePrivateState, Uint8Array] {
    const local = ctx.privateState;
    const blindingSalt = requireDefined(local.salt, 'escrowSalt');
    return [local, blindingSalt];
  },

  depositSalt(ctx: ClearingWitnessContext): [VaultlinePrivateState, Uint8Array] {
    const local = ctx.privateState;
    return [local, local.depositSalt ?? ZERO_DEPOSIT_SALT];
  },
};
