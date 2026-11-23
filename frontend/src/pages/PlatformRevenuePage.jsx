import { useCallback, useEffect, useState } from "react";
import { CircleDollarSign, Plus } from "../components/ui/icon/icons.jsx";
import { get, post, queryString } from "../api/client.js";
import Modal from "../components/Modal.jsx";
import ModuleHeader from "../components/ModuleHeader.jsx";
import { notify } from "../components/feedback/appFeedback.js";
import { EmptyState, ErrorState, SkeletonRows } from "../components/feedback.jsx";
import { formatMoney as formatCurrencyMoney } from "../utils/currency.js";

const PAGE_SIZE = 25;

const label = (value) => String(value ?? "—").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

const formatMoney = (minor, currency) => {
  if (minor === null || minor === undefined) return "—";
  return formatCurrencyMoney(minor, currency || "USD");
};

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : date.toLocaleDateString();
};

function RecordPaymentModal({ busy, onClose, onSubmit }) {
  const [schools, setSchools] = useState([]);
  const [plans, setPlans] = useState([]);
  const [planId, setPlanId] = useState("");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    Promise.all([
      get("/platform/schools?limit=100"),
      get("/platform/plans?includeInactive=false&limit=100")
    ]).then(([schoolResult, planResult]) => {
      setSchools(schoolResult.items || []);
      setPlans(planResult.items || []);
    }).catch((reason) => setError(reason.message || "Could not load schools and plans."));
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const body = {
      applySubscription: Boolean(values.applySubscription),
      ...(values.notes ? { notes: values.notes } : {})
    };
    if (values.planId) {
      body.planId = values.planId;
    } else {
      body.amountMinor = Number(values.amountMinor);
      body.currency = String(values.currency || "").toUpperCase();
    }
    await onSubmit(values.schoolId, body);
    setDirty(false);
  };

  return <Modal title="Record a payment" onClose={onClose} dirty={dirty && !busy} closeBlocked={busy}><form className="form-stack modal-form" onSubmit={submit} onChange={() => setDirty(true)} onInput={() => setDirty(true)}>
    {error && <div className="form-error" role="alert">{error}</div>}
    <label>School<select name="schoolId" required defaultValue=""><option value="" disabled>Select a school</option>{schools.map((school) => <option key={school._id} value={school._id}>{school.name} · {school.slug}</option>)}</select></label>
    <label>Plan <span className="optional">(optional)</span><select name="planId" value={planId} onChange={(event) => { setPlanId(event.target.value); setDirty(true); }}><option value="">Custom amount (no plan)</option>{plans.map((plan) => <option key={plan._id} value={plan._id}>{plan.name} · {formatMoney(plan.priceMinor, plan.currency)} / {plan.billingInterval}</option>)}</select></label>
    {!planId && <div className="form-grid">
      <label>Amount (minor units)<input name="amountMinor" type="number" min="0" required /></label>
      <label>Currency<input name="currency" required minLength={3} maxLength={3} placeholder="PKR" /></label>
    </div>}
    <label>Notes <span className="optional">(optional)</span><input name="notes" maxLength={500} placeholder="Bank transfer reference" /></label>
    <label className="inline-toggle"><input type="checkbox" name="applySubscription" />Activate or extend this school's subscription</label>
    <div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose} disabled={busy}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? "Recording…" : "Record payment"}</button></div>
  </form></Modal>;
}

