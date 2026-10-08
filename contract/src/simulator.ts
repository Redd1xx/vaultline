// SPDX-License-Identifier: Apache-2.0
//
// Deterministic in-memory clearinghouse execution engine for Vaultline.
// Evaluates compiled Compact circuits directly in memory while isolating
// each participant's private witness vault from the shared ledger state.

import {
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
  type CircuitContext,
  type CircuitResults,
} from '@midnight-ntwrk/compact-runtime';
import {
  Contract,
  ledger as decodeLedgerSnapshot,
  type EscrowRecord,
  type EscrowTerms,
  type Ledger,
  type Witnesses,
} from './managed/vaultline/contract/index.js';
import {
  privateStateFor,
  witnesses as baseWitnessTable,
  type VaultlinePrivateState,
} from './witnesses.js';

export type { EscrowRecord, EscrowTerms };

type ClearingPrivateState = VaultlinePrivateState;
type OnchainStateData = Parameters<typeof createCircuitContext<ClearingPrivateState>>[0]['contractState'];
type CircuitInvocation<R> = (
  instance: Contract<ClearingPrivateState>,
  ctx: CircuitContext<ClearingPrivateState>,
) => Promise<CircuitResults<ClearingPrivateState, R>>;

const DUMMY_ZSWAP_COIN_PK = '00'.repeat(32);

export interface WitnessCall {
  readonly witness: string;
  readonly value: unknown;
}

function instrumentWitnesses(
  sink: WitnessCall[],
): Witnesses<ClearingPrivateState> {
  const intercepted: Record<string, (...args: unknown[]) => [ClearingPrivateState, unknown]> = {};
  for (const [hookName, handler] of Object.entries(baseWitnessTable)) {
    intercepted[hookName] = (...callArgs: unknown[]) => {
      const invoke = handler as (...a: unknown[]) => [ClearingPrivateState, unknown];
      const tuple = invoke(...callArgs);
      sink.push({ witness: hookName, value: tuple[1] });
      return tuple;
    };
  }
  return intercepted as unknown as Witnesses<ClearingPrivateState>;
}

export class Ledgerbook {
  public readonly address: string = sampleContractAddress();
  public readonly witnessLog: WitnessCall[] = [];
  public contractState: OnchainStateData;

  private constructor(initialStateData: OnchainStateData) {
    this.contractState = initialStateData;
  }

  public static async deploy(arbiterAdminSecret: Uint8Array): Promise<Ledgerbook> {
    const bootstrapContract = new Contract<ClearingPrivateState>(baseWitnessTable);
    const genesisCtx = createConstructorContext<ClearingPrivateState>(
      privateStateFor(arbiterAdminSecret),
      DUMMY_ZSWAP_COIN_PK,
    );
    const deployed = await bootstrapContract.initialState(genesisCtx);
    return new Ledgerbook(deployed.currentContractState.data);
  }

  public join(
    secretKey: Uint8Array,
    terms?: EscrowTerms,
    salt?: Uint8Array,
    depositSalt?: Uint8Array,
  ): Participant {
    const initialPrivate = privateStateFor(secretKey, terms, salt, depositSalt);
    return new Participant(this, initialPrivate);
  }

  public ledger(): Ledger {
    return decodeLedgerSnapshot(
      this.contractState as Parameters<typeof decodeLedgerSnapshot>[0],
    );
  }

  public async call<R>(
    actor: Participant,
    circuitName: string,
    execute: CircuitInvocation<R>,
  ): Promise<R> {
    const executionContext = createCircuitContext<ClearingPrivateState>({
      circuitId: circuitName,
      contractAddress: this.address,
      coinPublicKeyOrZswapState: DUMMY_ZSWAP_COIN_PK,
      contractState: this.contractState,
      privateState: actor.state,
    });

    const tracedContract = new Contract<ClearingPrivateState>(
      instrumentWitnesses(this.witnessLog),
    );
    const outcome = await execute(tracedContract, executionContext);

    this.contractState = outcome.context.callContext.currentQueryContext.state;
    const nextPrivate = outcome.context.callContext.currentPrivateState;
    if (nextPrivate !== undefined) {
      actor.state = nextPrivate;
    }
    return outcome.result;
  }
}

export class Participant {
  private readonly clearinghouse: Ledgerbook;
  public state: ClearingPrivateState;

  constructor(clearinghouse: Ledgerbook, initialState: ClearingPrivateState) {
    this.clearinghouse = clearinghouse;
    this.state = initialState;
  }

  public registerCustodian(custodianPublic: Uint8Array): Promise<[]> {
    return this.clearinghouse.call(this, 'registerCustodian', (contract, ctx) =>
      contract.impureCircuits.registerCustodian(ctx, custodianPublic),
    );
  }

  public attestDeposit(depositorPublic: Uint8Array, commitment: Uint8Array): Promise<[]> {
    return this.clearinghouse.call(this, 'attestDeposit', (contract, ctx) =>
      contract.impureCircuits.attestDeposit(ctx, depositorPublic, commitment),
    );
  }

  public createEscrow(
    id: Uint8Array,
    depositorPublic: Uint8Array,
    beneficiaryPublic: Uint8Array,
    arbiterPublic: Uint8Array,
    timestamp: bigint,
  ): Promise<[]> {
    return this.clearinghouse.call(this, 'createEscrow', (contract, ctx) =>
      contract.impureCircuits.createEscrow(
        ctx,
        id,
        depositorPublic,
        beneficiaryPublic,
        arbiterPublic,
        timestamp,
      ),
    );
  }

  public verifyEscrow(id: Uint8Array): Promise<boolean> {
    return this.clearinghouse.call(this, 'verifyEscrow', (contract, ctx) =>
      contract.impureCircuits.verifyEscrow(ctx, id),
    );
  }

  public releaseEscrow(id: Uint8Array): Promise<Uint8Array> {
    return this.clearinghouse.call(this, 'releaseEscrow', (contract, ctx) =>
      contract.impureCircuits.releaseEscrow(ctx, id),
    );
  }

  public initiateDispute(id: Uint8Array, reasonHash: Uint8Array): Promise<[]> {
    return this.clearinghouse.call(this, 'initiateDispute', (contract, ctx) =>
      contract.impureCircuits.initiateDispute(ctx, id, reasonHash),
    );
  }

  public resolveDispute(id: Uint8Array, recipient: Uint8Array): Promise<Uint8Array> {
    return this.clearinghouse.call(this, 'resolveDispute', (contract, ctx) =>
      contract.impureCircuits.resolveDispute(ctx, id, recipient),
    );
  }

  public expireEscrow(id: Uint8Array, currentTimestamp: bigint): Promise<Uint8Array> {
    return this.clearinghouse.call(this, 'expireEscrow', (contract, ctx) =>
      contract.impureCircuits.expireEscrow(ctx, id, currentTimestamp),
    );
  }
}
