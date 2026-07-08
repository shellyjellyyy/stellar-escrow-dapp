function shortAddr(addr) {
  if (!addr) return '—';
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

const STAMP_LABEL = {
  Pending: 'Held',
  Released: 'Sealed',
  Refunded: 'Returned',
};

function DealLine({ deal, wallet, onRelease, onRefund, onClaimTimeout, busyId }) {
  const isBuyer = wallet && deal.buyer === wallet.address;
  const isSeller = wallet && deal.seller === wallet.address;
  const busy = busyId === deal.id;
  const statusClass = deal.status.toLowerCase();

  return (
    <div className="deal-line">
      <span className="deal-id">#{String(deal.id).padStart(4, '0')}</span>

      <div className="deal-parties">
        <span className="row">
          <span className="role">buyer</span>
          {shortAddr(deal.buyer)}
        </span>
        <span className="row">
          <span className="role">seller</span>
          {shortAddr(deal.seller)}
        </span>
      </div>

      <span className="deal-amount">{deal.amount.toLocaleString()}</span>

      <div className="deal-actions">
        <span className={`stamp ${statusClass}`}>{STAMP_LABEL[deal.status]}</span>
        {deal.status === 'Pending' && isBuyer && (
          <button className="small-btn" disabled={busy} onClick={() => onRelease(deal.id)}>
            {busy ? '…' : 'Release'}
          </button>
        )}
        {deal.status === 'Pending' && isSeller && (
          <button className="small-btn" disabled={busy} onClick={() => onRefund(deal.id)}>
            {busy ? '…' : 'Refund'}
          </button>
        )}
        {deal.status === 'Pending' && !isBuyer && !isSeller && (
          <button className="small-btn" disabled={busy} onClick={() => onClaimTimeout(deal.id)}>
            {busy ? '…' : 'Claim timeout'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function DealsLedger({ deals, wallet, onRelease, onRefund, onClaimTimeout, busyId }) {
  return (
    <section className="ledger-section">
      <h2>Open deals</h2>
      <p className="ledger-sub">
        Buyers release funds once they're satisfied. Sellers can refund voluntarily. Anyone can
        claim a timeout refund once the deadline passes.
      </p>

      {deals.length === 0 ? (
        <div className="ledger-empty">No deals yet. Open one above to see it land here live.</div>
      ) : (
        <div className="ledger-list">
          {deals.map((deal) => (
            <DealLine
              key={deal.id}
              deal={deal}
              wallet={wallet}
              onRelease={onRelease}
              onRefund={onRefund}
              onClaimTimeout={onClaimTimeout}
              busyId={busyId}
            />
          ))}
        </div>
      )}
    </section>
  );
}
