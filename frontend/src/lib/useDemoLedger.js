import { useMemo, useRef, useState } from 'react';

/**
 * Lets someone click through the entire escrow lifecycle without a
 * deployed contract yet — useful for early screenshots/demo recording
 * while testnet deployment is still in progress. Purely local state;
 * never touches the network.
 */
export function useDemoLedger({ enabled, wallet }) {
  const [deals, setDeals] = useState([]);
  const [ticks, setTicks] = useState([]);
  const [score, setScore] = useState(0);
  const nextId = useRef(0);

  return useMemo(
    () => ({
      deals,
      ticks,
      score,
      createDeal({ seller, amount, timeoutLedgers }) {
        if (!enabled) return;
        const id = nextId.current++;
        setDeals((d) => [
          {
            id,
            buyer: wallet?.address || 'GDEMO…BUYR',
            seller,
            amount,
            status: 'Pending',
            timeoutLedgers,
          },
          ...d,
        ]);
      },
      release(id) {
        if (!enabled) return;
        setDeals((d) => d.map((deal) => (deal.id === id ? { ...deal, status: 'Released' } : deal)));
        setScore((s) => s + 1);
        setTicks((t) => [{ id: `${id}-r-${Date.now()}`, positive: true, label: `deal #${id} sealed` }, ...t]);
      },
      refund(id) {
        if (!enabled) return;
        setDeals((d) => d.map((deal) => (deal.id === id ? { ...deal, status: 'Refunded' } : deal)));
      },
      claimTimeout(id) {
        if (!enabled) return;
        setDeals((d) => d.map((deal) => (deal.id === id ? { ...deal, status: 'Refunded' } : deal)));
        setScore((s) => s - 1);
        setTicks((t) => [
          { id: `${id}-t-${Date.now()}`, positive: false, label: `deal #${id} timed out` },
          ...t,
        ]);
      },
    }),
    [deals, ticks, score, enabled, wallet]
  );
}
