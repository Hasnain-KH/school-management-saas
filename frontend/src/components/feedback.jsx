import { Icon, Inbox, LoaderCircle, RefreshCw, Search, X } from "./ui/icon/icons.jsx";
import { getNoticeIconName } from "./ui/icon/registry.js";

export function LoadingState({ label = "Loading your workspace" }) {
  return <div className="loading-panel" role="status" aria-live="polite"><LoaderCircle className="spin" size={20} aria-hidden="true" />{label}</div>;
}

export function ErrorState({ error, onRetry }) {
  return <div className="error-panel motion-inline" role="alert">
    <Icon name="overdue" size={20} />
    <div><strong>We couldn’t load this information.</strong><p>{error?.message || "Please try again."}</p></div>
    {onRetry && <button type="button" className="button button-outline button-small" onClick={onRetry}><RefreshCw size={15} aria-hidden="true" />Retry</button>}
  </div>;
}

export function EmptyState({ title = "Nothing here yet", detail = "Records will appear here when they are available.", icon: IconComponent = Inbox }) {
  return <div className="empty-state"><span className="empty-icon" aria-hidden="true"><IconComponent size={22} /></span><strong>{title}</strong><p>{detail}</p></div>;
}

export function Notice({ notice, onClose }) {
  if (!notice) return null;
  const type = notice.type === "error" || notice.type === "success" || notice.type === "warning" || notice.type === "info"
    ? notice.type
    : "info";
  const isError = type === "error";
  return <div
    className={`notice notice-${type} motion-inline`}
    role={isError ? "alert" : "status"}
    aria-live={isError ? "assertive" : "polite"}
    aria-atomic="true"
  >
    <Icon name={getNoticeIconName(type)} size={18} />
    <span>{notice.message}</span>
    {onClose && <button type="button" className="notice-dismiss" aria-label="Dismiss notification" onClick={onClose}><X size={16} aria-hidden="true" /></button>}
  </div>;
}

export function SkeletonRows({ rows = 5 }) {
  return <div className="skeleton-list" role="status" aria-label="Loading records">{Array.from({ length: rows }, (_, index) =>
    <div className="skeleton-row" key={index}><i /><i /><i /><i /></div>
  )}</div>;
}

// Kept for callers that want a lightweight inline search affordance.
export const SearchIcon = Search;
