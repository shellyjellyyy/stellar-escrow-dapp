import { describe, expect, it } from 'vitest';
import { formatTokenAmount, parseTokenAmount } from './amount';

describe('parseTokenAmount', () => {
  it('converts whole numbers using token decimals', () => {
    expect(parseTokenAmount('10', 7)).toBe(100_000_000n);
    expect(parseTokenAmount('100', 7)).toBe(1_000_000_000n);
  });

  it('converts decimal amounts without floating point', () => {
    expect(parseTokenAmount('1.5', 7)).toBe(15_000_000n);
    expect(parseTokenAmount('0.0000001', 7)).toBe(1n);
  });

  it('rejects invalid or non-positive amounts', () => {
    expect(() => parseTokenAmount('', 7)).toThrow();
    expect(() => parseTokenAmount('0', 7)).toThrow();
    expect(() => parseTokenAmount('1.23456789', 7)).toThrow();
  });
});

describe('formatTokenAmount', () => {
  it('formats stroops back to human-readable amounts', () => {
    expect(formatTokenAmount(100_000_000n, 7)).toBe('10');
    expect(formatTokenAmount(15_000_000n, 7)).toBe('1.5');
  });
});
