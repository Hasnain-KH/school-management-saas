import { useCallback, useEffect, useState } from "react";
import { Image, RefreshCw } from "../components/ui/icon/icons.jsx";
import { get, queryString } from "../api/client.js";
import Modal from "../components/Modal.jsx";
import ModuleHeader from "../components/ModuleHeader.jsx";
import { notify } from "../components/feedback/appFeedback.js";
import { EmptyState, ErrorState, SkeletonRows } from "../components/feedback.jsx";

const CATEGORIES = [["","All categories"],["photo","Photo"],["video","Video"],["certificate","Certificate"],["project","Project"],["educational_activity","Educational activity"],["school_event","School event"],["achievement","Achievement"],["other","Other"]];
const label = (v) => String(v || "").replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
const fmtDate = (v) => v ? new Date(v).toLocaleDateString() : "—";
const fmtBytes = (b) => !b ? "—" : b < 1024*1024 ? `${(b/1024).toFixed(1)} KB` : `${(b/(1024*1024)).toFixed(1)} MB`;

function MediaPreview({ access }) {
  if (!access?.url) return <div className="empty-state"><p>Preview unavailable.</p></div>;
  const ct = access.contentType || "";
  if (ct.startsWith("image/")) return <img src={access.url} alt={access.fileName || "Media"} style={{ maxWidth: "100%", borderRadius: 12 }} />;
  if (ct.startsWith("video/")) return <video src={access.url} controls controlsList="nodownload" disablePictureInPicture style={{ width: "100%", borderRadius: 12 }} />;
  if (ct === "application/pdf") return <iframe src={access.url} title={access.fileName || "Document"} style={{ width: "100%", minHeight: 420, border: "1px solid var(--border)", borderRadius: 12 }} />;
  return <div className="table-subtext">Preview is not available for this file type.</div>;
}

function DetailModal({ item, onClose }) {
  const [access, setAccess] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    get(`/student-media/${item.id}/access`).then((r) => { if (active) setAccess(r); }).catch((e) => notify.error(e, { title: "Could not open media" })).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [item.id]);
  return <Modal title={item.title} onClose={onClose}>
    {loading ? <SkeletonRows /> : <div className="stack-gap">
      <MediaPreview access={access} />
      <div className="detail-grid">
        <div><small>Category</small><div>{label(item.category)}</div></div>
        <div><small>Type</small><div>{label(item.mediaType)}</div></div>
        <div><small>Event date</small><div>{fmtDate(item.eventDate)}</div></div>
        <div><small>Published</small><div>{fmtDate(item.publishedAt)}</div></div>
        <div><small>Size</small><div>{fmtBytes(item.sizeBytes)}</div></div>
      </div>
      {item.description && <div><small>Description</small><p>{item.description}</p></div>}
      {item.teacherNote && <div><small>Teacher note</small><p>{item.teacherNote}</p></div>}
      <div className="table-subtext">This media is private to your linked child. Downloads and public sharing are not available.</div>
    </div>}
  </Modal>;
}

export default function ParentMomentsPage() {
  const [children, setChildren] = useState([]);
  const [studentId, setStudentId] = useState("");
  const [category, setCategory] = useState("");
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  useEffect(() => { get("/portal/parent/children").then((r) => setChildren(Array.isArray(r) ? r : (r?.items || []))).catch(() => setChildren([])); }, []);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await get(`/student-media/parent${queryString({ page, limit: 20, studentId: studentId || undefined, category: category || undefined })}`);
      setItems(Array.isArray(r?.items) ? r.items : []); setPagination(r?.pagination || null);
    } catch (e) { setError(e.message || "Could not load moments."); }
    finally { setLoading(false); }
  }, [page, studentId, category]);
  useEffect(() => { load(); }, [load]);

  return <>
    <ModuleHeader title="My Child's Moments & Progress" description="View approved and published photos, videos, certificates, and projects for your linked children. Media is private and access is checked before every view." icon={Image} action={<button className="button button-outline" onClick={load}><RefreshCw size={16} />Refresh</button>} />
    <section className="content-card table-card">
      <div className="table-toolbar">
        <div><strong>Timeline</strong><span>{pagination?.total ?? items.length} items</span></div>
        <div className="toolbar-filters">
          <label className="inline-toggle">Child<select value={studentId} onChange={(e) => { setStudentId(e.target.value); setPage(1); }}><option value="">All linked children</option>{children.map((c) => <option key={c.studentId || c.id} value={c.studentId || c.id}>{c.firstName} {c.lastName}</option>)}</select></label>
          <label className="inline-toggle">Category<select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>{CATEGORIES.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        </div>
      </div>
      {loading ? <SkeletonRows /> : error ? <ErrorState error={{ message: error }} onRetry={load} /> : items.length ? <>
        <div className="table-scroll"><table><thead><tr><th>Title</th><th>Category</th><th>Event date</th><th>Published</th><th></th></tr></thead><tbody className="motion-stagger">{items.map((m) => <tr key={m.id}>
          <td><strong>{m.title}</strong><div className="table-subtext">{m.description ? m.description.slice(0, 90) : label(m.mediaType)}</div></td>
          <td>{label(m.category)}</td><td>{fmtDate(m.eventDate)}</td><td>{fmtDate(m.publishedAt)}</td>
          <td><button className="button button-small button-outline" onClick={() => setSelected(m)}>View</button></td>
        </tr>)}</tbody></table></div>
        {pagination && pagination.pages > 1 && <div className="pagination"><span>Page {pagination.page} of {pagination.pages} — {pagination.total} records</span><div><button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button><button disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)}>Next</button></div></div>}
      </> : <EmptyState title="No published moments yet" detail="When your child's school publishes approved media, it will appear here." />}
    </section>
    {selected && <DetailModal item={selected} onClose={() => setSelected(null)} />}
  </>;
}
