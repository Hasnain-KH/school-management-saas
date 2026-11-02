import { useCallback, useEffect, useState } from "react";
import { Archive, Boxes, Download, Plus, RotateCcw, UserRound, Wallet } from "lucide-react";
import { get, post, queryString } from "../api/client.js";
import Modal from "../components/Modal.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { EmptyState, ErrorState, LoadingState, Notice, SkeletonRows } from "../components/feedback.jsx";
import { exportCsv } from "../utils/export.js";

const currentPeriod = new Date().toISOString().slice(0, 7);
const fields = [
  { name: "assetTag", label: "Asset tag", required: true },
  { name: "name", label: "Asset name", required: true },
  { name: "category", label: "Category", required: true },
  { name: "acquisitionDate", label: "Acquired on", type: "date", required: true },
  { name: "costMinor", label: "Cost (minor currency units)", type: "number", min: 1, required: true },
  { name: "salvageValueMinor", label: "Salvage value (minor units)", type: "number", min: 0, required: true, defaultValue: "0" },
  { name: "currency", label: "Currency", required: true, defaultValue: "USD" },
  { name: "usefulLifeMonths", label: "Useful life (months)", type: "number", min: 1, required: true },
  { name: "location", label: "Location" }
];

export default function FixedAssetsPage() {
  const [assets, setAssets] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (nextPage = page) => {
    setLoading(true); setError("");
    try {
      const result = await get(`/operations/assets${queryString({ page: nextPage, limit: 25 })}`);
      setAssets(result.items || []);
      setPagination(result.pagination);
      setPage(nextPage);
    } catch (reason) { setError(reason.message || "Could not load fixed assets."); }
    finally { setLoading(false); }
  }, [page]);
  useEffect(() => { load(1); }, []);

  const submitCreate = async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const body = {
      ...form,
      costMinor: Number(form.costMinor),
      salvageValueMinor: Number(form.salvageValueMinor),
      usefulLifeMonths: Number(form.usefulLifeMonths),
      depreciationMethod: "straight_line"
    };
    setBusy(true);
    try {
      await post("/operations/assets", body);
      setNotice({ type: "success", message: "Fixed asset recorded successfully." });
      setDialog(null); await load(1);
    } catch (reason) { setNotice({ type: "error", message: reason.message }); }
    finally { setBusy(false); }
  };

  const openHistory = async (asset) => {
    setDialog({ type: "history", asset, loading: true });
    try {
      const history = await get(`/operations/assets/${asset._id}/history`);
      setDialog((current) => current?.type === "history" && current.asset._id === asset._id
        ? { ...current, history, loading: false }
        : current);
    } catch (reason) {
      setDialog((current) => current?.type === "history" && current.asset._id === asset._id
        ? { ...current, error: reason.message || "Could not load asset history.", loading: false }
        : current);
    }
  };

  const submitAction = async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const { type, asset } = dialog;
    setBusy(true);
    try {
      if (type === "assign") {
        await post(`/operations/assets/${asset._id}/assignments`, {
          assigneeType: form.assigneeType,
          assigneeId: form.assigneeId,
          note: form.note || undefined
        });
      } else if (type === "release") {
        await post(`/operations/assets/${asset._id}/release`, { note: form.note || undefined });
      } else if (type === "depreciation") {
        await post(`/operations/assets/${asset._id}/depreciation`, { period: form.period });
      } else if (type === "dispose") {
        await post(`/operations/assets/${asset._id}/dispose`, {});
      }
      setNotice({ type: "success", message: type === "depreciation" ? "Monthly depreciation recorded." : `Asset ${type === "assign" ? "assigned" : type === "release" ? "released" : "disposed"}.` });
      setDialog(null); await load();
    } catch (reason) { setNotice({ type: "error", message: reason.message }); }
    finally { setBusy(false); }
  };
  const disposeAsset = async (asset) => {
    setBusy(true);
    try {
      await post(`/operations/assets/${asset._id}/dispose`, {});
      setNotice({ type: "success", message: "Asset disposed." });
      setDialog(null);
      await load();
    } catch (reason) { setNotice({ type: "error", message: reason.message }); }
    finally { setBusy(false); }
  };

  return <>
    <header className="page-intro"><div><div className="page-kicker">SCHOOLFLOW WORKSPACE</div><h1>Fixed assets</h1><p>Maintain an auditable register, assignments, and straight-line depreciation.</p></div><div className="intro-action"><button className="button button-outline" onClick={() => exportCsv("fixed-assets.csv", assets)}><Download size={15} />Export CSV</button><button className="button button-primary" onClick={() => setDialog({ type: "create" })}><Plus size={16} />Record asset</button></div></header>
    <Notice notice={notice} onClose={() => setNotice(null)} />
    <section className="content-card table-card"><div className="table-toolbar"><div><strong>Asset register</strong><span>{pagination?.total ?? assets.length} records · values stored in minor currency units</span></div></div>
      {loading ? <SkeletonRows /> : error ? <ErrorState error={{ message: error }} onRetry={() => load()} /> : assets.length ? <div className="table-scroll"><table><thead><tr><th>Asset tag</th><th>Asset</th><th>Category</th><th>Acquired</th><th>Cost</th><th>Useful life</th><th>Status</th><th>Actions</th></tr></thead><tbody>{assets.map((asset) => <tr key={asset._id}><td><strong>{asset.assetTag}</strong></td><td>{asset.name}<div className="muted">{asset.location || "—"}</div></td><td>{asset.category}</td><td>{new Date(asset.acquisitionDate).toLocaleDateString()}</td><td>{money(asset.costMinor, asset.currency)}</td><td>{asset.usefulLifeMonths} months</td><td><span className={`badge badge-${asset.status}`}>{asset.status}</span></td><td><div className="row-actions"><button aria-label={`Assign asset ${asset.assetTag}`} className="icon-action" disabled={asset.status !== "active"} onClick={() => setDialog({ type: "assign", asset })}><UserRound size={15} /></button><button aria-label={`Record depreciation for ${asset.assetTag}`} className="icon-action" disabled={asset.status !== "active"} onClick={() => setDialog({ type: "depreciation", asset })}><Wallet size={15} /></button><button aria-label={`View history for ${asset.assetTag}`} className="icon-action" onClick={() => openHistory(asset)}><Archive size={15} /></button><button aria-label={`Release assignment for ${asset.assetTag}`} className="icon-action" disabled={asset.status !== "active"} onClick={() => setDialog({ type: "release", asset })}><RotateCcw size={15} /></button><button aria-label={`Dispose asset ${asset.assetTag}`} className="icon-action" disabled={asset.status !== "active"} onClick={() => setDialog({ type: "confirm-dispose", asset })}><Boxes size={15} /></button></div></td></tr>)}</tbody></table></div> : <EmptyState title="No fixed assets recorded" detail="Add a physical asset to begin tracking ownership and depreciation." />}
      {pagination?.pages > 1 && <div className="pagination"><span>Page {pagination.page} of {pagination.pages}</span><div><button disabled={page <= 1} onClick={() => load(page - 1)}>Previous</button><button disabled={page >= pagination.pages} onClick={() => load(page + 1)}>Next</button></div></div>}
    </section>
    {dialog?.type === "create" && <AssetForm title="Record fixed asset" busy={busy} onClose={() => setDialog(null)} onSubmit={submitCreate} />}
    {dialog && ["assign", "release", "depreciation"].includes(dialog.type) && <ActionForm dialog={dialog} busy={busy} onClose={() => setDialog(null)} onSubmit={submitAction} />}
    {dialog?.type === "confirm-dispose" && <ConfirmDialog title={`Dispose asset ${dialog.asset.assetTag}?`} message="The asset will be marked disposed, and future assignment or depreciation will be prevented. Existing history will remain available." confirmLabel="Dispose asset" busy={busy} onClose={() => setDialog(null)} onConfirm={() => disposeAsset(dialog.asset)} />}
    {dialog?.type === "history" && <Modal title={`Asset history · ${dialog.asset.assetTag}`} onClose={() => setDialog(null)}>{dialog.loading ? <LoadingState label="Loading asset history" /> : dialog.error ? <ErrorState error={{ message: dialog.error }} onRetry={() => openHistory(dialog.asset)} /> : <div className="asset-history"><h3>Assignments</h3>{dialog.history?.assignments?.length ? dialog.history.assignments.map((entry) => <div className="history-row" key={entry._id}><span className={`badge badge-${entry.action === "assigned" ? "active" : "expired"}`}>{entry.action}</span><span>{entry.assigneeType} · {entry.assigneeId}</span><small>{new Date(entry.occurredAt).toLocaleString()}</small></div>) : <p className="muted">No assignment history.</p>}<h3>Depreciation</h3>{dialog.history?.depreciation?.length ? dialog.history.depreciation.map((entry) => <div className="history-row" key={entry._id}><strong>{entry.period}</strong><span>{money(entry.amountMinor, dialog.asset.currency)}</span><small>Accumulated {money(entry.accumulatedMinor, dialog.asset.currency)}</small></div>) : <p className="muted">No depreciation recorded.</p>}</div>}</Modal>}
  </>;
}

