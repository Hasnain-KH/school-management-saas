import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Eye, RefreshCw, ShieldCheck, XCircle } from "../components/ui/icon/icons.jsx";
import { get, patch, post, queryString } from "../api/client.js";
import Modal from "../components/Modal.jsx";
import ModuleHeader from "../components/ModuleHeader.jsx";
import { notify, confirmDanger } from "../components/feedback/appFeedback.js";
import { EmptyState, ErrorState, SkeletonRows } from "../components/feedback.jsx";

const CATEGORIES = [["","All categories"],["photo","Photo"],["video","Video"],["certificate","Certificate"],["project","Project"],["educational_activity","Educational activity"],["school_event","School event"],["achievement","Achievement"],["other","Other"]];
const REVIEW_STATUSES = [["","All statuses"],["pending_review","Pending review"],["changes_requested","Changes requested"],["approved","Approved"],["rejected","Rejected"],["archived","Archived"],["removed","Removed"]];
const label = (v) => String(v || "").replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
const fmtBytes = (b) => { if (!b) return "—"; if (b < 1024*1024) return `${(b/1024).toFixed(1)} KB`; return `${(b/(1024*1024)).toFixed(1)} MB`; };
const fmtDate = (v) => v ? new Date(v).toLocaleString() : "—";

function Badge({ value }) {
  const tone = ({ pending_review:"warn", changes_requested:"warn", approved:"success", published:"success", rejected:"danger", archived:"neutral", removed:"danger", draft:"neutral", approved_unpublished:"warn", unpublished:"neutral", verified:"success", pending:"warn", blocked:"danger", withdrawn:"danger", granted:"success" })[value] || "neutral";
  return <span className={`status-pill status-${tone}`}>{label(value)}</span>;
}

function MediaPreview({ access }) {
  if (!access?.url) return <div className="empty-state"><p>Preview unavailable.</p></div>;
  const ct = access.contentType || "";
  if (ct.startsWith("image/")) return <img src={access.url} alt={access.fileName || "Student media"} style={{ maxWidth: "100%", borderRadius: 12 }} />;
  if (ct.startsWith("video/")) return <video src={access.url} controls style={{ width: "100%", borderRadius: 12 }} />;
  if (ct === "application/pdf") return <iframe src={access.url} title={access.fileName || "Document preview"} style={{ width: "100%", minHeight: 420, border: "1px solid var(--border)", borderRadius: 12 }} />;
  return <a className="button button-outline" href={access.url} target="_blank" rel="noopener noreferrer">Open file securely</a>;
}

function ConsentManager({ media, detail, onChanged }) {
  const [guardians, setGuardians] = useState([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ studentId: media.studentIds?.[0] || "", guardianId: "", status: "granted", scope: "all", notes: "" });
  useEffect(() => { get("/students/guardians?limit=100").then((r) => setGuardians(r?.items || r?.data?.items || r || [])).catch(() => setGuardians([])); }, []);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      await post("/student-media/consents", { studentId: form.studentId, guardianId: form.guardianId, status: form.status, scope: form.scope, notes: form.notes });
      notify.success("Consent record saved."); setForm((f) => ({ ...f, notes: "" })); await onChanged();
    } catch (err) { notify.error(err, { title: "Consent update failed" }); }
    finally { setBusy(false); }
  };
  const withdraw = async (id) => {
    setBusy(true);
    try { await post(`/student-media/consents/${id}/withdraw`, { notes: "Withdrawn by administrator" }); notify.success("Consent withdrawn."); await onChanged(); }
    catch (err) { notify.error(err, { title: "Withdraw failed" }); }
    finally { setBusy(false); }
  };
  const records = detail?.consentRecords || [];
  return <div className="stack-gap">
    <div><strong>Consent records</strong> <span className="table-subtext">Publication is blocked until every affected student has valid consent.</span></div>
    <div className="table-scroll"><table><thead><tr><th>Student</th><th>Guardian</th><th>Status</th><th>Scope</th><th>Updated</th><th>Action</th></tr></thead><tbody>
      {records.length ? records.map((c) => <tr key={c.id}><td>{c.studentId}</td><td>{c.guardianId}</td><td><Badge value={c.status} /></td><td>{label(c.scope)}</td><td>{fmtDate(c.updatedAt)}</td><td>{c.status !== "withdrawn" && <button className="button button-small button-outline button-danger" disabled={busy} onClick={() => withdraw(c.id)}>Withdraw</button>}</td></tr>) : <tr><td colSpan={6}>No consent records found for affected students.</td></tr>}
    </tbody></table></div>
    <form className="form-stack" onSubmit={submit}>
      <div className="form-grid">
        <label>Affected student<select value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} required><option value="">Select student</option>{(detail?.students || []).map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}</select></label>
        <label>Guardian<select value={form.guardianId} onChange={(e) => setForm({ ...form, guardianId: e.target.value })} required><option value="">Select guardian</option>{(Array.isArray(guardians) ? guardians : []).map((g) => <option key={g.id || g._id} value={g.id || g._id}>{g.name || g.fullName || g.id || g._id}</option>)}</select></label>
        <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="granted">Granted</option><option value="withdrawn">Withdrawn</option><option value="blocked">Blocked</option></select></label>
        <label>Scope<select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>{["all","photos","videos","certificates","projects","activities","events","achievements"].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></label>
      </div>
      <label>Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={1000} rows={2} /></label>
      <div><button className="button button-primary" disabled={busy || !form.studentId || !form.guardianId}>{busy ? "Saving…" : "Save consent record"}</button></div>
    </form>
  </div>;
}

