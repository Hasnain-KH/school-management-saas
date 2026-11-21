import { useEffect, useId, useRef, useState } from "react";
import Modal from "./Modal.jsx";
import IconBadge from "./ui/icon/IconBadge.jsx";
import { LoaderCircle } from "./ui/icon/icons.jsx";
import { getConfirmPresentation } from "./ui/icon/registry.js";
import { canSubmitFeedback } from "./feedback/feedbackHelpers.js";

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busy = false,
  variant = "danger",
  onClose,
  onConfirm
}) {
  const descriptionId = useId();
  const [locallyBusy, setLocallyBusy] = useState(false);
  const confirming = useRef(false);
  const locked = busy || locallyBusy;
  const presentation = getConfirmPresentation(variant);

  useEffect(() => {
    if (!busy) {
      confirming.current = false;
      setLocallyBusy(false);
    }
  }, [busy]);

  const confirm = () => {
    if (!canSubmitFeedback({ locked, confirming: confirming.current })) return;
    confirming.current = true;
    setLocallyBusy(true);
    try {
      onConfirm();
    } catch (error) {
      confirming.current = false;
      setLocallyBusy(false);
      throw error;
    }
  };

  const close = () => {
    if (locked) return;
    onClose();
  };

  return <Modal
    title={title}
    onClose={close}
    className="modal-card-confirm"
    ariaDescribedBy={descriptionId}
    hideHeader
    closeLabel="Close confirmation"
  >
    <div className="confirm-dialog">
      <IconBadge name={presentation.icon} tone={presentation.tone} className="confirm-status motion-pop" />
      <h2 className="confirm-title" id="modal-title">{title}</h2>
      <p className="confirm-message" id={descriptionId}>{message}</p>
      <div className="confirm-actions">
        <button type="button" className="button button-outline" disabled={locked} onClick={close}>{cancelLabel}</button>
        <button type="button" className="button button-danger" disabled={locked} onClick={confirm}>
          {locked ? <><LoaderCircle className="spin" size={16} aria-hidden="true" />Working…</> : confirmLabel}
        </button>
      </div>
    </div>
  </Modal>;
}
