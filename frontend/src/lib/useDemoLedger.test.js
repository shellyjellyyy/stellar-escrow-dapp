import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDemoLedger } from './useDemoLedger';

describe('useDemoLedger', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useDemoLedger({ enabled: true, wallet: null }));
    expect(result.current.deals).toHaveLength(0);
    expect(result.current.score).toBe(0);
  });

  it('creates a pending deal', () => {
    const { result } = renderHook(() => useDemoLedger({ enabled: true, wallet: null }));
    act(() => {
      result.current.createDeal({ seller: 'GSELLER', amount: 100, timeoutLedgers: 500 });
    });
    expect(result.current.deals).toHaveLength(1);
    expect(result.current.deals[0].status).toBe('Pending');
    expect(result.current.deals[0].amount).toBe(100);
  });

  it('releasing a deal seals it and bumps the score', () => {
    const { result } = renderHook(() => useDemoLedger({ enabled: true, wallet: null }));
    act(() => {
      result.current.createDeal({ seller: 'GSELLER', amount: 50, timeoutLedgers: 500 });
    });
    const id = result.current.deals[0].id;
    act(() => {
      result.current.release(id);
    });
    expect(result.current.deals[0].status).toBe('Released');
    expect(result.current.score).toBe(1);
  });

  it('claiming a timeout refunds and penalizes reputation', () => {
    const { result } = renderHook(() => useDemoLedger({ enabled: true, wallet: null }));
    act(() => {
      result.current.createDeal({ seller: 'GSELLER', amount: 50, timeoutLedgers: 500 });
    });
    const id = result.current.deals[0].id;
    act(() => {
      result.current.claimTimeout(id);
    });
    expect(result.current.deals[0].status).toBe('Refunded');
    expect(result.current.score).toBe(-1);
  });

  it('does nothing when disabled', () => {
    const { result } = renderHook(() => useDemoLedger({ enabled: false, wallet: null }));
    act(() => {
      result.current.createDeal({ seller: 'GSELLER', amount: 50, timeoutLedgers: 500 });
    });
    expect(result.current.deals).toHaveLength(0);
  });
});
