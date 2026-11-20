import { AlertCircle, CheckCircle2, Inbox, LoaderCircle, RefreshCw, Search } from "lucide-react";

export function LoadingState({ label = "Loading your workspace" }) {
  return <div className="loading-panel" role="status" aria-live="polite"><LoaderCircle className="spin" size={20} aria-hidden="true" />{label}</div>;
}

export function ErrorState({ error, onRetry }) {
  return <div className="error-panel" role="alert">
    <AlertCircle size={20} aria-hidden="true" /><div><strong>We couldn’t load this information.</strong><p>{error?.message || "Please try again."}</p></div>
    {onRetry && <button type="button" className="button button-outline button-small" onClick={onRetry}><RefreshCw size={15} aria-hidden="true" />Retry</button>}
  </div>;
}

export function EmptyState({ title = "Nothing here yet", detail = "Records will appear here when they are available.", icon: Icon = Inbox }) {
  return <div className="empty-state"><span className="empty-icon" aria-hidden="true"><Icon size={22} /></span><strong>{title}</strong><p>{detail}</p></div>;
}

export function Notice({ notice, onClose }) {
  if (!notice) return null;
  const isError = notice.type === "error";
  return <div className={`notice notice-${notice.type}`} role={isError ? "alert" : "status"} aria-live={isError ? "assertive" : "polite"}>
    {isError ? <AlertCircle size={18} aria-hidden="true" /> : <CheckCircle2 size={18} aria-hidden="true" />}
    <span>{notice.message}</span>
    {onClose && <button type="button" aria-label="Dismiss notification" onClick={onClose}>×</button>}
  </div>;
}

export function SkeletonRows({ rows = 5 }) {
  return <div className="skeleton-list" role="status" aria-label="Loading records">{Array.from({ length: rows }, (_, index) =>
    <div className="skeleton-row" key={index}><i /><i /><i /><i /></div>
  )}</div>;
}

// Kept for callers that want a lightweight inline search affordance.
export const SearchIcon = Search;
