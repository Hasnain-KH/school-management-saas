import { useCallback, useEffect, useState } from "react";
import { Copy, Receipt } from "../components/ui/icon/icons.jsx";
import { get, queryString } from "../api/client.js";
import ModuleHeader from "../components/ModuleHeader.jsx";
import { notify } from "../components/feedback/appFeedback.js";
import { EmptyState, ErrorState, SkeletonRows } from "../components/feedback.jsx";
import { formatMoney as formatCurrencyMoney } from "../utils/currency.js";
import {
  MANUAL_PAYMENT_STEPS,
  accountInstructionText,
  accountTypeLabel,
  copyAccountDetail,
  copyableAccountDetails
} from "../utils/receiving-accounts.js";

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

function ReceivingAccountsPanel() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await get("/schools/receiving-accounts");
      setAccounts(Array.isArray(result?.accounts) ? result.accounts : []);
    } catch (reason) {
      setError(reason.message || "Could not load receiving account details.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const copy = async (detail) => {
    try {
      await copyAccountDetail(detail.value);
      notify.success(`${detail.label} copied.`);
    } catch (reason) {
      notify.error(reason, { title: "Could not copy" });
    }
  };

  return <section className="content-card" aria-labelledby="receiving-accounts-heading">
    <div className="section-heading"><div>
      <strong id="receiving-accounts-heading">Where to send a manual payment</strong>
      <p>Platform receiving accounts are managed by the Super Admin. SchoolFlow never collects or verifies payments automatically.</p>
    </div></div>
    <ol className="manual-payment-steps">
      {MANUAL_PAYMENT_STEPS.map((step) => <li key={step}>{step}</li>)}
    </ol>
    {loading ? <SkeletonRows />
      : error ? <ErrorState error={{ message: error }} onRetry={load} />
        : accounts.length ? <div className="receiving-account-grid">
          {accounts.map((account) => {
            const details = copyableAccountDetails(account);
            return <article className="receiving-account-card" key={account.id}>
              <header><span className="badge badge-neutral">{accountTypeLabel(account.accountType)}</span><strong>{account.providerName}</strong></header>
              <p className="receiving-account-title">{account.accountTitle}</p>
              {details.length ? <dl className="receiving-account-details">
                {details.map((detail) => <div className="receiving-account-detail" key={detail.label}>
                  <dt>{detail.label}</dt>
                  <dd><code>{detail.value}</code><button type="button" className="icon-button" onClick={() => copy(detail)} aria-label={`Copy ${detail.label} for ${account.providerName}`} title={`Copy ${detail.label}`}><Copy size={16} aria-hidden="true" /></button></dd>
                </div>)}
              </dl> : <p className="muted">No account reference has been published.</p>}
              {account.instructions && <p className="receiving-account-instructions"><strong>Instructions:</strong> {account.instructions}</p>}
              <p className="muted">{accountInstructionText(account)}</p>
            </article>;
          })}
        </div>
          : <EmptyState title="No receiving accounts are active" detail="Contact the platform administrator to confirm the manual payment destination before sending any payment." />}
  </section>;
}

export default function BillingPage() {
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
    <ModuleHeader title="Subscription & billing" description="Manual payment details and subscription payments recorded for your school." icon={Receipt} />
    <ReceivingAccountsPanel />
    <section className="content-card table-card" aria-labelledby="billing-history-heading">
      <div className="table-toolbar">
        <div><strong id="billing-history-heading">Payment history</strong><span>{pagination?.total ?? items.length} records</span></div>
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
      </> : <EmptyState title="No payments recorded" detail="Payments verified and recorded by the platform administrator will appear here." />}
    </section>
  </>;
}
