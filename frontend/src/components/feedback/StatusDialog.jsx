import { useId, useRef, useState } from "react";
import Modal from "../Modal.jsx";
import IconBadge from "../ui/icon/IconBadge.jsx";
import { LoaderCircle } from "../ui/icon/icons.jsx";
import { getConfirmPresentation } from "../ui/icon/registry.js";
import { canSubmitFeedback } from "./feedbackHelpers.js";

/** Shared confirmation/status surface used by the appFeedback API. */
export default function StatusDialog({ dialog, onClose }) {
  const descriptionId = useId();
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const presentation = getConfirmPresentation(dialog.variant);
  const isConfirm = dialog.kind === "confirm";

  const cancel = () => {
    if (!busy) onClose(dialog.id, false);
  };

  const confirm = async () => {
    if (!canSubmitFeedback({ confirming: locked.current })) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      if (isConfirm) {
        const result = dialog.onConfirm?.();
        if (result && typeof result.then === "function") await result;
      }
      onClose(dialog.id, true);
    } catch (reason) {
      setError(reason?.message || "That action could not be completed.");
      locked.current = false;
      setBusy(false);
    }
  };

  return <Modal
    title={dialog.title || "Update complete"}
    onClose={cancel}
    role="dialog"
    className="modal-card-confirm"
    ariaDescribedBy={descriptionId}
    titleId={titleId}
    hideHeader
    closeLabel="Close dialog"
  >
    <div className="confirm-dialog">
      <IconBadge
        name={busy ? "loading" : presentation.icon}
        tone={presentation.tone}
        className="confirm-status motion-pop"
      />
      <h2 className="confirm-title" id={titleId}>{dialog.title}</h2>
      {dialog.message && <p className="confirm-message" id={descriptionId}>{dialog.message}</p>}
      {error && <p className="confirm-error" role="alert">{error}</p>}
      <div className="confirm-actions">
        {isConfirm && <button type="button" className="button button-outline" disabled={busy} onClick={cancel}>
          {dialog.cancelText || "Cancel"}
        </button>}
        <button type="button" className={isConfirm ? "button button-danger" : "button button-primary"} disabled={busy} onClick={confirm}>
          {busy ? <><LoaderCircle className="spin" size={16} aria-hidden="true" />Working…</> : (dialog.confirmText || "Close")}
        </button>
      </div>
    </div>
  </Modal>;
}
