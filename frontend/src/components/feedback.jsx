import { AlertCircle, CheckCircle2, LoaderCircle, Search } from "lucide-react";

export function LoadingState({ label = "Loading your workspace" }) {
  return <div className="loading-panel" role="status"><LoaderCircle className="spin" size={20} />{label}</div>;
}

export function ErrorState({ error, onRetry }) {
  return <div className="error-panel" role="alert">
    <AlertCircle size={20} /><div><strong>We couldn’t load this information.</strong><p>{error?.message || "Please try again."}</p></div>
    {onRetry && <button className="button button-quiet" onClick={onRetry}>Retry</button>}
  </div>;
}

export function EmptyState({ title = "Nothing here yet", detail = "Records will appear here when they are available." }) {
  return <div className="empty-state"><span className="empty-icon"><Search size={20} /></span><strong>{title}</strong><p>{detail}</p></div>;
}

export function Notice({ notice, onClose }) {
  if (!notice) return null;
  return <div className={`notice notice-${notice.type}`} role={notice.type === "error" ? "alert" : "status"}>
    {notice.type === "error" ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
    <span>{notice.message}</span><button aria-label="Dismiss notification" onClick={onClose}>×</button>
  </div>;
}

export function SkeletonRows({ rows = 5 }) {
  return <div className="skeleton-list" aria-label="Loading records">{Array.from({ length: rows }, (_, index) =>
    <div className="skeleton-row" key={index}><i /><i /><i /><i /></div>
  )}</div>;
}
