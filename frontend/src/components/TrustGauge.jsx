function Ring({ score }) {
  const clamped = Math.max(-10, Math.min(10, score));
  const pct = (clamped + 10) / 20; // 0..1
  const circumference = 2 * Math.PI * 30;
  const offset = circumference * (1 - pct);
  const color = score >= 0 ? '#4C7A6D' : '#9C3D2E';

  return (
    <svg className="gauge-ring" viewBox="0 0 74 74">
      <circle cx="37" cy="37" r="30" stroke="rgba(237,230,214,0.15)" strokeWidth="6" fill="none" />
      <circle
        cx="37"
        cy="37"
        r="30"
        stroke={color}
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 37 37)"
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
    </svg>
  );
}

export default function TrustGauge({ score, ticks, wallet }) {
  return (
    <aside className="gauge-panel">
      <h2>Your standing</h2>
      <div className="gauge">
        <Ring score={score} />
        <div>
          <div className="gauge-score">{score > 0 ? `+${score}` : score}</div>
          <div className="gauge-label">{wallet ? 'on-chain reputation' : 'connect to see yours'}</div>
        </div>
      </div>

      <div>
        <div className="gauge-label" style={{ marginBottom: 8 }}>
          Live ledger feed
        </div>
        <div className="tick-feed">
          {ticks.length === 0 && <p className="empty-note">Reputation updates will appear here as deals close.</p>}
          {ticks.map((t) => (
            <div key={t.id} className={`tick-row ${t.positive ? 'pos' : 'neg'}`}>
              <span className="sign">{t.positive ? '+1' : '−1'}</span>
              <span>{t.label}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
