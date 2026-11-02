import Modal from "./Modal.jsx";

export default function ConfirmDialog({ title, message, confirmLabel = "Confirm", busy = false, onClose, onConfirm }) {
  return <Modal title={title} onClose={onClose}>
    <div className="confirm-dialog">
      <p>{message}</p>
      <div className="modal-actions">
        <button type="button" className="button button-outline" disabled={busy} onClick={onClose}>Cancel</button>
        <button type="button" className="button button-danger" disabled={busy} onClick={onConfirm}>{busy ? "Working…" : confirmLabel}</button>
      </div>
    </div>
  </Modal>;
}
