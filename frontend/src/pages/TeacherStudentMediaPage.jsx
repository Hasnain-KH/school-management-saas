import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Plus, RefreshCw, Upload } from "../components/ui/icon/icons.jsx";
import { get, post, queryString } from "../api/client.js";
import Modal from "../components/Modal.jsx";
import ModuleHeader from "../components/ModuleHeader.jsx";
import { notify } from "../components/feedback/appFeedback.js";
import { EmptyState, ErrorState, SkeletonRows } from "../components/feedback.jsx";
import { buildDirectAuthorizePayload, buildUploadRequest, effectiveLimitFor, formatUploadLimitHint, sha256Hex } from "../utils/student-media-upload.js";

const VIDEO_MAX_SECONDS = 60; // advisory browser check; backend capabilities may provide a different value
const CATEGORIES = [
  ["photo", "Photo"], ["video", "Video"], ["certificate", "Certificate"], ["project", "Project"],
  ["educational_activity", "Educational activity"], ["school_event", "School event"], ["achievement", "Achievement"], ["other", "Other"]
];
const MEDIA_TYPES = [["photo", "Photo"], ["video", "Video"], ["certificate", "Certificate"], ["project", "Project"], ["document", "Document"]];
const ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,application/pdf,.doc,.docx,.ppt,.pptx,.zip";

