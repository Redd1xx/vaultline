import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export enum EscrowStatus { active = 0,
                           released = 1,
                           disputed = 2,
                           resolved = 3,
                           expired = 4
}

export type EscrowTerms = { amount: bigint;
                            currency: bigint;
                            deadline: bigint;
                            minThreshold: bigint;
                            description: Uint8Array
                          };

export type EscrowRecord = { depositor: Uint8Array;
                             beneficiary: Uint8Array;
                             commitment: Uint8Array;
                             status: EscrowStatus;
                             createdAt: bigint;
                             deadline: bigint;
                             arbiter: Uint8Array;
                             minThreshold: bigint
                           };

export type Witnesses<PS> = {
  privateKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  escrowTerms(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, EscrowTerms];
  escrowSalt(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  depositSalt(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  registerCustodian(context: __compactRuntime.CircuitContext<PS>,
                    custodianPublic_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  attestDeposit(context: __compactRuntime.CircuitContext<PS>,
                depositorPublic_0: Uint8Array,
                commitment_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  createEscrow(context: __compactRuntime.CircuitContext<PS>,
               id_0: Uint8Array,
               depositorPublic_0: Uint8Array,
               beneficiaryPublic_0: Uint8Array,
               arbiterPublic_0: Uint8Array,
               timestamp_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  verifyEscrow(context: __compactRuntime.CircuitContext<PS>, id_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, boolean>>;
  releaseEscrow(context: __compactRuntime.CircuitContext<PS>, id_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  initiateDispute(context: __compactRuntime.CircuitContext<PS>,
                  id_0: Uint8Array,
                  reasonHash_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  resolveDispute(context: __compactRuntime.CircuitContext<PS>,
                 id_0: Uint8Array,
                 recipient_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  expireEscrow(context: __compactRuntime.CircuitContext<PS>,
               id_0: Uint8Array,
               currentTimestamp_0: bigint): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
}

export type ProvableCircuits<PS> = {
  registerCustodian(context: __compactRuntime.CircuitContext<PS>,
                    custodianPublic_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  attestDeposit(context: __compactRuntime.CircuitContext<PS>,
                depositorPublic_0: Uint8Array,
                commitment_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  createEscrow(context: __compactRuntime.CircuitContext<PS>,
               id_0: Uint8Array,
               depositorPublic_0: Uint8Array,
               beneficiaryPublic_0: Uint8Array,
               arbiterPublic_0: Uint8Array,
               timestamp_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  verifyEscrow(context: __compactRuntime.CircuitContext<PS>, id_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, boolean>>;
  releaseEscrow(context: __compactRuntime.CircuitContext<PS>, id_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  initiateDispute(context: __compactRuntime.CircuitContext<PS>,
                  id_0: Uint8Array,
                  reasonHash_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  resolveDispute(context: __compactRuntime.CircuitContext<PS>,
                 id_0: Uint8Array,
                 recipient_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  expireEscrow(context: __compactRuntime.CircuitContext<PS>,
               id_0: Uint8Array,
               currentTimestamp_0: bigint): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
}

export type PureCircuits = {
  depositorKey(sk_0: Uint8Array): Uint8Array;
  arbiterKey(sk_0: Uint8Array): Uint8Array;
  beneficiaryKey(sk_0: Uint8Array): Uint8Array;
  custodianKey(sk_0: Uint8Array): Uint8Array;
  escrowCommitment(terms_0: EscrowTerms,
                   depositor_0: Uint8Array,
                   salt_0: Uint8Array): Uint8Array;
  depositCommitment(depositor_0: Uint8Array,
                    amount_0: bigint,
                    currency_0: bigint,
                    salt_0: Uint8Array): Uint8Array;
  escrowNullifier(salt_0: Uint8Array, escrowId_0: Uint8Array): Uint8Array;
  releaseToken(commitment_0: Uint8Array, recipient_0: Uint8Array): Uint8Array;
  disputeHashOf(reason_0: Uint8Array): Uint8Array;
  meetsThreshold(amount_0: bigint, minThreshold_0: bigint): boolean;
}

export type Circuits<PS> = {
  depositorKey(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  arbiterKey(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  beneficiaryKey(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  custodianKey(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  escrowCommitment(context: __compactRuntime.CircuitContext<PS>,
                   terms_0: EscrowTerms,
                   depositor_0: Uint8Array,
                   salt_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  depositCommitment(context: __compactRuntime.CircuitContext<PS>,
                    depositor_0: Uint8Array,
                    amount_0: bigint,
                    currency_0: bigint,
                    salt_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  escrowNullifier(context: __compactRuntime.CircuitContext<PS>,
                  salt_0: Uint8Array,
                  escrowId_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  releaseToken(context: __compactRuntime.CircuitContext<PS>,
               commitment_0: Uint8Array,
               recipient_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  disputeHashOf(context: __compactRuntime.CircuitContext<PS>,
                reason_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  meetsThreshold(context: __compactRuntime.CircuitContext<PS>,
                 amount_0: bigint,
                 minThreshold_0: bigint): Promise<__compactRuntime.CircuitResults<PS, boolean>>;
  registerCustodian(context: __compactRuntime.CircuitContext<PS>,
                    custodianPublic_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  attestDeposit(context: __compactRuntime.CircuitContext<PS>,
                depositorPublic_0: Uint8Array,
                commitment_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  createEscrow(context: __compactRuntime.CircuitContext<PS>,
               id_0: Uint8Array,
               depositorPublic_0: Uint8Array,
               beneficiaryPublic_0: Uint8Array,
               arbiterPublic_0: Uint8Array,
               timestamp_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  verifyEscrow(context: __compactRuntime.CircuitContext<PS>, id_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, boolean>>;
  releaseEscrow(context: __compactRuntime.CircuitContext<PS>, id_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  initiateDispute(context: __compactRuntime.CircuitContext<PS>,
                  id_0: Uint8Array,
                  reasonHash_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  resolveDispute(context: __compactRuntime.CircuitContext<PS>,
                 id_0: Uint8Array,
                 recipient_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  expireEscrow(context: __compactRuntime.CircuitContext<PS>,
               id_0: Uint8Array,
               currentTimestamp_0: bigint): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
}

export type Ledger = {
  readonly admin: Uint8Array;
  certifiedCustodians: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  attestedDeposits: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  escrows: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): EscrowRecord;
    [Symbol.iterator](): Iterator<[Uint8Array, EscrowRecord]>
  };
  readonly escrowCount: bigint;
  nullifiers: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<[Uint8Array, boolean]>
  };
  disputes: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
}

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): Promise<__compactRuntime.ConstructorResult<PS>>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
export declare const expectedVk: Record<string, string>;
export declare const circuitSignatures: __compactRuntime.CircuitSignatures;
export declare const declaredInterfaces: __compactRuntime.DeclaredInterfaces;
