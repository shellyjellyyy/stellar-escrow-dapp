import { useCallback, useEffect, useRef, useState } from 'react';
import Header from './components/Header';
import CreateDealFolio from './components/CreateDealFolio';
import TrustGauge from './components/TrustGauge';
import DealsLedger from './components/DealsLedger';
import ToastStack from './components/ToastStack';
import { isConfigured } from './lib/config';
import { connectWallet } from './lib/wallet';
import * as chain from './lib/soroban';
import { useDemoLedger } from './lib/useDemoLedger';

let toastId = 0;

export default function App() {
  const configured = isConfigured();

  const [wallet, setWallet] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [deals, setDeals] = useState([]);
  const [ticks, setTicks] = useState([]);
  const [score, setScore] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [toasts, setToasts] = useState([]);
  const stopWatchRef = useRef(null);

  const demo = useDemoLedger({ enabled: !configured, wallet });

  const pushToast = useCallback((title, body, type = 'info') => {
    const id = ++toastId;
    setToasts((t) => [...t, { id, title, body, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  async function handleConnect() {
    setConnecting(true);
    try {
      const w = await connectWallet();
      setWallet(w);
      pushToast('Wallet connected', w.address);
    } catch (err) {
      pushToast('Connection failed', err.message, 'error');
    } finally {
      setConnecting(false);
    }
  }

  function handleDisconnect() {
    setWallet(null);
  }

  // ---- Live chain data (real mode only) ----
  const refreshDeals = useCallback(async () => {
    if (!configured) return;
    try {
      const count = await chain.getDealCount(wallet?.address);
      const ids = Array.from({ length: Number(count) }, (_, i) => i);
      const fetched = await Promise.all(
        ids.map(async (id) => {
          const d = await chain.getDeal(id, wallet?.address);
          return { id, ...d };
        })
      );
      setDeals(fetched.reverse());
    } catch (err) {
      pushToast('Could not load deals', err.message, 'error');
    }
  }, [configured, wallet, pushToast]);

  useEffect(() => {
    if (!configured) return;
    refreshDeals();
    stopWatchRef.current?.();
    stopWatchRef.current = chain.watchEvents({
      onEvents: (events) => {
        refreshDeals();
        events.forEach((ev) => {
          const topic = ev.topic?.[0];
          if (topic?.includes?.('rep_upd')) {
            setTicks((t) => [{ id: `${ev.id}`, positive: true, label: 'reputation updated' }, ...t].slice(0, 20));
          }
        });
      },
      onError: (err) => pushToast('Live feed hiccup', err.message, 'error'),
    });
    return () => stopWatchRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, wallet?.address]);

  useEffect(() => {
    if (!configured || !wallet) return;
    chain
      .getReputation(wallet.address, wallet.address)
      .then((s) => setScore(Number(s)))
      .catch(() => {});
  }, [configured, wallet, deals]);

  // ---- Actions ----
  async function handleCreate({ seller, amount, timeoutLedgers }) {
    setCreating(true);
    try {
      if (configured) {
        await chain.createDeal({ buyer: wallet.address, seller, amount, timeoutLedgers });
        pushToast('Deal opened', `${amount} locked in escrow for ${seller.slice(0, 6)}…`);
        refreshDeals();
      } else {
        demo.createDeal({ seller, amount, timeoutLedgers });
        pushToast('Deal opened (demo)', `${amount} locked in escrow for ${seller.slice(0, 6)}…`);
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleRelease(dealId) {
    setBusyId(dealId);
    try {
      if (configured) {
        await chain.releaseDeal({ dealId, callerAddress: wallet.address });
        pushToast('Deal sealed', `Deal #${dealId} released to the seller.`);
        refreshDeals();
      } else {
        demo.release(dealId);
        pushToast('Deal sealed (demo)', `Deal #${dealId} released to the seller.`);
      }
    } catch (err) {
      pushToast('Release failed', err.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleRefund(dealId) {
    setBusyId(dealId);
    try {
      if (configured) {
        await chain.refundDeal({ dealId, callerAddress: wallet.address });
        pushToast('Deal returned', `Deal #${dealId} refunded to the buyer.`);
        refreshDeals();
      } else {
        demo.refund(dealId);
        pushToast('Deal returned (demo)', `Deal #${dealId} refunded to the buyer.`);
      }
    } catch (err) {
      pushToast('Refund failed', err.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleClaimTimeout(dealId) {
    setBusyId(dealId);
    try {
      if (configured) {
        await chain.claimTimeoutRefund({ dealId, callerAddress: wallet.address });
        pushToast('Timeout claimed', `Deal #${dealId} returned to the buyer; seller's trust took a hit.`);
        refreshDeals();
      } else {
        demo.claimTimeout(dealId);
        pushToast('Timeout claimed (demo)', `Deal #${dealId} returned; seller's trust took a hit.`);
      }
    } catch (err) {
      pushToast('Claim failed', err.message, 'error');
    } finally {
      setBusyId(null);
    }
  }

  const activeDeals = configured ? deals : demo.deals;
  const activeTicks = configured ? ticks : demo.ticks;
  const activeScore = configured ? score : demo.score;

  return (
    <div className="app-shell">
      <Header wallet={wallet} connecting={connecting} onConnect={handleConnect} onDisconnect={handleDisconnect} />

      {!configured && (
        <p className="folio-error" style={{ marginBottom: 20 }}>
          Demo mode — no deployed contract IDs found in .env. Everything below runs in memory so
          you can try the flow. Add VITE_ESCROW_CONTRACT_ID etc. to go live on testnet.
        </p>
      )}

      <div className="counter">
        <CreateDealFolio wallet={wallet} onCreate={handleCreate} busy={creating} />
        <TrustGauge score={activeScore} ticks={activeTicks} wallet={wallet} />
      </div>

      <DealsLedger
        deals={activeDeals}
        wallet={wallet}
        onRelease={handleRelease}
        onRefund={handleRefund}
        onClaimTimeout={handleClaimTimeout}
        busyId={busyId}
      />

      <footer className="footer-note">
        <span>Escrow + Reputation · Soroban smart contracts</span>
        <span>{configured ? 'Live on testnet' : 'Demo mode'}</span>
      </footer>

      <ToastStack toasts={toasts} />
    </div>
  );
}