function DetailModal({ item, onClose, onAction }) {
  const [detail, setDetail] = useState(null);
  const [access, setAccess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, a] = await Promise.all([get(`/student-media/admin/${item.id}`), get(`/student-media/${item.id}/access`)]);
      setDetail(d); setAccess(a);
    } catch (e) { notify.error(e, { title: "Could not load media" }); }
    finally { setLoading(false); }
  }, [item.id]);
  useEffect(() => { load(); }, [load]);

  const act = async (action, confirmMsg) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true);
    try {
      await post(`/student-media/admin/${item.id}/${action}`, { reason, note });
      notify.success(`Media ${action.replaceAll("-", " ")}.`);
      await onAction();
    } catch (e) { notify.error(e, { title: "Action failed" }); }
    finally { setBusy(false); }
  };

  const m = detail?.media || item;
  return <Modal title="Media review detail" onClose={onClose} closeBlocked={busy}>
    {loading ? <SkeletonRows /> : <div className="stack-gap">
      <div className="detail-grid">
        <div><strong>{m.title}</strong><div className="table-subtext">{m.fileName} — {fmtBytes(m.sizeBytes)}</div></div>
        <div><Badge value={m.reviewStatus} /> <Badge value={m.publicationStatus} /> <Badge value={m.consentStatus} /></div>
      </div>
      <MediaPreview access={access} />
      <div className="detail-grid">
        <div><small>Category</small><div>{label(m.category)}</div></div>
        <div><small>Type</small><div>{label(m.mediaType)}</div></div>
        <div><small>Event date</small><div>{fmtDate(m.eventDate)}</div></div>
        <div><small>Uploaded</small><div>{fmtDate(m.createdAt)}</div></div>
      </div>
      {m.description && <div><small>Description</small><p>{m.description}</p></div>}
      {m.teacherNote && <div><small>Teacher note</small><p>{m.teacherNote}</p></div>}
      <div><small>Students</small><div>{(detail?.students || []).map((s) => <span key={s.id} className="status-pill status-neutral" style={{ marginRight: 6 }}>{s.firstName} {s.lastName}</span>)}</div></div>
      <div><small>Consent verification</small><div>{detail?.consent?.ok ? <Badge value="verified" /> : <Badge value="blocked" />} {!detail?.consent?.ok && <span className="table-subtext">Missing/withdrawn consent for affected students: {[...(detail?.consent?.missingStudentIds||[]), ...(detail?.consent?.withdrawnStudentIds||[])].join(", ") || "unknown"}</span>}</div></div>
      <ConsentManager media={m} detail={detail} onChanged={load} />
      <div className="form-grid">
        <label>Review note<textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2} /></label>
        <label>Reason <span className="optional">(required for request changes/reject)</span><textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} rows={2} /></label>
      </div>
      <div className="modal-actions" style={{ flexWrap: "wrap" }}>
        <button className="button button-outline" disabled={busy} onClick={() => act("approve")}>Approve</button>
        <button className="button button-outline" disabled={busy} onClick={() => act("request-changes")}>Request changes</button>
        <button className="button button-outline button-danger" disabled={busy} onClick={() => act("reject")}>Reject</button>
        <button className="button button-primary" disabled={busy} onClick={() => act("publish", "Publish this media? It will become visible to linked parents only if consent is valid.")}>Publish</button>
        <button className="button button-outline" disabled={busy} onClick={() => act("archive")}>Archive</button>
        <button className="button button-outline button-danger" disabled={busy} onClick={() => act("remove", "Remove this media from active use? This action is audited.")}>Remove</button>
      </div>
      <details><summary>Review history</summary><div className="stack-gap">{(detail?.reviewHistory || []).map((h, i) => <div key={i} className="table-subtext"><strong>{label(h.action)}</strong> — {h.actorRole} — {fmtDate(h.at)} {h.reason ? `— ${h.reason}` : ""} {h.note ? `— ${h.note}` : ""}</div>)}</div></details>
    </div>}
  </Modal>;
}

