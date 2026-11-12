import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileText, Plus, Trash2 } from "lucide-react";
import { del, get, post, queryString } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import Modal from "../components/Modal.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { EmptyState, ErrorState, Notice, SkeletonRows } from "../components/feedback.jsx";

const PAGE_SIZE = 25;
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
]);
const CATEGORIES = ["student", "admission", "teacher", "fee_receipt", "certificate", "other"];
const MANAGE_ROLES = ["school_admin", "principal"];

const label = (value) => String(value).replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

const formatSize = (bytes) => {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatWhen = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : date.toLocaleDateString();
};

const readFileAsBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = String(reader.result || "");
    const comma = result.indexOf(",");
    resolve(comma >= 0 ? result.slice(comma + 1) : result);
  };
  reader.onerror = () => reject(new Error("The selected file could not be read."));
  reader.readAsDataURL(file);
});

function UploadModal({ busy, onClose, onSubmit }) {
  const [students, setStudents] = useState([]);
  const [studentsError, setStudentsError] = useState("");
  const [file, setFile] = useState(null);
  const [formError, setFormError] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    get("/students?status=enrolled&limit=100")
      .then((result) => setStudents(result.items || []))
      .catch((reason) => setStudentsError(reason.message || "Could not load students."));
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setFormError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const selected = fileRef.current?.files?.[0];
    if (!selected) { setFormError("Choose a file to upload."); return; }
    if (selected.size > MAX_BYTES) { setFormError("Files must be 5 MB or smaller."); return; }
    if (!ALLOWED_TYPES.has(selected.type)) { setFormError("Unsupported file type. Upload a PDF, image, or Office document."); return; }
    try {
      const dataBase64 = await readFileAsBase64(selected);
      await onSubmit({
        title: values.title,
        category: values.category,
        fileName: selected.name,
        contentType: selected.type,
        dataBase64,
        ...(values.studentId ? { studentId: values.studentId } : {})
      });
    } catch (reason) {
      setFormError(reason.message);
    }
  };

  return <Modal title="Upload document" onClose={onClose}><form className="form-stack modal-form" onSubmit={submit}>
    {formError && <div className="form-error" role="alert">{formError}</div>}
    <label>Title<input name="title" required minLength={2} maxLength={160} /></label>
    <label>Category<select name="category" defaultValue="student">{CATEGORIES.map((category) => <option key={category} value={category}>{label(category)}</option>)}</select></label>
    <label>Link to student <span className="optional">(optional)</span><select name="studentId" defaultValue="" disabled={Boolean(studentsError)}><option value="">No linked student</option>{students.map((student) => <option key={student._id || student.id} value={student._id || student.id}>{student.firstName} {student.lastName} · {student.admissionNumber}</option>)}</select></label>
    {studentsError && <small className="field-hint">{studentsError} You can still upload without linking a student.</small>}
    <label>File <span className="optional">(PDF, image, or Office document · max 5 MB)</span><input ref={fileRef} type="file" required onChange={(event) => { setFile(event.target.files?.[0] || null); setFormError(""); }} /></label>
    <div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy || !file}>{busy ? "Uploading…" : "Upload document"}</button></div>
  </form></Modal>;
}

export default function DocumentsPage() {
  const { user } = useAuth();
  const canManage = MANAGE_ROLES.includes(user?.role);
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await get(`/documents${queryString({ page, limit: PAGE_SIZE, category: category || undefined })}`);
      setItems(Array.isArray(result?.items) ? result.items : []);
      setPagination(result?.pagination || null);
    } catch (reason) {
      setError(reason.message || "Could not load documents.");
    } finally {
      setLoading(false);
    }
  }, [page, category]);

  useEffect(() => { load(); }, [load]);

  const upload = async (payload) => {
    setBusy(true);
    try {
      await post("/documents", payload);
      setNotice({ type: "success", message: "Document uploaded." });
      setUploading(false);
      setPage(1);
      await load();
    } catch (reason) {
      setNotice({ type: "error", message: reason.message });
    } finally {
      setBusy(false);
    }
  };

  const download = async (document) => {
    setBusy(true);
    try {
      const result = await get(`/documents/${document.id}/download`);
      if (result?.url) window.open(result.url, "_blank", "noopener,noreferrer");
      else setNotice({ type: "error", message: "No download link is available for this document." });
    } catch (reason) {
      setNotice({ type: "error", message: reason.message });
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await del(`/documents/${confirmation.id}`);
      setNotice({ type: "success", message: "Document deleted." });
      setConfirmation(null);
      await load();
    } catch (reason) {
      setNotice({ type: "error", message: reason.message });
    } finally {
      setBusy(false);
    }
  };

  return <>
    <div className="page-intro">
      <div>
        <div className="page-kicker">SCHOOLFLOW WORKSPACE</div>
        <h1>Documents</h1>
        <p>{canManage ? "Store and share student, staff, and school records securely." : "Documents your school has shared with you."}</p>
      </div>
      {canManage && <div className="intro-action"><button className="button button-primary" onClick={() => setUploading(true)}><Plus size={16} />Upload document</button></div>}
    </div>
    <Notice notice={notice} onClose={() => setNotice(null)} />
    <section className="content-card table-card">
      <div className="table-toolbar">
        <div><strong>Document library</strong><span>{pagination?.total ?? items.length} records</span></div>
        <label className="inline-toggle">Category<select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}><option value="">All categories</option>{CATEGORIES.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
      </div>
      {loading ? <SkeletonRows /> : error ? <ErrorState error={{ message: error }} onRetry={load} /> : items.length ? <>
        <div className="table-scroll"><table><thead><tr><th>Title</th><th>Category</th><th>File</th><th>Size</th><th>Uploaded</th><th>Actions</th></tr></thead>
          <tbody>{items.map((document) => <tr key={document.id}>
            <td><strong>{document.title}</strong></td>
            <td><span className={`badge badge-${document.category}`}>{label(document.category)}</span></td>
            <td className="document-file"><FileText size={15} />{document.fileName}</td>
            <td>{formatSize(document.sizeBytes)}</td>
            <td>{formatWhen(document.createdAt)}</td>
            <td><div className="row-actions">
              <button className="button button-small button-outline" disabled={busy} onClick={() => download(document)}><Download size={15} />Download</button>
              {canManage && <button className="button button-small button-outline button-danger" disabled={busy} onClick={() => setConfirmation(document)}><Trash2 size={15} />Delete</button>}
            </div></td>
          </tr>)}</tbody></table></div>
        {pagination && pagination.pages > 1 && <div className="pagination"><span>Page {pagination.page} of {pagination.pages} · {pagination.total} records</span><div><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><button disabled={page >= pagination.pages} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>}
      </> : <EmptyState title="No documents to show" detail={canManage ? "Upload a document to get started." : "Documents shared with you will appear here."} />}
    </section>
    {uploading && <UploadModal busy={busy} onClose={() => setUploading(false)} onSubmit={upload} />}
    {confirmation && <ConfirmDialog title="Delete this document?" message={`${confirmation.title} will be removed from your document library.`} confirmLabel="Delete document" busy={busy} onClose={() => setConfirmation(null)} onConfirm={confirmDelete} />}
  </>;
}