export default function PlatformRevenuePage() {
  const [tab, setTab] = useState("revenue");
  const [report, setReport] = useState(null);
  const [payments, setPayments] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (tab === "revenue") {
        setReport(await get("/platform/reports/revenue"));
      } else {
        const result = await get(`/platform/payments${queryString({ page, limit: PAGE_SIZE, status: status || undefined })}`);
        setPayments(Array.isArray(result?.items) ? result.items : []);
        setPagination(result?.pagination || null);
      }
    } catch (reason) {
      setError(reason.message || "Could not load revenue data.");
    } finally {
      setLoading(false);
    }
  }, [tab, page, status]);

  useEffect(() => { load(); }, [load]);

  const record = async (schoolId, body) => {
    setBusy(true);
    try {
      await post(`/platform/schools/${schoolId}/payments`, body);
      notify.success("Payment recorded.");
      setRecording(false);
      if (tab === "revenue") await load(); else { setPage(1); await load(); }
    } catch (reason) {
      notify.error(reason, { title: "Could not record payment" });
    } finally {
      setBusy(false);
    }
  };

  return <>
    <ModuleHeader kicker="PLATFORM ADMINISTRATION" title="Revenue" description="Recorded subscription payments and platform revenue." icon={CircleDollarSign} action={<button className="button button-primary" onClick={() => setRecording(true)}><Plus size={16} />Record payment</button>} />
    <div className="tabs platform-tabs" role="group" aria-label="Revenue view">
      <button type="button" aria-pressed={tab === "revenue"} className={tab === "revenue" ? "tab active-tab" : "tab"} onClick={() => setTab("revenue")}>Summary</button>
      <button type="button" aria-pressed={tab === "payments"} className={tab === "payments" ? "tab active-tab" : "tab"} onClick={() => setTab("payments")}>Payments</button>
    </div>

    {loading ? <section className="content-card"><SkeletonRows /></section>
      : error ? <section className="content-card"><ErrorState error={{ message: error }} onRetry={load} /></section>
        : tab === "revenue" ? <RevenueSummary report={report} />
          : <section className="content-card table-card tab-panel" key="payments">
            <div className="table-toolbar">
              <div><strong>Payments</strong><span>{pagination?.total ?? payments.length} records</span></div>
              <label className="inline-toggle">Status<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option>{["pending", "paid", "failed", "refunded"].map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
            </div>
            {payments.length ? <>
              <div className="table-scroll"><table><thead><tr><th>Recorded</th><th>School</th><th>Plan</th><th>Amount</th><th>Status</th><th>Method</th></tr></thead>
                <tbody className="motion-stagger">{payments.map((payment) => <tr key={payment.id}>
                  <td>{formatDate(payment.paidAt || payment.createdAt)}</td>
                  <td><code>{payment.schoolId?.slice(-6)}</code></td>
                  <td>{payment.planCode || "—"}</td>
                  <td>{formatMoney(payment.amountMinor, payment.currency)}</td>
                  <td><span className={`badge badge-${payment.status}`}>{label(payment.status)}</span></td>
                  <td>{label(payment.method)}</td>
                </tr>)}</tbody></table></div>
              {pagination && pagination.pages > 1 && <div className="pagination"><span>Page {pagination.page} of {pagination.pages} · {pagination.total} records</span><div><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><button disabled={page >= pagination.pages} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>}
            </> : <EmptyState title="No payments yet" detail="Record a manual payment or wait for a gateway payment." />}
          </section>}

    {recording && <RecordPaymentModal busy={busy} onClose={() => setRecording(false)} onSubmit={record} />}
  </>;
}

function RevenueSummary({ report }) {
  const totals = report?.totals || [];
  const byMonth = report?.byMonth || [];
  const byPlan = report?.byPlan || [];
  const outstanding = report?.outstanding || [];

  return <>
    <div className="metric-grid">
      {totals.length ? totals.map((row) => <article className="metric-card" key={row.currency}>
        <div className="metric-icon tone-green"><CircleDollarSign size={19} /></div>
        <div className="metric-label">Gross revenue ({row.currency})</div>
        <strong className="metric-value">{formatMoney(row.grossMinor, row.currency)}</strong>
        <div className="metric-detail">{row.payments} paid payment{row.payments === 1 ? "" : "s"}</div>
      </article>) : <article className="metric-card">
        <div className="metric-icon tone-green"><CircleDollarSign size={19} /></div>
        <div className="metric-label">Gross revenue</div>
        <strong className="metric-value">{formatMoney(0, "USD")}</strong>
        <div className="metric-detail">No paid payments recorded yet</div>
      </article>}
    </div>

    <section className="content-card">
      <div className="section-heading"><div><strong>Revenue by month</strong><p>Paid payments grouped by month.</p></div></div>
      {byMonth.length ? <div className="table-scroll"><table><thead><tr><th>Month</th><th>Currency</th><th>Payments</th><th>Gross</th></tr></thead>
        <tbody>{byMonth.map((row) => <tr key={`${row.month}-${row.currency}`}><td>{row.month}</td><td>{row.currency}</td><td>{row.payments}</td><td>{formatMoney(row.grossMinor, row.currency)}</td></tr>)}</tbody></table></div>
        : <EmptyState title="No monthly revenue" detail="Paid payments will be grouped here by month." />}
    </section>

    <section className="content-card">
      <div className="section-heading"><div><strong>Revenue by plan</strong><p>Paid payments grouped by plan.</p></div></div>
      {byPlan.length ? <div className="table-scroll"><table><thead><tr><th>Plan</th><th>Currency</th><th>Payments</th><th>Gross</th></tr></thead>
        <tbody>{byPlan.map((row) => <tr key={`${row.planCode}-${row.currency}`}><td>{row.planCode || "Custom"}</td><td>{row.currency}</td><td>{row.payments}</td><td>{formatMoney(row.grossMinor, row.currency)}</td></tr>)}</tbody></table></div>
        : <EmptyState title="No plan revenue" detail="Paid plan payments will be grouped here." />}
    </section>

    <section className="content-card">
      <div className="section-heading"><div><strong>Outstanding</strong><p>Pending gateway payments not yet confirmed.</p></div></div>
      {outstanding.length ? <div className="table-scroll"><table><thead><tr><th>Currency</th><th>Payments</th><th>Pending</th></tr></thead>
        <tbody>{outstanding.map((row) => <tr key={row.currency}><td>{row.currency}</td><td>{row.payments}</td><td>{formatMoney(row.pendingMinor, row.currency)}</td></tr>)}</tbody></table></div>
        : <EmptyState title="Nothing pending" detail="Pending gateway payments will appear here." />}
    </section>
  </>;
}