function AssetForm({ title, busy, onClose, onSubmit }) {
  return <Modal title={title} onClose={onClose}><form className="form-stack modal-form" onSubmit={onSubmit}><p className="form-help">Straight-line depreciation is calculated from acquisition cost less salvage value. Enter currency in the smallest unit (for example, cents).</p><div className="form-grid">{fields.map((field) => <label key={field.name}>{field.label}{field.required && <span className="required"> *</span>}<input name={field.name} type={field.type || "text"} min={field.min} max={field.max} defaultValue={field.defaultValue || ""} required={field.required} /></label>)}</div><div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Record asset"}</button></div></form></Modal>;
}

function ActionForm({ dialog, busy, onClose, onSubmit }) {
  const [assigneeType, setAssigneeType] = useState("user");
  const [assignees, setAssignees] = useState([]);
  const [assigneesLoading, setAssigneesLoading] = useState(false);
  const [assigneesError, setAssigneesError] = useState("");
  const [assigneeRetry, setAssigneeRetry] = useState(0);
  const labels = { assign: "Assign asset", release: "Release asset", depreciation: "Record depreciation", dispose: "Dispose asset" };
  useEffect(() => {
    if (dialog.type !== "assign") return;
    let active = true;
    setAssigneesLoading(true);
    setAssigneesError("");
    const request = assigneeType === "student"
      ? get("/students?status=enrolled&limit=100").then((result) => (result.items || []).map((student) => ({ id: student._id || student.id, label: `${student.firstName} ${student.lastName} · ${student.admissionNumber}` })))
      : Promise.all(["school_admin", "principal", "teacher"].map((role) => get(`/users?role=${role}&status=active&limit=100`)))
        .then((results) => results.flatMap((result) => result.items || []).map((user) => ({ id: user.id, label: `${user.name} · ${user.role}` })));
    request.then((items) => { if (active) setAssignees(items); })
      .catch((reason) => { if (active) setAssigneesError(reason.message || "Could not load eligible assignees."); })
      .finally(() => { if (active) setAssigneesLoading(false); });
    return () => { active = false; };
  }, [dialog.type, assigneeType, assigneeRetry]);
  return <Modal title={`${labels[dialog.type]} · ${dialog.asset.assetTag}`} onClose={onClose}><form className="form-stack modal-form" onSubmit={onSubmit}>
    {dialog.type === "assign" && <><label>Assignee type<select name="assigneeType" value={assigneeType} onChange={(event) => setAssigneeType(event.target.value)} required><option value="user">Staff member</option><option value="student">Student</option></select></label><label>Assignee<select name="assigneeId" required disabled={assigneesLoading || Boolean(assigneesError) || !assignees.length}><option value="">{assigneesLoading ? "Loading eligible people…" : assigneesError ? "Unable to load people" : "Select a person"}</option>{assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.label}</option>)}</select></label>{assigneesError ? <div className="field-error" role="alert">{assigneesError}<button type="button" className="inline-retry" onClick={() => setAssigneeRetry((retry) => retry + 1)}>Retry</button></div> : <small className="field-hint">Only active staff or enrolled students in this school can be assigned.</small>}<label>Note<input name="note" maxLength="300" /></label></>}
    {dialog.type === "release" && <><p>Release the current assignee. This creates a separate immutable history record.</p><label>Note <span className="optional">(optional)</span><input name="note" maxLength="300" /></label></>}
    {dialog.type === "depreciation" && <><p>Each period must be recorded sequentially from the acquisition month. Duplicate and future periods are rejected.</p><label>Depreciation period<input type="month" name="period" required defaultValue={currentPeriod} /></label></>}
    {dialog.type === "dispose" && <p>This marks the asset as disposed and prevents future assignment or depreciation. Existing history is retained.</p>}
    <div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button className={`button ${dialog.type === "dispose" ? "button-danger" : "button-primary"}`} disabled={busy || (dialog.type === "assign" && (assigneesLoading || Boolean(assigneesError) || !assignees.length))}>{busy ? "Saving…" : labels[dialog.type]}</button></div>
  </form></Modal>;
}

function money(value, currency) { return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format((value || 0) / 100); }