export default function AdminStudentMediaReviewPage() {
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [reviewStatus, setReviewStatus] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await get(`/student-media/admin${queryString({ page, limit: 20, reviewStatus: reviewStatus || undefined, category: category || undefined })}`);
      setItems(Array.isArray(r?.items) ? r.items : []); setPagination(r?.pagination || null);
    } catch (e) { setError(e.message || "Could not load media review queue."); }
    finally { setLoading(false); }
  }, [page, reviewStatus, category]);
  useEffect(() => { load(); }, [load]);

  const onAction = async () => { setSelected(null); await load(); };

  return <>
    <ModuleHeader title="Student Media Review Center" description="Review, approve, publish, and manage student media. Approval and publication are separate. Publication verifies consent and privacy conditions before exposing media to parents." icon={ShieldCheck} />
    <section className="content-card table-card">
      <div className="table-toolbar">
        <div><strong>Review queue</strong><span>{pagination?.total ?? items.length} records</span></div>
        <div className="toolbar-filters">
          <label className="inline-toggle">Status<select value={reviewStatus} onChange={(e) => { setReviewStatus(e.target.value); setPage(1); }}>{REVIEW_STATUSES.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="inline-toggle">Category<select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>{CATEGORIES.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <button className="button button-outline button-small" onClick={load}><RefreshCw size={14} />Refresh</button>
        </div>
      </div>
      {loading ? <SkeletonRows /> : error ? <ErrorState error={{ message: error }} onRetry={load} /> : items.length ? <>
        <div className="table-scroll"><table><thead><tr><th>Title</th><th>Category</th><th>Review</th><th>Publication</th><th>Consent</th><th>Uploaded</th><th></th></tr></thead><tbody className="motion-stagger">{items.map((m) => <tr key={m.id}>
          <td><strong>{m.title}</strong><div className="table-subtext">{m.fileName}</div></td>
          <td>{label(m.category)}</td><td><Badge value={m.reviewStatus} /></td><td><Badge value={m.publicationStatus} /></td><td><Badge value={m.consentStatus} /></td><td>{fmtDate(m.createdAt)}</td>
          <td><button className="button button-small button-outline" onClick={() => setSelected(m)}><Eye size={14} />Review</button></td>
        </tr>)}</tbody></table></div>
        {pagination && pagination.pages > 1 && <div className="pagination"><span>Page {pagination.page} of {pagination.pages} — {pagination.total} records</span><div><button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button><button disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)}>Next</button></div></div>}
      </> : <EmptyState title="No media in review queue" detail="Teacher submissions will appear here for review." />}
    </section>
    {selected && <DetailModal item={selected} onClose={() => setSelected(null)} onAction={onAction} />}
  </>;
}
