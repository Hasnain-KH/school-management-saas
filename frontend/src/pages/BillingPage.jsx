import { useCallback, useEffect, useState } from "react";
import { Receipt } from "../components/ui/icon/icons.jsx";
import { get, queryString } from "../api/client.js";
import ModuleHeader from "../components/ModuleHeader.jsx";
import { EmptyState, ErrorState, Notice, SkeletonRows } from "../components/feedback.jsx";

const PAGE_SIZE = 25;

const label = (value) => String(value ?? "—").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

const formatMoney = (minor, currency) => {
  if (minor === null || minor === undefined) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" })
      .format(Number(minor) / 100);
  } catch {
    return `${currency || ""} ${(Number(minor) / 100).toFixed(2)}`.trim();
  }
};

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : date.toLocaleDateString();
};

export default function BillingPage() {
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await get(`/schools/billing${queryString({ page, limit: PAGE_SIZE })}`);
      setItems(Array.isArray(result?.items) ? result.items : []);
      setPagination(result?.pagination || null);
    } catch (reason) {
      setError(reason.message || "Could not load billing history.");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  return <>
    <ModuleHeader title="Billing history" description="Subscription payments recorded for your school." icon={Receipt} />
    <Notice notice={notice} onClose={() => setNotice(null)} />
    <section className="content-card table-card">
      <div className="table-toolbar">
        <div><strong>Payments</strong><span>{pagination?.total ?? items.length} records</span></div>
      </div>
      {loading ? <SkeletonRows /> : error ? <ErrorState error={{ message: error }} onRetry={load} /> : items.length ? <>
        <div className="table-scroll"><table><thead><tr>
          <th>Recorded</th><th>Plan</th><th>Amount</th><th>Status</th><th>Method</th><th>Period</th>
        </tr></thead>
          <tbody>{items.map((payment) => <tr key={payment.id}>
            <td>{formatDate(payment.paidAt || payment.createdAt)}</td>
            <td>{payment.planCode || "—"}</td>
            <td>{formatMoney(payment.amountMinor, payment.currency)}</td>
            <td><span className={`badge badge-${payment.status}`}>{label(payment.status)}</span></td>
            <td>{label(payment.method)}</td>
            <td>{formatDate(payment.periodStart)} – {formatDate(payment.periodEnd)}</td>
          </tr>)}</tbody></table></div>
        {pagination && pagination.pages > 1 && <div className="pagination"><span>Page {pagination.page} of {pagination.pages} · {pagination.total} records</span><div><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><button disabled={page >= pagination.pages} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>}
      </> : <EmptyState title="No payments recorded" detail="Payments recorded by the platform administrator will appear here." />}
    </section>
  </>;
}