const fmtBytes = (b) => { if (!b) return "—"; if (b < 1024) return `${b} B`; if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`; return `${(b / (1024 * 1024)).toFixed(1)} MB`; };
const fmtDate = (v) => { if (!v) return "—"; const d = new Date(v); return Number.isNaN(d.valueOf()) ? "—" : d.toLocaleDateString(); };
const label = (v) => String(v || "").replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
const readBase64 = (file) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => { const s = String(r.result || ""); const i = s.indexOf(","); resolve(i >= 0 ? s.slice(i + 1) : s); }; r.onerror = () => reject(new Error("File could not be read")); r.readAsDataURL(file); });
const videoDuration = (file) => new Promise((resolve) => { if (!file.type.startsWith("video/")) return resolve(null); const v = document.createElement("video"); v.preload = "metadata"; v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); resolve(Math.round(v.duration || 0)); }; v.onerror = () => { URL.revokeObjectURL(v.src); resolve(null); }; v.src = URL.createObjectURL(file); });
const videoLimitSeconds = (capabilities) => { const configured = Number(capabilities?.limits?.videoMaxSeconds); return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : VIDEO_MAX_SECONDS; };

function StatusBadge({ value }) {
  const map = { pending_review: "warn", changes_requested: "warn", approved: "success", published: "success", rejected: "danger", archived: "neutral", removed: "danger", draft: "neutral", approved_unpublished: "warn", unpublished: "neutral", verified: "success", pending: "warn", blocked: "danger", withdrawn: "danger" };
  const tone = map[value] || "neutral";
  return <span className={`status-pill status-${tone}`}>{label(value)}</span>;
}

function UploadModal({ busy, onClose, onSubmit, students, initial, capabilities }) {
  const [file, setFile] = useState(null);
  const [formError, setFormError] = useState("");
  const [dirty, setDirty] = useState(false);
  const fileRef = useRef(null);

  const submit = async (e) => {
    e.preventDefault();
    setFormError("");
    const fd = new FormData(e.currentTarget);
    const selected = fileRef.current?.files?.[0];
    if (!selected) { setFormError("Choose a file to upload."); return; }
    const mediaType = fd.get("mediaType");
    const category = fd.get("category");
    const max = effectiveLimitFor(mediaType, capabilities);
    if (selected.size > max) { setFormError(`File exceeds the ${fmtBytes(max)} limit for this media type.`); return; }
    let durationSeconds = null;
    if (mediaType === "video" || category === "video" || selected.type.startsWith("video/")) {
      durationSeconds = await videoDuration(selected);
      if (!durationSeconds) { setFormError("Could not read video duration. Please try another file."); return; }
      const maxSeconds = videoLimitSeconds(capabilities);
      if (durationSeconds > maxSeconds) { setFormError(`Videos must be ${maxSeconds} seconds or shorter.`); return; }
    }
    try {
      const directEligible = Boolean(capabilities?.directUploadSupported) && selected.size <= max;
      const selectedIds = fd.getAll("studentIds").filter(Boolean);
      const studentId = initial?.primaryStudentId || fd.get("studentId") || selectedIds[0];
      const studentIds = initial ? (initial.studentIds || [studentId]) : (selectedIds.length ? selectedIds : [studentId].filter(Boolean));
      if (!studentId || !studentIds.length) { setFormError("Select at least one student."); return; }
      await onSubmit({
        title: fd.get("title"), description: fd.get("description") || "", teacherNote: fd.get("teacherNote") || "",
        mediaType, category, eventDate: fd.get("eventDate") || undefined,
        fileName: selected.name, contentType: selected.type || "application/octet-stream",
        // Direct uploads never base64-encode the file; the base64 path stays available as before.
        ...(directEligible ? {} : { dataBase64: await readBase64(selected) }),
        studentId, studentIds, ...(durationSeconds ? { durationSeconds } : {})
      }, selected);
      setDirty(false);
    } catch (err) {
      setFormError(err.message || "The selected file could not be read.");
    }
  };

  return <Modal title={initial ? "Resubmit media" : "Upload student media"} onClose={onClose} dirty={dirty && !busy} closeBlocked={busy} closeBlockedMessage="Please wait for the upload to finish." dirtyMessage="You have an unfinished upload. Close without saving?">
    <form className="form-stack modal-form" onSubmit={submit} onChange={() => setDirty(true)} onInput={() => setDirty(true)}>
      {formError && <div className="form-error" role="alert">{formError}</div>}
      {!initial && <label>Primary student<select name="studentId" required defaultValue=""><option value="">Select student</option>{students.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} — {s.admissionNumber}</option>)}</select></label>}
      {!initial && <label>Affected students <span className="optional">(all identifiable students)</span><select name="studentIds" multiple size={Math.min(6, Math.max(3, students.length || 3))}>{students.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} — {s.admissionNumber}</option>)}</select><small className="field-hint">Hold Ctrl/Cmd to select multiple. All affected students must have verified consent before publication.</small></label>}
      {initial && <div className="form-hint">Resubmitting replaces the previous file and sends the item back to admin review.</div>}
      <label>Title<input name="title" required minLength={2} maxLength={160} defaultValue={initial?.title || ""} /></label>
      <label>Description<textarea name="description" maxLength={2000} rows={3} defaultValue={initial?.description || ""} /></label>
      <label>Teacher note <span className="optional">(optional)</span><textarea name="teacherNote" maxLength={2000} rows={2} defaultValue={initial?.teacherNote || ""} /></label>
      <div className="form-grid">
        <label>Media type<select name="mediaType" defaultValue={initial?.mediaType || "photo"}>{MEDIA_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>Category<select name="category" defaultValue={initial?.category || "photo"}>{CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      </div>
      <label>Event date <span className="optional">(optional)</span><input type="date" name="eventDate" defaultValue={initial?.eventDate ? String(initial.eventDate).slice(0, 10) : ""} /></label>
      <label>File <span className="optional">({formatUploadLimitHint(capabilities).replace(/\.$/, "")})</span><input ref={fileRef} type="file" accept={ACCEPT} required disabled={busy} onChange={(e) => { setFile(e.target.files?.[0] || null); setFormError(""); setDirty(true); }} /></label>
      {file && <small className="field-hint">Selected: {file.name} ({fmtBytes(file.size)})</small>}
      {busy && <div className="upload-status" role="status" aria-live="polite"><span className="upload-status-bar" aria-hidden="true" /><span>Uploading media… Please keep this window open.</span></div>}
      <div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose} disabled={busy}>Cancel</button><button className="button button-primary" disabled={busy || !file}><Upload size={16} />{busy ? "Uploading…" : initial ? "Resubmit for review" : "Submit for review"}</button></div>
    </form>
  </Modal>;
}

export default function TeacherStudentMediaPage() {
  const [items, setItems] = useState([]);
  const [students, setStudents] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [resubmitItem, setResubmitItem] = useState(null);
  const [capabilities, setCapabilities] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await get(`/student-media/teacher${queryString({ page, limit: 20, status: status || undefined, category: category || undefined })}`);
      setItems(Array.isArray(result?.items) ? result.items : []); setPagination(result?.pagination || null);
    } catch (e) { setError(e.message || "Could not load student media."); }
    finally { setLoading(false); }
  }, [page, status, category]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { get("/student-media/teacher/students").then((r) => setStudents(Array.isArray(r) ? r : (r?.items || []))).catch(() => {}); }, []);
  useEffect(() => {
    let active = true;
    // Optional enhancement: the page keeps working with local limits and the base64 path if this fails.
    get("/student-media/teacher/capabilities")
      .then((result) => { if (active) setCapabilities(result || null); })
      .catch(() => { if (active) setCapabilities(null); });
    return () => { active = false; };
  }, []);

  const submit = async (payload, file) => {
    setBusy(true);
    try {
      const resubmit = Boolean(resubmitItem);
      const directEligible = Boolean(file && capabilities?.directUploadSupported
        && file.size <= effectiveLimitFor(payload.mediaType, capabilities));
      if (directEligible) {
        // A failed attempt is surfaced and never silently retried as base64 (that would submit twice).
        const checksumSha256 = await sha256Hex(file);
        // Resubmit-authorize takes the same body without student identifiers.
        const { studentId, studentIds, ...resubmitFields } = payload;
        const authorizePayload = buildDirectAuthorizePayload(resubmit ? resubmitFields : payload, file, checksumSha256, capabilities);
        const reservation = await post(
          resubmit ? `/student-media/teacher/${resubmitItem.id}/resubmit-authorize` : "/student-media/teacher/upload-authorize",
          authorizePayload
        );
        const request = buildUploadRequest(reservation.authorization, file);
        const response = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body,
          credentials: request.credentials
        });
        if (!response.ok) throw new Error(`Storage upload failed (${response.status}). No changes were saved; please retry.`);
        await post(
          resubmit ? `/student-media/teacher/${resubmitItem.id}/resubmit-finalize` : "/student-media/teacher/upload-finalize",
          { uploadId: reservation.uploadId, ...(payload.durationSeconds != null ? { durationSeconds: payload.durationSeconds } : {}) }
        );
      } else if (resubmit) {
        await post(`/student-media/teacher/${resubmitItem.id}/resubmit`, payload);
      } else {
        await post("/student-media/teacher/upload", payload);
      }
      notify.success(resubmit ? "Media resubmitted for review." : "Media submitted for admin review.");
      setShowUpload(false); setResubmitItem(null); setPage(1); await load();
    } catch (e) { notify.error(e, { title: "Upload failed" }); }
    finally { setBusy(false); }
  };

  return <>
    <ModuleHeader title="Student Media Studio" description="Upload student photos, videos, certificates, and projects for admin review. Published media becomes visible to linked parents only after approval and consent verification." icon={Image} action={<button className="button button-primary" onClick={() => setShowUpload(true)}><Plus size={16} />Upload media</button>} />
    <section className="content-card table-card">
      <div className="table-toolbar">
        <div><strong>My uploads</strong><span>{pagination?.total ?? items.length} records</span></div>
        <div className="toolbar-filters">
          <label className="inline-toggle">Status<select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option>{["pending_review","changes_requested","approved","rejected","archived","removed"].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></label>
          <label className="inline-toggle">Category<select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}><option value="">All categories</option>{CATEGORIES.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <button className="button button-outline button-small" onClick={load}><RefreshCw size={14} />Refresh</button>
        </div>
      </div>
      {loading ? <SkeletonRows /> : error ? <ErrorState error={{ message: error }} onRetry={load} /> : items.length ? <>
        <div className="table-scroll"><table><thead><tr><th>Title</th><th>Category</th><th>Status</th><th>Consent</th><th>Size</th><th>Date</th><th>Actions</th></tr></thead>
          <tbody className="motion-stagger">{items.map((m) => <tr key={m.id}>
            <td><strong>{m.title}</strong><div className="table-subtext">{m.fileName}</div></td>
            <td>{label(m.category)}</td>
            <td><StatusBadge value={m.reviewStatus} /> {m.publicationStatus === "published" && <StatusBadge value="published" />}</td>
            <td><StatusBadge value={m.consentStatus} /></td>
            <td>{fmtBytes(m.sizeBytes)}</td>
            <td>{fmtDate(m.createdAt)}</td>
            <td><div className="row-actions">{m.reviewStatus === "changes_requested" && <button className="button button-small button-outline" disabled={busy} onClick={() => setResubmitItem(m)}><Upload size={14} />Resubmit</button>}{m.changeRequestReason && <span className="table-subtext">Changes requested: {m.changeRequestReason}</span>}{m.rejectionReason && <span className="table-subtext">Rejected: {m.rejectionReason}</span>}</div></td>
          </tr>)}</tbody></table></div>
        {pagination && pagination.pages > 1 && <div className="pagination"><span>Page {pagination.page} of {pagination.pages} — {pagination.total} records</span><div><button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button><button disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)}>Next</button></div></div>}
      </> : <EmptyState title="No student media yet" detail="Upload photos, videos, certificates, or projects. Every upload goes to admin review before it can be published." />}
    </section>
    {(showUpload || resubmitItem) && <UploadModal busy={busy} students={students} initial={resubmitItem} capabilities={capabilities} onClose={() => { if (busy) return; setShowUpload(false); setResubmitItem(null); }} onSubmit={submit} />}
  </>;
}
