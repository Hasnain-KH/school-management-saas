import { useCallback, useEffect, useState } from "react";
import { BellRing, CheckCheck } from "../components/ui/icon/icons.jsx";
import { get, post, queryString } from "../api/client.js";
import ModuleHeader from "../components/ModuleHeader.jsx";
import { EmptyState, ErrorState, LoadingState, Notice, SkeletonRows } from "../components/feedback.jsx";

const PAGE_SIZE = 25;

const typeLabels = {
  announcement: "Announcement",
  result: "Exam result",
  fee: "Fee reminder",
  subscription: "Subscription",
  system: "System"
};

const formatWhen = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

export default function NotificationsPage() {
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await get(`/notifications${queryString({ page, limit: PAGE_SIZE, unreadOnly: unreadOnly ? "true" : "false" })}`);
      setItems(Array.isArray(result?.items) ? result.items : []);
      setPagination(result?.pagination || null);
    } catch (reason) {
      setError(reason.message || "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }, [page, unreadOnly]);

  useEffect(() => { load(); }, [load]);

  const markRead = async (item) => {
    if (item.read) return;
    setBusy(true);
    try {
      await post(`/notifications/${item.id}/read`, {});
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read: true, readAt: new Date().toISOString() } : entry));
      window.dispatchEvent(new Event("schoolflow:notifications-changed"));
    } catch (reason) {
      setNotice({ type: "error", message: reason.message });
    } finally {
      setBusy(false);
    }
  };

  const markAllRead = async () => {
    setBusy(true);
    try {
      const result = await post("/notifications/read-all", {});
      setNotice({ type: "success", message: `Marked ${result?.updated ?? 0} notification${result?.updated === 1 ? "" : "s"} as read.` });
      window.dispatchEvent(new Event("schoolflow:notifications-changed"));
      await load();
    } catch (reason) {
      setNotice({ type: "error", message: reason.message });
    } finally {
      setBusy(false);
    }
  };

  const unreadOnPage = items.filter((item) => !item.read).length;

  return <>
    <ModuleHeader title="Notifications" description="School updates, published results, and reminders addressed to you." icon={BellRing} action={<button className="button button-outline" disabled={busy || !unreadOnPage} onClick={markAllRead}><CheckCheck size={16} />Mark all read</button>} />
    <Notice notice={notice} onClose={() => setNotice(null)} />
    <section className="content-card table-card">
      <div className="table-toolbar">
        <div><strong>Your notifications</strong><span>{pagination?.total ?? items.length} records</span></div>
        <label className="inline-toggle"><input type="checkbox" checked={unreadOnly} onChange={(event) => { setUnreadOnly(event.target.checked); setPage(1); }} />Unread only</label>
      </div>
      {loading ? <SkeletonRows /> : error ? <ErrorState error={{ message: error }} onRetry={load} /> : items.length ? <>
        <ul className="notification-list">
          {items.map((item) => <li key={item.id} className={item.read ? "notification-item" : "notification-item notification-unread"}>
            <span className="notification-icon" aria-hidden="true"><BellRing size={18} /></span>
            <div className="notification-copy">
              <div className="notification-title"><strong>{item.title}</strong><span className={`badge badge-${item.type}`}>{typeLabels[item.type] || item.type}</span></div>
              <p>{item.body}</p>
              <small>{formatWhen(item.createdAt)}{item.read ? " · Read" : ""}</small>
            </div>
            {!item.read && <button className="button button-small button-outline" disabled={busy} onClick={() => markRead(item)}>Mark read</button>}
          </li>)}
        </ul>
        {pagination && pagination.pages > 1 && <div className="pagination"><span>Page {pagination.page} of {pagination.pages} · {pagination.total} records</span><div><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><button disabled={page >= pagination.pages} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>}
      </> : <EmptyState title={unreadOnly ? "No unread notifications" : "No notifications yet"} detail="Updates addressed to your account will appear here." />}
    </section>
  </>;
}
