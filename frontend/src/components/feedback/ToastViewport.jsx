import { Icon, X } from "../ui/icon/icons.jsx";
import { TOAST_VISIBLE_LIMIT } from "./feedbackStore.js";
import { getToastIconName } from "./feedbackHelpers.js";

/** Top-end (bottom-center on mobile) toast viewport with a three-item queue. */
export default function ToastViewport({ toasts, onDismiss, onPause, onResume }) {
  const visible = toasts.slice(0, TOAST_VISIBLE_LIMIT);
  if (!visible.length) return null;

  return <div className="toast-viewport" aria-label="Notifications">
    {visible.map((toast) => {
      const iconName = getToastIconName(toast.type);
      const duration = toast.duration > 0 && !toast.persistent ? (toast.remaining ?? toast.duration) : 0;
      return <div
        key={toast.id}
        className={`toast toast-${toast.type}`}
        role={toast.type === "error" ? "alert" : "status"}
        aria-atomic="true"
        onMouseEnter={() => onPause(toast.id)}
        onMouseLeave={() => onResume(toast.id)}
        onFocus={() => onPause(toast.id)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) onResume(toast.id);
        }}
      >
        <span className="toast-icon"><Icon name={iconName} size={18} /></span>
        <div className="toast-copy">
          {toast.title && <strong className="toast-title">{toast.title}</strong>}
          {toast.description && <p className="toast-description">{toast.description}</p>}
        </div>
        <button type="button" className="toast-close" aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)}>
          <X size={16} aria-hidden="true" />
        </button>
        {duration > 0 && <span className="toast-progress" style={{ "--toast-duration": `${duration}ms` }} aria-hidden="true" />}
      </div>;
    })}
  </div>;
}
