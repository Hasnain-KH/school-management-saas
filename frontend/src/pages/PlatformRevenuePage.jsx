import { useCallback, useEffect, useState } from "react";
import { Banknote, Check, CircleDollarSign, Copy, Pencil, Plus, Trash2 } from "../components/ui/icon/icons.jsx";
import { del, get, patch, post, queryString } from "../api/client.js";
import Modal from "../components/Modal.jsx";
import ModuleHeader from "../components/ModuleHeader.jsx";
import { notify, confirmAction, confirmDanger } from "../components/feedback/appFeedback.js";
import { EmptyState, ErrorState, SkeletonRows } from "../components/feedback.jsx";
import { formatMoney as formatCurrencyMoney } from "../utils/currency.js";
import { accountTypeLabel, copyAccountDetail, copyableAccountDetails } from "../utils/receiving-accounts.js";

const PAGE_SIZE = 25;
const ACCOUNT_TYPES = ["bank_account", "jazzcash", "easypaisa", "other"];

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

function ReceivingAccountModal({ account, busy, onClose, onSubmit }) {
  const [accountType, setAccountType] = useState(account?.accountType || "bank_account");

  const submit = async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const body = {
      accountType: values.accountType,
      providerName: values.providerName.trim(),
      accountTitle: values.accountTitle.trim(),
      accountNumber: values.accountNumber.trim(),
      isActive: Boolean(values.isActive)
    };
    for (const field of ["iban", "mobileWalletNumber", "instructions"]) {
      if (values[field]?.trim()) body[field] = values[field].trim();
    }
    await onSubmit(body);
  };

  return <Modal title={account ? "Edit receiving account" : "Add receiving account"} onClose={onClose} closeBlocked={busy}>
    <form className="form-stack modal-form" onSubmit={submit}>
      <p className="field-help">These details are shown to school owners for manual payments. Never enter passwords, PINs, OTPs, or login credentials.</p>
      <div className="form-grid">
        <label>Account type<select name="accountType" value={accountType} onChange={(event) => setAccountType(event.target.value)}>{ACCOUNT_TYPES.map((type) => <option key={type} value={type}>{accountTypeLabel(type)}</option>)}</select></label>
        <label>Bank / provider name<input name="providerName" required minLength={2} maxLength={100} defaultValue={account?.providerName || ""} /></label>
      </div>
      <label>Account title<input name="accountTitle" required minLength={2} maxLength={150} defaultValue={account?.accountTitle || ""} /></label>
      <label>Account number<input name="accountNumber" required minLength={3} maxLength={100} defaultValue={account?.accountNumber || ""} /></label>
      <div className="form-grid">
        <label>IBAN <span className="optional">(optional)</span><input name="iban" maxLength={50} defaultValue={account?.iban || ""} /></label>
        <label>Mobile wallet number <span className="optional">(wallet accounts)</span><input name="mobileWalletNumber" maxLength={50} defaultValue={account?.mobileWalletNumber || ""} required={accountType !== "bank_account"} /></label>
      </div>
      <label>Additional payment instructions <span className="optional">(optional)</span><textarea name="instructions" rows={3} maxLength={1000} defaultValue={account?.instructions || ""} /></label>
      <label className="inline-toggle"><input type="checkbox" name="isActive" defaultChecked={account ? account.isActive : true} />Active (visible to school owners)</label>
      <div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose} disabled={busy}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? "Saving…" : account ? "Save changes" : "Add account"}</button></div>
    </form>
  </Modal>;
}

