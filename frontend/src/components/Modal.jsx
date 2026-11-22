import { useEffect, useRef, useState } from "react";
import { X } from "./ui/icon/icons.jsx";
import { confirmUnsavedNavigation, setUnsavedSource } from "./feedback/unsavedChanges.js";

export default function Modal({
  title,
  children,
  onClose,
  size,
  className = "",
  role = "dialog",
  ariaDescribedBy,
  hideHeader = false,
  closeLabel = "Close dialog",
  dirty = false,
  dirtyMessage = "You have unsaved changes. Close without saving?",
  closeBlocked = false,
  closeBlockedMessage = "Please wait for the current action to finish."
}) {
  const dialogRef = useRef(null);
  const previousFocus = useRef(null);
  const onCloseRef = useRef(onClose);
  const dirtyRef = useRef(dirty);
  const dirtyMessageRef = useRef(dirtyMessage);
  const closeBlockedRef = useRef(closeBlocked);
  const closeBlockedMessageRef = useRef(closeBlockedMessage);
  const closeTimer = useRef(null);
  const requestCloseRef = useRef(() => onCloseRef.current());
  const [closing, setClosing] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const dirtyId = useRef(`modal-${Math.random().toString(36).slice(2)}`);
  const effectiveDirty = dirty || formDirty;
  onCloseRef.current = onClose;
  dirtyRef.current = effectiveDirty;
  dirtyMessageRef.current = dirtyMessage;
  closeBlockedRef.current = closeBlocked;
  closeBlockedMessageRef.current = closeBlockedMessage;
  requestCloseRef.current = () => {
    if (closing) return;
    if (closeBlockedRef.current) {
      window.alert(closeBlockedMessageRef.current);
      return;
    }
    if (dirtyRef.current && !confirmUnsavedNavigation(dirtyMessageRef.current)) return;
    setClosing(true);
    closeTimer.current = setTimeout(() => onCloseRef.current(), 140);
  };

  useEffect(() => {
    const id = dirtyId.current;
    setUnsavedSource(id, Boolean(effectiveDirty), dirtyMessage);
    return () => setUnsavedSource(id, false, dirtyMessage);
  }, [effectiveDirty, dirtyMessage]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const markDirty = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest("[data-no-dirty]")) return;
      if (target.matches("input, select, textarea")) setFormDirty(true);
    };
    dialog.addEventListener("change", markDirty);
    dialog.addEventListener("input", markDirty);
    return () => {
      dialog.removeEventListener("change", markDirty);
      dialog.removeEventListener("input", markDirty);
    };
  }, []);

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
        requestCloseRef.current();
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
      if (closeTimer.current) clearTimeout(closeTimer.current);
      document.body.style.overflow = previousOverflow;
      if (previousFocus.current?.isConnected) previousFocus.current.focus();
    };
  }, []);

  const dialogClassName = [
    "modal-card",
    size ? `modal-card-${size}` : "",
    className
  ].filter(Boolean).join(" ");

  const requestClose = () => requestCloseRef.current();

  return <div className={`modal-backdrop${closing ? " modal-backdrop-closing" : ""}`} onMouseDown={(event) => event.target === event.currentTarget && requestClose()}>
    <section
      ref={dialogRef}
      className={`${dialogClassName}${closing ? " modal-card-closing" : ""}`}
      role={role}
      aria-modal="true"
      aria-labelledby="modal-title"
      aria-describedby={ariaDescribedBy}
      tabIndex={-1}
    >
      {!hideHeader && <header className="modal-header">
        <h2 id="modal-title">{title}</h2>
        <button type="button" className="icon-button" onClick={requestClose} aria-label={closeLabel}><X size={18} aria-hidden="true" /></button>
      </header>}
      {children}
    </section>
  </div>;
}
