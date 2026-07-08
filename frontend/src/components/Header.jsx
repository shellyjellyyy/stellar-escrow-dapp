import SealMark from './SealMark';

function shortAddr(addr) {
  if (!addr) return '';
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export default function Header({ wallet, connecting, onConnect, onDisconnect }) {
  return (
    <header className="masthead">
      <div className="masthead-title">
        <SealMark />
        <div>
          <span className="kicker">Soroban · Stellar Testnet</span>
          <h1>The Trust Ledger</h1>
        </div>
      </div>

      <div className="wallet-bar">
        {wallet ? (
          <>
            <div className="wallet-chip">
              <span className="dot" />
              {shortAddr(wallet.address)}
            </div>
            <button className="btn btn-ghost" onClick={onDisconnect}>
              Disconnect
            </button>
          </>
        ) : (
          <button className="btn btn-primary" onClick={onConnect} disabled={connecting}>
            {connecting ? 'Connecting…' : 'Connect Freighter'}
          </button>
        )}
      </div>
    </header>
  );
}
