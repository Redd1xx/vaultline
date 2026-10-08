// SPDX-License-Identifier: Apache-2.0

export enum EscrowStatus {
  active = 0,
  released = 1,
  disputed = 2,
  resolved = 3,
  expired = 4,
}

export interface EscrowRecord {
  depositor: Uint8Array;
  beneficiary: Uint8Array;
  commitment: Uint8Array;
  status: EscrowStatus;
  createdAt: bigint;
  deadline: bigint;
  arbiter: Uint8Array;
  minThreshold: bigint;
}

export class EscrowDomain {
  static isActive(record: EscrowRecord): boolean {
    return record.status === EscrowStatus.active;
  }

  static isExpired(record: EscrowRecord, currentTimestamp: bigint): boolean {
    return record.status === EscrowStatus.active && currentTimestamp >= record.deadline;
  }
}
