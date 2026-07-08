import { useState } from 'react';

export default function CreateDealFolio({ wallet, onCreate, busy }) {
  const [seller, setSeller] = useState('');
  const [amount, setAmount] = useState('');
  const [timeout, setTimeoutLedgers] = useState('500');
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!wallet) {
      setError('Connect your wallet before opening a deal.');
      return;
    }
    if (!seller.trim()) {
      setError('Enter the seller\u2019s Stellar address.');
      return;
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }

    try {
      await onCreate({ seller: seller.trim(), amount: amt, timeoutLedgers: Number(timeout) || 500 });
      setSeller('');
      setAmount('');
    } catch (err) {
      setError(err.message || 'Could not open the deal.');
    }
  }

  return (
    <form className="folio" onSubmit={handleSubmit}>
      <p className="folio-eyebrow">Open a new deal</p>
      <h2>Hold funds in escrow</h2>

      <div className="field-row">
        <div className="field">
          <label htmlFor="seller">Seller address</label>
          <input
            id="seller"
            placeholder="GABC…7XYZ"
            value={seller}
            onChange={(e) => setSeller(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="field">
          <label htmlFor="amount">Amount</label>
          <input
            id="amount"
            type="number"
            min="0"
            step="0.0000001"
            placeholder="100"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="timeout">Timeout (ledgers)</label>
          <input
            id="timeout"
            type="number"
            min="1"
            value={timeout}
            onChange={(e) => setTimeoutLedgers(e.target.value)}
          />
          <span className="field-hint">~500 ledgers ≈ 42 minutes on testnet</span>
        </div>
      </div>

      <div className="folio-submit">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Sealing deal…' : 'Deposit & open deal'}
        </button>
        {!wallet && <span className="field-hint">Connect a wallet to enable this</span>}
      </div>

      {error && <p className="folio-error">{error}</p>}
    </form>
  );
}
