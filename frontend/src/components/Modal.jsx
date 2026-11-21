import { useEffect, useRef } from "react";
import { X } from "./ui/icon/icons.jsx";

export default function Modal({
  title,
  children,
  onClose,
  size,
  className = "",
  role = "dialog",
  ariaDescribedBy,
  hideHeader = false,
  closeLabel = "Close dialog"
}) {
  const dialogRef = useRef(null);
  const previousFocus = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    previousFocus.current = document.activeElement;
    const dialog = dialogRef.current;
    const focusable = () => [...dialog.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter((element) => element.getAttribute("aria-hidden") !== "true" && !element.hidden && element.getClientRects().length > 0);
    const initialFocus = dialog.querySelector("[autofocus]") || dialog.querySelector("input:not([disabled]), select:not([disabled]), textarea:not([disabled])") || focusable()[0] || dialog;
    initialFocus.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (previousFocus.current?.isConnected) previousFocus.current.focus();
    };
  }, []);

  const dialogClassName = [
    "modal-card",
    size ? `modal-card-${size}` : "",
    className
  ].filter(Boolean).join(" ");

  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section
      ref={dialogRef}
      className={dialogClassName}
      role={role}
      aria-modal="true"
      aria-labelledby="modal-title"
      aria-describedby={ariaDescribedBy}
      tabIndex={-1}
    >
      {!hideHeader && <header className="modal-header">
        <h2 id="modal-title">{title}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label={closeLabel}><X size={18} aria-hidden="true" /></button>
      </header>}
      {children}
    </section>
  </div>;
}
