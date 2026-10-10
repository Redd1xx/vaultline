import { describe, it, expect } from 'vitest';
import { ThresholdDomain } from '../../contract/src/domain/threshold';

describe('Threshold Domain', () => {
  it('validates amount meets minimum', () => {
    expect(ThresholdDomain.meetsMinimum(100n, 50n)).toBe(true);
    expect(ThresholdDomain.meetsMinimum(50n, 50n)).toBe(true);
    expect(ThresholdDomain.meetsMinimum(49n, 50n)).toBe(false);
  });

  it('validates bounds', () => {
    expect(ThresholdDomain.validateBounds(100n)).toBe(true);
    expect(ThresholdDomain.validateBounds(-1n)).toBe(false);
  });
});
