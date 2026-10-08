export class ThresholdDomain {
  static meetsMinimum(amount: bigint, minThreshold: bigint): boolean {
    return amount >= minThreshold;
  }
  
  static validateBounds(amount: bigint): boolean {
    return amount >= 0n && amount <= 18446744073709551615n;
  }
}
