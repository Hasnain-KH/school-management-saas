import { useCallback, useEffect, useState } from "react";
import { ChartNoAxesCombined, RefreshCw } from "../components/ui/icon/icons.jsx";
import { get } from "../api/client.js";
import ModuleHeader from "../components/ModuleHeader.jsx";
import { EmptyState, ErrorState, SkeletonRows } from "../components/feedback.jsx";

const fmtBytes = (b) => {
  if (!b && b !== 0) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};
const pct = (ratio) => `${Math.round((ratio || 0) * 100)}%`;

export default function AdminStudentMediaUsagePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await get("/student-media/admin/usage")); }
    catch (e) { setError(e.message || "Could not load media usage."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const warning = data?.quota?.warningLevel || 0;
  const warningTone = warning >= 100 ? "danger" : warning >= 85 ? "warn" : warning >= 70 ? "warn" : "success";

  return <>
    <ModuleHeader title="Media Usage & Storage" description="Application-tracked student media usage and configurable quota controls. Provider-reported usage is shown only when verified." icon={ChartNoAxesCombined} action={<button className="button button-outline" onClick={load}><RefreshCw size={16} />Refresh</button>} />
    {loading ? <div className="content-card"><SkeletonRows /></div> : error ? <div className="content-card"><ErrorState error={{ message: error }} onRetry={load} /></div> : !data ? <div className="content-card"><EmptyState title="No usage data" detail="Usage data will appear after media is uploaded." /></div> : <>
      <div className="metrics-grid" style={{ marginBottom: 20 }}>
        <article className="metric-card"><small>Tracked media</small><strong>{data.tracked.mediaCount}</strong><span>Active, non-removed records</span></article>
        <article className="metric-card"><small>Tracked storage</small><strong>{fmtBytes(data.tracked.totalBytes)}</strong><span>Application-tracked estimate</span></article>
        <article className="metric-card"><small>App quota</small><strong>{fmtBytes(data.quota.appQuotaBytes)}</strong><span>{pct(data.quota.usageRatio)} used</span></article>
        <article className="metric-card"><small>Uploads (30 days)</small><strong>{data.tracked.uploadsLast30Days}</strong><span>Recent upload activity</span></article>
      </div>

      <section className="content-card" style={{ marginBottom: 20 }}>
        <div className="section-heading"><div><strong>Quota status</strong><span>Configurable application-level limit</span></div><span className={`status-pill status-${warningTone}`}>{warning >= 100 ? "Quota reached" : warning > 0 ? `${warning}% warning` : "Healthy"}</span></div>
        <div style={{ marginTop: 12 }}>
          <div style={{ height: 12, background: "var(--surface-3)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, Math.round((data.quota.usageRatio || 0) * 100))}%`, height: "100%", background: warning >= 100 ? "var(--danger)" : warning >= 85 ? "var(--warning, #d97706)" : "var(--primary)" }} />
          </div>
          <div className="table-subtext" style={{ marginTop: 8 }}>{fmtBytes(data.quota.usedBytes)} used of {fmtBytes(data.quota.appQuotaBytes)}. Remaining: {fmtBytes(data.quota.remainingBytes)}. {data.quota.blocked ? "New uploads are blocked; existing media is preserved." : "Uploads are allowed."}</div>
        </div>
      </section>

      <section className="content-card table-card" style={{ marginBottom: 20 }}>
        <div className="table-toolbar"><div><strong>Media type breakdown</strong><span>Application-tracked</span></div></div>
        {data.tracked.byType?.length ? <div className="table-scroll"><table><thead><tr><th>Type</th><th>Count</th><th>Tracked size</th></tr></thead><tbody>{data.tracked.byType.map((t) => <tr key={t.mediaType}><td>{String(t.mediaType).replaceAll("_"," ").replace(/^./,c=>c.toUpperCase())}</td><td>{t.count}</td><td>{fmtBytes(t.totalBytes)}</td></tr>)}</tbody></table></div> : <EmptyState title="No media tracked yet" detail="Type breakdown will appear after uploads." />}
      </section>

      <section className="content-card">
        <div className="section-heading"><div><strong>Storage configuration</strong><span>Verified status only</span></div></div>
        <div className="detail-grid" style={{ marginTop: 12 }}>
          <div><small>Storage provider</small><div>{data.provider.providerName || "Not configured"}</div></div>
          <div><small>Provider configured</small><div>{data.provider.configured ? "Yes" : "No"}</div></div>
          <div><small>Verified provider usage</small><div>{data.provider.verifiedUsageAvailable ? "Available" : "Not available"}</div></div>
        </div>
        <p className="table-subtext" style={{ marginTop: 12 }}>{data.provider.note}</p>
        <div className="table-subtext" style={{ marginTop: 8 }}>Limits: photos {fmtBytes(data.limits.photoMaxBytes)}, videos {fmtBytes(data.limits.videoMaxBytes)} / {data.limits.videoMaxSeconds}s, certificates {fmtBytes(data.limits.certificateMaxBytes)}, projects {fmtBytes(data.limits.projectMaxBytes)}, teacher daily uploads {data.limits.teacherDailyUploadLimit}.</div>
      </section>
    </>}
  </>;
}
