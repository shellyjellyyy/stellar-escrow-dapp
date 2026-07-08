export default function ToastStack({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type === 'error' ? 'error' : ''}`}>
          <div className="toast-title">{t.title}</div>
          <div>{t.body}</div>
        </div>
      ))}
    </div>
  );
}