export default function PlatformRevenuePage() {
  const [tab, setTab] = useState("revenue");
  const [report, setReport] = useState(null);
  const [payments, setPayments] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [accountPagination, setAccountPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (tab === "revenue") {
        setReport(await get("/platform/reports/revenue"));
      } else if (tab === "payments") {
        const result = await get(`/platform/payments${queryString({ page, limit: PAGE_SIZE, status: status || undefined })}`);
        setPayments(Array.isArray(result?.items) ? result.items : []);
        setPagination(result?.pagination || null);
      } else {
        const result = await get(`/platform/receiving-accounts${queryString({ page, limit: PAGE_SIZE })}`);
        setAccounts(Array.isArray(result?.items) ? result.items : []);
        setAccountPagination(result?.pagination || null);
      }
    } catch (reason) {
      setError(reason.message || "Could not load revenue data.");
    } finally {
      setLoading(false);
    }
  }, [tab, page, status]);

  useEffect(() => { load(); }, [load]);

  const changeTab = (next) => { setTab(next); setPage(1); };

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

  const saveAccount = async (body) => {
    setBusy(true);
    try {
      const editing = Boolean(editingAccount?.id);
      if (editing) await patch(`/platform/receiving-accounts/${editingAccount.id}`, body);
      else await post("/platform/receiving-accounts", body);
      notify.success(editing ? "Receiving account updated." : "Receiving account added.");
      setEditingAccount(null);
      await load();
    } catch (reason) {
      notify.error(reason, { title: "Could not save receiving account" });
    } finally {
      setBusy(false);
    }
  };

  const toggleAccountStatus = (account) => {
    const next = !account.isActive;
    const run = async () => {
      await patch(`/platform/receiving-accounts/${account.id}/status`, { isActive: next });
      await load();
    };
    if (next) {
      run().then(() => notify.success("Receiving account activated."))
        .catch((reason) => notify.error(reason, { title: "Could not activate account" }));
    } else {
      confirmAction({
        title: "Deactivate receiving account?",
        message: `${account.providerName} will no longer be shown to school owners. Existing payment records are unchanged.`,
        confirmText: "Deactivate",
        onConfirm: run,
        success: "Receiving account deactivated.",
        error: { title: "Could not deactivate account" }
      });
    }
  };

  const removeAccount = (account) => confirmDanger({
    title: "Delete receiving account?",
    message: `${account.providerName} will be permanently removed and will no longer be shown to school owners. This cannot be undone.`,
    confirmText: "Delete account",
    onConfirm: async () => {
      await del(`/platform/receiving-accounts/${account.id}?confirm=true`);
      await load();
    },
    success: "Receiving account deleted.",
    error: { title: "Could not delete receiving account" }
  });

  const copy = async (detail) => {
    try {
      await copyAccountDetail(detail.value);
      notify.success(`${detail.label} copied.`);
    } catch (reason) {
      notify.error(reason, { title: "Could not copy" });
    }
  };

  return <>
    <ModuleHeader kicker="PLATFORM ADMINISTRATION" title="Revenue" description="Recorded subscription payments, platform revenue, and manual receiving accounts." icon={CircleDollarSign} action={<button className="button button-primary" onClick={() => setRecording(true)}><Plus size={16} />Record payment</button>} />
    <div className="tabs platform-tabs" role="group" aria-label="Revenue view">
      <button type="button" aria-pressed={tab === "revenue"} className={tab === "revenue" ? "tab active-tab" : "tab"} onClick={() => changeTab("revenue")}>Summary</button>
      <button type="button" aria-pressed={tab === "payments"} className={tab === "payments" ? "tab active-tab" : "tab"} onClick={() => changeTab("payments")}>Payments</button>
      <button type="button" aria-pressed={tab === "accounts"} className={tab === "accounts" ? "tab active-tab" : "tab"} onClick={() => changeTab("accounts")}>Receiving accounts</button>
    </div>

    {loading ? <section className="content-card"><SkeletonRows /></section>
      : error ? <section className="content-card"><ErrorState error={{ message: error }} onRetry={load} /></section>
        : tab === "revenue" ? <RevenueSummary report={report} />
          : tab === "payments" ? <section className="content-card table-card tab-panel" key="payments">
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
            </> : <EmptyState title="No payments yet" detail="Record a verified manual payment here." />}
          </section>
            : <section className="content-card table-card tab-panel" key="accounts" aria-labelledby="receiving-account-management-heading">
              <div className="section-heading"><div>
                <strong id="receiving-account-management-heading">Manual receiving accounts</strong>
                <p>School owners see active accounts only. SchoolFlow does not collect, verify, or activate payments automatically.</p>
              </div><button className="button button-outline" onClick={() => setEditingAccount({})}><Plus size={16} />Add account</button></div>
              {accounts.length ? <>
                <div className="table-scroll"><table><thead><tr><th>Type</th><th>Provider</th><th>Account title</th><th>Reference</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>{accounts.map((account) => {
                    const details = copyableAccountDetails(account);
                    return <tr key={account.id}>
                      <td>{accountTypeLabel(account.accountType)}</td>
                      <td>{account.providerName}</td>
                      <td>{account.accountTitle}</td>
                      <td>{details.length ? <div className="receiving-account-details">{details.map((detail) => <div className="receiving-account-detail" key={detail.label}><dt>{detail.label}</dt><dd><code>{detail.value}</code><button type="button" className="icon-button" onClick={() => copy(detail)} aria-label={`Copy ${detail.label} for ${account.providerName}`} title={`Copy ${detail.label}`}><Copy size={15} aria-hidden="true" /></button></dd></div>)}</div> : "—"}</td>
                      <td><span className={`badge ${account.isActive ? "badge-active" : "badge-suspended"}`}>{account.isActive ? "Active" : "Inactive"}</span></td>
                      <td><div className="table-actions">
                        <button type="button" className="icon-button" onClick={() => toggleAccountStatus(account)} title={account.isActive ? "Deactivate" : "Activate"} aria-label={`${account.isActive ? "Deactivate" : "Activate"} ${account.providerName}`}><Check size={16} aria-hidden="true" /></button>
                        <button type="button" className="icon-button" onClick={() => setEditingAccount(account)} title="Edit" aria-label={`Edit ${account.providerName}`}><Pencil size={16} aria-hidden="true" /></button>
                        <button type="button" className="icon-button icon-button-danger" onClick={() => removeAccount(account)} title="Delete" aria-label={`Delete ${account.providerName}`}><Trash2 size={16} aria-hidden="true" /></button>
                      </div></td>
                    </tr>;
                  })}</tbody></table></div>
                {accountPagination && accountPagination.pages > 1 && <div className="pagination"><span>Page {accountPagination.page} of {accountPagination.pages} · {accountPagination.total} accounts</span><div><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><button disabled={page >= accountPagination.pages} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>}
              </> : <EmptyState title="No receiving accounts" detail="Add the bank or mobile-wallet details that school owners should pay manually." />}
              <p className="field-help"><Banknote size={14} aria-hidden="true" /> Credentials such as passwords, PINs, and OTPs are rejected by the server and must never be stored here.</p>
            </section>}

    {recording && <RecordPaymentModal busy={busy} onClose={() => setRecording(false)} onSubmit={record} />}
    {editingAccount && <ReceivingAccountModal account={editingAccount.id ? editingAccount : null} busy={busy} onClose={() => setEditingAccount(null)} onSubmit={saveAccount} />}
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
      <div className="section-heading"><div><strong>Outstanding</strong><p>Pending manual payments not yet verified and recorded.</p></div></div>
      {outstanding.length ? <div className="table-scroll"><table><thead><tr><th>Currency</th><th>Payments</th><th>Pending</th></tr></thead>
        <tbody>{outstanding.map((row) => <tr key={row.currency}><td>{row.currency}</td><td>{row.payments}</td><td>{formatMoney(row.pendingMinor, row.currency)}</td></tr>)}</tbody></table></div>
        : <EmptyState title="Nothing pending" detail="Unverified manual payments will appear here until recorded by an administrator." />}
    </section>
  </>;
}
