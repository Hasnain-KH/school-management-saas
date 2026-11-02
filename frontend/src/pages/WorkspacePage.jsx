import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, BookOpen, CircleDollarSign, Download, Plus, Search, Users } from "lucide-react";
import { api, get, patch, post, queryString } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import Modal from "../components/Modal.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { EmptyState, ErrorState, LoadingState, Notice, SkeletonRows } from "../components/feedback.jsx";
import { exportCsv, exportExcel, printPdf } from "../utils/export.js";
import { normalizeAttendanceRoster } from "../utils/attendance-roster.js";
import { buildExamPayload } from "../utils/exam-payload.js";
import { buildFeeAssignmentPayload, buildVoucherGenerationPayload } from "../utils/finance-workflows.js";
import AcademicSetupPage from "./AcademicSetupPage.jsx";

const today = () => new Date().toISOString().slice(0, 10);
const month = () => new Date().toISOString().slice(0, 7);
const pageMap = {
  students: { title: "Students", description: "Manage student records, admissions, and placements.", endpoint: "/students", permission: ["school_admin", "principal"], create: studentFields, columns: ["admissionNumber", "firstName", "lastName", "status"], query: { status: "enrolled" } },
  staff: { title: "People", description: "Manage teachers, principals, and parent access.", endpoint: "/users", permission: ["school_admin"], create: userFields, columns: ["name", "email", "role", "status"] },
  academics: { title: "Academic setup", description: "Organize sessions, classes, sections, and subjects.", endpoint: "/academics/classes", permission: ["school_admin", "principal"], create: classFields, columns: ["name", "code", "level", "isActive"] },
  inventory: { title: "Inventory", description: "Track school supplies, stock levels, and movements.", endpoint: "/operations/inventory/items", permission: ["school_admin", "principal"], create: inventoryFields, columns: ["sku", "name", "category", "quantityOnHand", "reorderLevel"] },
  library: { title: "Library", description: "Manage the catalogue and active student loans.", endpoint: "/operations/library/books", permission: ["school_admin", "principal"], create: bookFields, columns: ["title", "author", "isbn", "copiesAvailable", "copiesTotal"] },
  calendar: { title: "School calendar", description: "Stay aligned on holidays, events, exams, and meetings.", endpoint: "/operations/calendar", permission: ["school_admin", "principal"], create: calendarFields, columns: ["title", "type", "startsAt", "endsAt"], query: { from: today(), to: `${new Date().getFullYear() + 1}-12-31` } },
  announcements: { title: "Announcements", description: "Share updates with the right school community.", endpoint: "/operations/announcements", permission: ["school_admin", "principal"], create: announcementFields, columns: ["title", "audience", "expiresAt"] },
  audit: { title: "Audit log", description: "Review security-sensitive activity recorded in your school workspace.", endpoint: "/audit", columns: ["action", "resourceType", "actorUserId", "resourceId", "createdAt"] },
  "platform/audit": { title: "Platform audit log", description: "Review platform-wide administrative activity.", endpoint: "/platform/audit", columns: ["action", "resourceType", "actorUserId", "resourceId", "createdAt"] }
};

function studentFields() { return [
  { name: "admissionNumber", label: "Admission number", required: true },
  { name: "firstName", label: "First name", required: true },
  { name: "lastName", label: "Last name", required: true },
  { name: "dateOfBirth", label: "Date of birth", type: "date", required: true },
  { name: "gender", label: "Gender", type: "select", options: ["female", "male", "other", "unspecified"], defaultValue: "unspecified" },
  { name: "admissionDate", label: "Admission date", type: "date", defaultValue: today() },
  { name: "branchId", label: "Branch", type: "select", required: true, endpoint: "/academics/branches?limit=100", source: "items" },
  { name: "academicSessionId", label: "Academic session", type: "select", required: true, endpoint: "/academics/sessions?limit=100", source: "items" },
  { name: "classId", label: "Class", type: "select", required: true, endpoint: "/academics/classes?isActive=true&limit=100", source: "items" },
  { name: "sectionId", label: "Section", type: "select", required: true, endpoint: "/academics/sections?isActive=true&limit=100", source: "items", dependsOn: ["academicSessionId", "classId", "branchId"] }
]; }
function userFields() { return [
  { name: "name", label: "Full name", required: true },
  { name: "email", label: "Work email", type: "email", required: true },
  { name: "phone", label: "Phone" },
  { name: "jobTitle", label: "Job title" },
  { name: "role", label: "Role", type: "select", options: ["principal", "teacher", "parent"], required: true },
  { name: "password", label: "Temporary password", type: "password", required: true, hint: "At least 12 characters" }
]; }
function classFields() { return [{ name: "name", label: "Class name", required: true }, { name: "code", label: "Class code", required: true }, { name: "level", label: "Level", type: "number", min: 0, max: 30 }]; }
function inventoryFields() { return [{ name: "sku", label: "SKU", required: true }, { name: "name", label: "Item name", required: true }, { name: "category", label: "Category", required: true }, { name: "unit", label: "Unit", required: true }, { name: "reorderLevel", label: "Reorder level", type: "number", min: 0, defaultValue: 0 }, { name: "location", label: "Storage location" }]; }
function bookFields() { return [{ name: "title", label: "Title", required: true }, { name: "author", label: "Author", required: true }, { name: "isbn", label: "ISBN" }, { name: "subject", label: "Subject" }, { name: "copiesTotal", label: "Total copies", type: "number", min: 1, required: true }]; }
function calendarFields() { return [{ name: "title", label: "Event title", required: true }, { name: "type", label: "Type", type: "select", options: ["holiday", "event", "meeting", "exam"], required: true }, { name: "startsAt", label: "Start date", type: "date", required: true }, { name: "endsAt", label: "End date", type: "date", required: true }, { name: "description", label: "Description", type: "textarea" }]; }
function announcementFields() { return [{ name: "title", label: "Title", required: true }, { name: "body", label: "Message", type: "textarea", required: true }, { name: "audience", label: "Audience roles (comma separated)", required: true, defaultValue: "school_admin,principal,teacher,parent", transform: (value) => value.split(",").map((role) => role.trim()).filter(Boolean) }, { name: "expiresAt", label: "Expiry date", type: "date" }]; }

const titleMap = {
  attendance: ["Attendance", "Take accurate attendance and review school-day records."],
  finance: ["Fees & finance", "Manage fee structures, collection, and outstanding balances."],
  exams: ["Exams & results", "Review assessments, results, and report-card publication."],
  reports: ["Reports & insights", "Review live school, academic, attendance, and finance data."],
  subscriptions: ["Subscription", "Understand the plan and features assigned to your school."],
  school: ["School profile", "View your school workspace details and subscription status."],
  "my-children": ["My children", "Securely view linked students and their school records."],
  platform: ["Schools", "Manage school access and subscription plans across the platform."],
  "platform/plans": ["Subscription plans", "Configure plan availability, included features, and limits."]
};

export default function WorkspacePage({ page }) {
  const { user, school } = useAuth();
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState({ libraryTab: "books" });
  const [detail, setDetail] = useState(null);
  const [rowAction, setRowAction] = useState(null);
  const config = pageMap[page];
  const title = page === "academics" && user.role === "teacher" ? "My timetable" : config?.title || titleMap[page]?.[0] || "Workspace";
  const description = page === "academics" && user.role === "teacher" ? "Your class and subject schedule for the active academic session." : config?.description || titleMap[page]?.[1] || "";
  const canManage = Boolean(config?.create && config.permission?.includes(user.role));
  const libraryLoans = page === "library" && filters.libraryTab === "loans";
  const pageSize = 25;

  const load = useCallback(async (override = {}) => {
    setLoading(true); setError("");
    try {
      const current = { ...filters, ...override };
      setFilters(current);
      const result = await loadPage(page, config, current, search, user, school);
      setItems(result.items || []);
      setMeta(result);
      setDetail(result.detail);
    } catch (reason) {
      setError(reason.message || "Could not load this workspace.");
    } finally { setLoading(false); }
  }, [page, config, filters, search, user, school]);

  useEffect(() => { load(); }, [page]);
  const visibleColumns = useMemo(() => page === "academics" && user.role === "teacher"
    ? ["dayOfWeek", "periodNumber", "startsAt", "endsAt", "room", "sectionId", "classSubjectId"]
    : page === "library" && libraryLoans ? ["bookId", "studentId", "checkedOutAt", "dueAt", "status", "returnedAt"]
    : config?.columns || getColumns(items), [config, items, libraryLoans, page, user.role]);
  const createFields = useMemo(() => config?.create?.() || [], [config]);
  const returnLoan = async (loan) => {
    setBusy(true);
    try {
      await post(`/operations/library/loans/${loan._id}/return`, {});
      setNotice({ type: "success", message: "Library book returned." });
      await load();
    } catch (reason) {
      setNotice({ type: "error", message: reason.message || "Could not return library book." });
    } finally { setBusy(false); }
  };
  const onSearch = (event) => { event.preventDefault(); load({ page: 1 }); };
  const onCreate = async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const body = {};
    for (const field of createFields) {
      const raw = values[field.name] ?? "";
      if (raw === "" && !field.required) continue;
      if (field.transform) body[field.name] = field.transform(raw);
      else if (field.type === "number") body[field.name] = Number(raw);
      else body[field.name] = raw;
    }
    setBusy(true);
    try {
      await post(config.endpoint, body);
      setNotice({ type: "success", message: `${title.replace(/s$/, "")} created successfully.` });
      setModal(false);
      await load({ page: 1 });
    } catch (reason) {
      setNotice({ type: "error", message: reason.message });
    } finally { setBusy(false); }
  };

  if (page === "attendance") return <AttendancePage />;
  if (page === "academics" && user.role !== "teacher") return <AcademicSetupPage />;
  if (page === "finance") return <FinancePage />;
  if (page === "exams") return <ExamsPage />;
  if (page === "reports") return <ReportsPage />;
  if (page === "platform" || page === "platform/plans" || page === "subscriptions") return <SubscriptionPage page={page} />;
  if (page === "school") return <SchoolProfile />;
  if (page === "my-children") return <ParentChildren />;

  return <><PageHeader title={title} description={description} action={canManage && !libraryLoans && <button className="button button-primary" onClick={() => setModal(true)}><Plus size={16} />Add {title.replace(/s$/, "").toLowerCase()}</button>} />
    <Notice notice={notice} onClose={() => setNotice(null)} />
    <section className="content-card table-card">{page === "library" && <div className="tabs" role="group" aria-label="Library view">{[["books", "Books"], ["loans", "Loans"]].map(([value, label]) => <button key={value} type="button" aria-pressed={filters.libraryTab === value} className={filters.libraryTab === value ? "tab active-tab" : "tab"} onClick={() => load({ page: 1, libraryTab: value })}>{label}</button>)}</div>}<div className="table-toolbar"><div><strong>{libraryLoans ? "Library loans" : `${title} directory`}</strong><span>{meta?.pagination?.total ?? items.length} records</span></div>{!libraryLoans && <form className="search-field" onSubmit={onSearch}><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${title.toLowerCase()}…`} aria-label={`Search ${title}`} /><button type="submit">Search</button></form>}</div>
      {loading ? <SkeletonRows /> : error ? <ErrorState error={{ message: error }} onRetry={load} /> : items.length ? <><div className="table-scroll"><table><thead><tr>{visibleColumns.map((column) => <th key={column}>{columnLabel(column)}</th>)}{page === "inventory" && <th>Stock movement</th>}{page === "library" && !libraryLoans && canManage && <th>Available copies</th>}{libraryLoans && canManage && <th>Action</th>}{["students", "staff", "academics"].includes(page) && canManage && <th>Actions</th>}</tr></thead><tbody>{items.map((item) => <tr key={item._id || item.id}>{visibleColumns.map((column) => <td key={column}><Cell value={item[column]} column={column} /></td>)}{page === "inventory" && <td><MovementButtons item={item} onMove={(type) => setRowAction({ type, item })} /></td>}{page === "library" && !libraryLoans && canManage && <td>{item.copiesAvailable > 0 ? <button className="button button-small button-outline" onClick={() => setRowAction({ type: "issue", item })}>Issue book</button> : <span className="muted">No copies</span>}</td>}{libraryLoans && canManage && <td>{item.status === "checked_out" ? <button className="button button-small button-outline" disabled={busy} onClick={() => returnLoan(item)}>Return book</button> : <span className="muted">Returned</span>}</td>}{["students", "staff", "academics"].includes(page) && canManage && <td><button className="button button-small button-outline" onClick={() => setRowAction({ type: "edit", item })}>Edit</button></td>}</tr>)}</tbody></table></div><Pagination pagination={meta?.pagination} onPage={(value) => load({ page: value })} /></> : <EmptyState title={libraryLoans ? "No library loans" : `No ${title.toLowerCase()} to show`} detail={canManage ? "Create a record to get started. Your records will appear here." : "Records will appear here when your school has added them."} />}
    </section>
    {modal && <CreateModal title={`Add ${title.replace(/s$/, "").toLowerCase()}`} fields={createFields} busy={busy} onClose={() => setModal(false)} onSubmit={onCreate} />}
    {rowAction && <RowActionModal page={page} action={rowAction} busy={busy} onClose={() => setRowAction(null)} onSubmit={async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
      setBusy(true);
      try {
        if (rowAction.type === "edit") {
          const body = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ""));
          if (body.level !== undefined) body.level = Number(body.level);
          if (body.isActive !== undefined) body.isActive = body.isActive === "true";
          await patch(`${config.endpoint}/${rowAction.item._id}`, body);
        } else if (rowAction.type === "received" || rowAction.type === "issued") {
          await post(`/operations/inventory/items/${rowAction.item._id}/transactions`, { type: rowAction.type, quantity: Number(values.quantity), reference: values.reference || undefined, note: values.note || undefined });
        } else {
          await post("/operations/library/loans", { bookId: rowAction.item._id, studentId: values.studentId, dueAt: values.dueAt, note: values.note || undefined });
        }
        setNotice({ type: "success", message: rowAction.type === "edit" ? "Record updated." : rowAction.type === "issue" ? "Book issued." : "Inventory movement recorded." });
        setRowAction(null); await load();
      } catch (reason) { setNotice({ type: "error", message: reason.message }); }
      finally { setBusy(false); }
    }} />}
  </>;
}

async function loadPage(page, config, filters, search, user, school) {
  if (page === "library" && filters.libraryTab === "loans") return get(`/operations/library/loans${queryString({ page: filters.page || 1, limit: 25 })}`);
  if (page === "my-children") return { items: await get("/portal/parent/students") };
  if (page === "academics" && user.role === "teacher") {
    const sessions = await get("/academics/sessions?status=active&limit=1");
    const active = sessions.items?.[0];
    if (!active) return { items: [] };
    return get(`/academics/timetable${queryString({ academicSessionId: active._id, page: filters.page || 1, limit: 100 })}`);
  }
  if (page === "calendar" && ["teacher", "parent"].includes(user.role)) {
    const from = today();
    return get(`/portal/calendar${queryString({ from, to: `${new Date().getFullYear() + 1}-12-31`, page: filters.page || 1, limit: 25, search: search || undefined })}`);
  }
  if (config) return get(`${config.endpoint}${queryString({ page: filters.page || 1, limit: 25, search: search || undefined, ...config.query })}`);
  if (page === "school") return { items: [(await get("/schools/me")).school] };
  if (page === "subscriptions") return { items: [await get("/schools/subscription")] };
  return { items: [] };
}

function PageHeader({ title, description, action }) { return <div className="page-intro"><div><div className="page-kicker">SCHOOLFLOW WORKSPACE</div><h1>{title}</h1><p>{description}</p></div>{action && <div className="intro-action">{action}</div>}</div>; }
function Cell({ value, column }) {
  if (value === undefined || value === null || value === "") return <span className="muted">—</span>;
  if (column === "status" || column === "isActive" || ["type", "role"].includes(column)) return <span className={`badge badge-${String(value).toLowerCase()}`}>{column === "isActive" ? value ? "Active" : "Inactive" : value}</span>;
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return <span className="muted">{value.name || value.code || "—"}</span>;
  if (column.endsWith("At") || column.endsWith("Date")) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString(); }
  return String(value);
}
function getColumns(items) { return Object.keys(items[0] || {}).filter((key) => !["_id", "schoolId", "__v", "createdBy", "updatedAt"].includes(key)).slice(0, 6); }
function columnLabel(value) { return value.replace(/[A-Z]/g, (letter) => ` ${letter}`).replace(/^./, (letter) => letter.toUpperCase()); }
function Pagination({ pagination, onPage }) { if (!pagination || pagination.pages < 2) return null; return <div className="pagination"><span>Page {pagination.page} of {pagination.pages} · {pagination.total} records</span><div><button disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>Previous</button><button disabled={pagination.page >= pagination.pages} onClick={() => onPage(pagination.page + 1)}>Next</button></div></div>; }
function CreateModal({ title, fields, busy, onClose, onSubmit }) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((field) => [field.name, field.defaultValue || ""])));
  const [options, setOptions] = useState({});
  const dependencyKey = JSON.stringify(fields.map((field) => (field.dependsOn || []).map((name) => values[name])));
  useEffect(() => {
    let active = true;
    const loadOptions = async () => {
      const requests = fields.filter((field) => field.endpoint).map(async (field) => {
        const [path, initialQuery = ""] = field.endpoint.split("?");
        const params = new URLSearchParams(initialQuery);
        field.dependsOn?.forEach((name) => {
          if (values[name]) params.set(name, values[name]);
        });
        const suffix = params.toString() ? `?${params}` : "";
        const result = await get(`${path}${suffix}`);
        const data = field.source === "branches" ? result.branches || [] : result.items || [];
        return [field.name, data.map((item) => ({ value: item._id || item.id, label: item.name || item.code || item.title || String(item._id || item.id) }))];
      });
      const loaded = await Promise.all(requests);
      if (active) setOptions(Object.fromEntries(loaded));
    };
    loadOptions().catch((reason) => {
      if (active) setOptions((current) => ({ ...current, __error: reason.message }));
    });
    return () => { active = false; };
  }, [fields, dependencyKey]);

  return <Modal title={title} onClose={onClose}><form className="form-stack modal-form" onSubmit={onSubmit}><div className="form-grid">{fields.map((field) => <label className={field.type === "textarea" ? "field-wide" : ""} key={field.name}>{field.label}{field.required && <span className="required"> *</span>}{field.type === "select" ? <select name={field.name} required={field.required} value={values[field.name] || ""} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}><option value="" disabled>{options[field.name]?.length ? "Select…" : options.__error || "No options available"}</option>{field.options?.map((option) => <option key={option} value={option}>{option.replace(/_/g, " ")}</option>)}{options[field.name]?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === "textarea" ? <textarea name={field.name} required={field.required} defaultValue={field.defaultValue || ""} rows={4} /> : <input name={field.name} type={field.type || "text"} required={field.required} min={field.min} max={field.max} defaultValue={field.defaultValue || ""} />} {field.hint && <small className="field-hint">{field.hint}</small>}</label>)}</div><div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button disabled={busy} className="button button-primary">{busy ? "Saving…" : "Create record"}</button></div></form></Modal>;
}

function AttendancePage() {
  const [sections, setSections] = useState([]); const [sectionId, setSectionId] = useState(""); const [date, setDate] = useState(today()); const [roster, setRoster] = useState([]); const [status, setStatus] = useState({}); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [sectionsError, setSectionsError] = useState(false); const [notice, setNotice] = useState(null);
  const loadSections = async () => { setLoading(true); setError(""); setSectionsError(false); try { const result = await get("/academics/sections?isActive=true&limit=100"); setSections(result.items || []); if (!sectionId && result.items?.[0]) setSectionId(result.items[0]._id); } catch (reason) { setError(reason.message); setSectionsError(true); } finally { setLoading(false); } };
  useEffect(() => { loadSections(); }, []);
  const loadRoster = useCallback(async () => { if (!sectionId) return; setLoading(true); setError(""); try { const result = await get(`/attendance/students${queryString({ date, sectionId })}`); const rows = normalizeAttendanceRoster(result.items || result.students || []); setRoster(rows); setStatus(Object.fromEntries(rows.map((student) => [student.id, student.status]))); } catch (reason) { setError(reason.message); } finally { setLoading(false); } }, [sectionId, date]);
  useEffect(() => { loadRoster(); }, [loadRoster]);
  const save = async () => { setBusy(true); try { await post("/attendance/students", { date, sectionId, records: roster.map((student) => ({ studentId: student.id, status: status[student.id] || "present" })) }); setNotice({ type: "success", message: "Attendance saved for this class." }); await loadRoster(); } catch (reason) { setNotice({ type: "error", message: reason.message }); } finally { setBusy(false); } };
  return <><PageHeader title="Attendance" description="Record student attendance for a class and school day." action={<button disabled={!roster.length || busy} className="button button-primary" onClick={save}><CheckIcon />{busy ? "Saving…" : "Save attendance"}</button>} /><Notice notice={notice} onClose={() => setNotice(null)} /><section className="content-card table-card"><div className="filter-toolbar"><label>Section<select value={sectionId} onChange={(event) => setSectionId(event.target.value)}><option value="">Choose a section</option>{sections.map((section) => <option key={section._id} value={section._id}>{section.className || section.classId} · {section.name}</option>)}</select></label><label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></div>{loading ? <SkeletonRows /> : error ? <ErrorState error={{ message: error }} onRetry={sectionsError ? loadSections : loadRoster} /> : roster.length ? <div className="table-scroll"><table><thead><tr><th>Student</th><th>Admission no.</th><th>Attendance status</th></tr></thead><tbody>{roster.map((student) => { const id = student.id; return <tr key={id}><td><strong>{student.firstName} {student.lastName}</strong></td><td>{student.admissionNumber || "—"}</td><td><select className="inline-select" value={status[id] || "present"} onChange={(event) => setStatus((current) => ({ ...current, [id]: event.target.value }))}>{["present", "absent", "late", "leave"].map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></td></tr>; })}</tbody></table></div> : <EmptyState title="Choose a class section" detail="Available roster records follow your assigned-class permissions." />}</section></>;
}

function FinancePage() {
  const { user } = useAuth();
  const canManage = user.role === "school_admin";
  const [tab, setTab] = useState("vouchers"); const [items, setItems] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [notice, setNotice] = useState(null); const [paying, setPaying] = useState(null); const [setup, setSetup] = useState(""); const [busy, setBusy] = useState(false);
  const load = async () => { setLoading(true); setError(""); try { const path = tab === "vouchers" ? "/finance/vouchers?outstandingOnly=true&limit=100" : tab === "categories" ? "/finance/categories?limit=100" : tab === "assignments" ? "/finance/assignments?limit=100" : "/finance/structures?limit=100"; const result = await get(path); setItems(result.items || []); } catch (reason) { setError(reason.message); } finally { setLoading(false); } };
  useEffect(() => { load(); }, [tab]);
  const collect = async (event) => { event.preventDefault(); setBusy(true); const values = Object.fromEntries(new FormData(event.currentTarget)); try { await post(`/finance/vouchers/${paying._id}/payments`, { idempotencyKey: crypto.randomUUID(), amountMinor: Math.round(Number(values.amount) * 100), method: values.method, reference: values.reference || undefined }); setNotice({ type: "success", message: "Payment recorded. A receipt is available in the transaction history." }); setPaying(null); await load(); } catch (reason) { setNotice({ type: "error", message: reason.message }); } finally { setBusy(false); } };
  const tabs = [["vouchers", "Outstanding vouchers"], ["structures", "Fee structures"], ["categories", "Categories"], ...(canManage ? [["assignments", "Student assignments"]] : [])];
  const startWorkflow = (value) => setSetup(value);
  const submitWorkflow = async (payload) => {
    setBusy(true);
    try {
      if (setup === "assignment") {
        await post("/finance/assignments", payload);
        setNotice({ type: "success", message: "Student fee assignment created." });
        setSetup("");
        await load();
      } else {
        const result = await post("/finance/vouchers/generate", payload);
        setNotice({ type: "success", message: `Voucher generation complete: ${result.generated} created, ${result.alreadyGenerated} already existed.` });
        setSetup("");
        setTab("vouchers");
        await load();
      }
    } catch (reason) {
      setNotice({ type: "error", message: reason.message || "Could not complete the fee workflow." });
    } finally { setBusy(false); }
  };
  const columns = tab === "assignments"
    ? ["studentId", "feeStructureId", "startPeriod", "endPeriod", "discountAmountMinor", "discountBasisPoints", "scholarshipName", "isActive"]
    : ["period", "status", "amountDueMinor", "balanceMinor", "paidAmountMinor", "currency", "name", "code", "frequency"];
  return <><PageHeader title="Fees & finance" description="Review fee balances, fee structures, and school collection activity." action={canManage && <div className="intro-action">{["structures", "categories"].includes(tab) && <button className="button button-primary" onClick={() => startWorkflow(tab)}><Plus size={16} />Add {tab === "categories" ? "category" : "structure"}</button>}{tab === "assignments" && <button className="button button-primary" onClick={() => startWorkflow("assignment")}><Plus size={16} />Assign fees</button>}{tab === "vouchers" && <button className="button button-outline" onClick={() => startWorkflow("generate")}><Plus size={16} />Generate vouchers</button>}</div>} /><Notice notice={notice} onClose={() => setNotice(null)} /><section className="content-card table-card"><div className="tabs" role="group" aria-label="Finance record type">{tabs.map(([value, label]) => <button key={value} type="button" aria-pressed={tab === value} className={tab === value ? "tab active-tab" : "tab"} onClick={() => setTab(value)}>{label}</button>)}</div>{loading ? <SkeletonRows /> : error ? <ErrorState error={{ message: error }} onRetry={load} /> : items.length ? <div className="table-scroll"><table><thead><tr>{columns.filter((key) => items.some((item) => item[key] !== undefined)).map((key) => <th key={key}>{columnLabel(key)}</th>)}{tab === "vouchers" && canManage && <th>Action</th>}</tr></thead><tbody>{items.map((item) => <tr key={item._id}>{columns.filter((key) => item[key] !== undefined).map((key) => <td key={key}>{key.endsWith("Minor") ? formatMinor(item[key], item.currency) : <Cell value={item[key]} column={key} />}</td>)}{tab === "vouchers" && canManage && <td><button className="button button-small button-primary" onClick={() => setPaying(item)}>Collect payment</button></td>}</tr>)}</tbody></table></div> : <EmptyState title={`No ${tab} records`} detail="Fee records appear here once they are configured for this school." />}</section>{setup && ["categories", "structures"].includes(setup) && <FeeSetupModal mode={setup} busy={busy} onClose={() => setSetup("")} onSubmit={async (payload) => { setBusy(true); try { await post(setup === "categories" ? "/finance/categories" : "/finance/structures", payload); setNotice({ type: "success", message: `${setup === "categories" ? "Fee category" : "Fee structure"} created.` }); setSetup(""); await load(); } catch (reason) { setNotice({ type: "error", message: reason.message }); } finally { setBusy(false); } }} />}{setup && ["assignment", "generate"].includes(setup) && <FeeWorkflowModal mode={setup} busy={busy} onClose={() => setSetup("")} onSubmit={submitWorkflow} />}{paying && <Modal title={`Collect payment · ${paying.period}`} onClose={() => setPaying(null)}><form className="form-stack modal-form" onSubmit={collect}><p>Outstanding balance <strong>{formatMinor(paying.balanceMinor, paying.currency)}</strong></p><label>Amount<input name="amount" type="number" step="0.01" min="0.01" max={paying.balanceMinor / 100} required /></label><label>Payment method<select name="method">{["cash", "bank_transfer", "cheque", "other"].map((method) => <option key={method} value={method}>{method.replace("_", " ")}</option>)}</select></label><label>Reference <span className="optional">(optional)</span><input name="reference" maxLength="100" /></label><div className="modal-actions"><button type="button" className="button button-outline" onClick={() => setPaying(null)}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? "Recording…" : "Record payment"}</button></div></form></Modal>}</>;
}

function FeeSetupModal({ mode, busy, onClose, onSubmit }) {
  const isCategory = mode === "categories";
  const [options, setOptions] = useState({ categories: [], sessions: [], classes: [] });
  const [optionsError, setOptionsError] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [lineItems, setLineItems] = useState([{ categoryId: "", name: "", amountMinor: "" }]);
  useEffect(() => {
    if (isCategory) return;
    Promise.all([
      get("/finance/categories?isActive=true&limit=100"),
      get("/academics/sessions?limit=100"),
      get("/academics/classes?isActive=true&limit=100")
    ]).then(([categories, sessions, classes]) => setOptions({
      categories: categories.items || [],
      sessions: (sessions.items || []).filter((item) => item.status !== "completed"),
      classes: classes.items || []
    })).catch((reason) => setOptionsError(reason.message || "Could not load fee structure options."));
  }, [isCategory]);
  const submit = (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (isCategory) {
      onSubmit({ name: values.name, code: values.code, ...(values.description ? { description: values.description } : {}) });
      return;
    }
    onSubmit({
      academicSessionId: values.academicSessionId,
      classId: values.classId,
      name: values.name,
      code: values.code,
      frequency: values.frequency,
      ...(values.dueDay ? { dueDay: Number(values.dueDay) } : {}),
      ...(values.frequency === "annual" ? { dueMonth: Number(values.dueMonth) } : {}),
      currency: values.currency.toUpperCase(),
      lineItems: lineItems.map((item) => ({ categoryId: item.categoryId, name: item.name, amountMinor: Number(item.amountMinor) }))
    });
  };
  const updateLine = (index, key, value) => setLineItems((current) => current.map((item, row) => row === index ? { ...item, [key]: value } : item));
  const usedCategories = (exceptIndex) => new Set(lineItems.filter((_, index) => index !== exceptIndex).map((item) => item.categoryId));
  return <Modal title={isCategory ? "Add fee category" : "Add fee structure"} onClose={onClose}><form className="form-stack modal-form" onSubmit={submit}>
    {isCategory ? <><label>Category name<input name="name" required maxLength={100} /></label><label>Code<input name="code" required maxLength={32} pattern="[A-Za-z0-9_-]+" /></label><label>Description<input name="description" maxLength={300} /></label></> : <>
      {optionsError && <ErrorState error={{ message: optionsError }} />}
      <div className="form-grid"><label>Academic session<select name="academicSessionId" required defaultValue=""><option value="" disabled>Select a session</option>{options.sessions.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label><label>Class<select name="classId" required defaultValue=""><option value="" disabled>Select a class</option>{options.classes.map((item) => <option key={item._id} value={item._id}>{item.name} · {item.code}</option>)}</select></label><label>Structure name<input name="name" required minLength={2} maxLength={120} /></label><label>Code<input name="code" required maxLength={32} pattern="[A-Za-z0-9_-]+" /></label><label>Frequency<select name="frequency" value={frequency} onChange={(event) => setFrequency(event.target.value)}><option value="monthly">Monthly</option><option value="annual">Annual</option></select></label><label>Due day<input name="dueDay" type="number" min={1} max={28} defaultValue="10" /></label>{frequency === "annual" && <label>Due month<input name="dueMonth" type="number" min={1} max={12} required /></label>}<label>Currency<input name="currency" defaultValue="USD" required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" /></label></div>
      <div className="fee-line-items"><strong>Fee line items</strong>{lineItems.map((item, index) => <div className="form-grid" key={index}><label>Category<select value={item.categoryId} required onChange={(event) => updateLine(index, "categoryId", event.target.value)}><option value="">Select a category</option>{options.categories.filter((category) => !usedCategories(index).has(category._id)).map((category) => <option value={category._id} key={category._id}>{category.name}</option>)}</select></label><label>Line name<input value={item.name} required maxLength={100} onChange={(event) => updateLine(index, "name", event.target.value)} /></label><label>Amount (minor units)<input type="number" min={1} max={100000000} step={1} required value={item.amountMinor} onChange={(event) => updateLine(index, "amountMinor", event.target.value)} /></label>{lineItems.length > 1 && <button type="button" className="button button-quiet" onClick={() => setLineItems((current) => current.filter((_, row) => row !== index))}>Remove line</button>}</div>)}<button type="button" className="button button-outline button-small" disabled={lineItems.length >= 30 || lineItems.length >= options.categories.length} onClick={() => setLineItems((current) => [...current, { categoryId: "", name: "", amountMinor: "" }])}>Add line item</button>{!options.categories.length && <small className="field-hint">Create at least one active fee category first.</small>}</div>
    </>}
    <div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy || (!isCategory && (optionsError || !options.categories.length || !options.sessions.length || !options.classes.length))}>{busy ? "Saving…" : "Create"}</button></div>
  </form></Modal>;
}

function FeeWorkflowModal({ mode, busy, onClose, onSubmit }) {
  const isAssignment = mode === "assignment";
  const [structures, setStructures] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedStructureId, setSelectedStructureId] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [discountType, setDiscountType] = useState("none");
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState("");
  const [period, setPeriod] = useState("");
  const structure = structures.find((item) => item._id === selectedStructureId);

  const loadStructures = useCallback(async () => {
    setOptionsLoading(true);
    setOptionsError("");
    try {
      const result = await get("/finance/structures?isActive=true&limit=100");
      setStructures(result.items || []);
    } catch (reason) {
      setOptionsError(reason.message || "Could not load active fee structures.");
    } finally { setOptionsLoading(false); }
  }, []);
  useEffect(() => { loadStructures(); }, [loadStructures]);

  const loadStudents = useCallback(async () => {
    if (!structure) {
      setStudents([]);
      return;
    }
    setStudentsLoading(true);
    setOptionsError("");
    try {
      const query = queryString({
        status: "enrolled",
        classId: structure.classId,
        academicSessionId: structure.academicSessionId,
        limit: 100
      });
      const [studentResult, assignmentResult] = await Promise.all([
        get(`/students${query}`),
        isAssignment ? Promise.resolve(null) : get(`/finance/assignments${queryString({ feeStructureId: structure._id, isActive: true, limit: 100 })}`)
      ]);
      const matchingAssignments = assignmentResult?.items || [];
      const eligibleIds = new Set(matchingAssignments.map((item) => String(item.studentId?._id || item.studentId)));
      const matchingStudents = (studentResult.items || []).filter((item) =>
        isAssignment || eligibleIds.has(String(item.id || item._id))
      );
      setStudents(matchingStudents);
      setSelectedStudentIds([]);
      setSelectedStudentId("");
    } catch (reason) {
      setStudents([]);
      setOptionsError(reason.message || "Could not load matching enrolled students.");
    } finally { setStudentsLoading(false); }
  }, [structure, isAssignment]);
  useEffect(() => { loadStudents(); }, [loadStudents]);

  const submit = (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (isAssignment) {
        const payload = buildFeeAssignmentPayload({
          ...values,
          discountAmountMinor: discountType === "fixed" ? values.discountAmountMinor : "",
          discountBasisPoints: discountType === "percentage" ? values.discountBasisPoints : ""
        }, structure?.frequency);
        onSubmit(payload);
      } else {
        onSubmit(buildVoucherGenerationPayload({ feeStructureId: values.feeStructureId, period: values.period, studentIds: selectedStudentIds }, structure?.frequency));
      }
    } catch (reason) {
      setOptionsError(reason.message);
    }
  };
  const toggleStudent = (id) => setSelectedStudentIds((current) =>
    current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
  );
  const periodPlaceholder = structure?.frequency === "annual" ? "YYYY" : "YYYY-MM";
  return <Modal title={isAssignment ? "Assign fee structure to student" : "Generate fee vouchers"} onClose={onClose}><form className="form-stack modal-form" onSubmit={submit}>
    {optionsError && <div className="form-error" role="alert">{optionsError} <button type="button" className="button button-quiet button-small" onClick={structure ? loadStudents : loadStructures} disabled={optionsLoading || studentsLoading}>Retry</button></div>}
    <label>Active fee structure<select name="feeStructureId" value={selectedStructureId} required onChange={(event) => { setSelectedStructureId(event.target.value); setPeriod(""); setOptionsError(""); }} disabled={optionsLoading}><option value="">{optionsLoading ? "Loading structures…" : "Select a structure"}</option>{structures.map((item) => <option key={item._id} value={item._id}>{item.name} · {item.code} · {item.frequency} · {item.classId}</option>)}</select></label>
    {!optionsLoading && !structures.length && !optionsError && <p className="field-hint">No active fee structures are available. Create a fee structure first.</p>}
    {structure && (studentsLoading ? <SkeletonRows rows={2} /> : optionsError ? null : isAssignment
      ? <label>Enrolled student<select name="studentId" value={selectedStudentId} required onChange={(event) => setSelectedStudentId(event.target.value)}><option value="">Select a student</option>{students.map((student) => <option value={student.id || student._id} key={student.id || student._id}>{student.firstName} {student.lastName} · {student.admissionNumber}</option>)}</select></label>
      : <fieldset className="form-stack fee-student-picker"><legend>Students with an active fee assignment · select 1–500</legend>{students.length ? <div className="fee-student-list">{students.map((student) => { const id = student.id || student._id; return <label className="checkbox-field" key={id}><input type="checkbox" checked={selectedStudentIds.includes(id)} onChange={() => toggleStudent(id)} />{student.firstName} {student.lastName} · {student.admissionNumber}</label>; })}</div> : <p className="field-hint">No eligible enrolled students found for this structure.</p>}</fieldset>)}
    {structure && <label>{isAssignment ? "Start period" : "Voucher period"}<input name={isAssignment ? "startPeriod" : "period"} type="text" inputMode={structure.frequency === "annual" ? "numeric" : "numeric"} placeholder={periodPlaceholder} pattern={structure.frequency === "annual" ? "\\d{4}" : "\\d{4}-(0[1-9]|1[0-2])"} value={period} onChange={(event) => setPeriod(event.target.value)} required /></label>}
    {structure && isAssignment && <>
      <label>End period <span className="optional">(optional)</span><input name="endPeriod" type="text" placeholder={periodPlaceholder} pattern={structure.frequency === "annual" ? "\\d{4}" : "\\d{4}-(0[1-9]|1[0-2])"} /></label>
      <label>Discount type<select value={discountType} onChange={(event) => setDiscountType(event.target.value)}><option value="none">No discount</option><option value="fixed">Fixed amount</option><option value="percentage">Percentage</option></select></label>
      {discountType === "fixed" && <label>Discount (minor currency units)<input name="discountAmountMinor" type="number" min="0" max="100000000" step="1" required /></label>}
      {discountType === "percentage" && <label>Discount (basis points; 100 = 1%)<input name="discountBasisPoints" type="number" min="0" max="10000" step="1" required /></label>}
      <label>Scholarship name <span className="optional">(optional)</span><input name="scholarshipName" maxLength="120" /></label>
    </>}
    {structure && !isAssignment && <small className="field-hint">Voucher generation uses current active assignments for the selected period. Existing vouchers are reported and not duplicated.</small>}
    {structure && !studentsLoading && !optionsError && !students.length && <small className="field-hint">{isAssignment ? "No enrolled students match this structure’s class and session." : "Create student fee assignments before generating vouchers."}</small>}
    <div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy || optionsLoading || studentsLoading || Boolean(optionsError) || !structure || !students.length || (!isAssignment && selectedStudentIds.length === 0) || (isAssignment && !selectedStudentId)}>{busy ? "Processing…" : isAssignment ? "Create assignment" : `Generate for ${selectedStudentIds.length || 0}`}</button></div>
  </form></Modal>;
}

function ExamsPage() {
  const { user } = useAuth();
  const [exams, setExams] = useState([]); const [examId, setExamId] = useState(""); const [results, setResults] = useState(null);   const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [notice, setNotice] = useState(null); const [marking, setMarking] = useState(false); const [creating, setCreating] = useState(false); const [busy, setBusy] = useState(false); const [confirmPublish, setConfirmPublish] = useState(false);
  const load = async () => { setLoading(true); setError(""); try { const result = await get("/exams?limit=100"); setExams(result.items || []); setExamId((current) => current || result.items?.[0]?._id || ""); } catch (reason) { setError(reason.message); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const loadResults = async () => { if (!examId) return; try { const result = await get(`/exams/${examId}/results?limit=100`); setResults(result); } catch (reason) { setResults(null); if (reason.status !== 409) setNotice({ type: "error", message: reason.message }); } };
  useEffect(() => { loadResults(); }, [examId]);
  const createExam = async (payload) => {
    setBusy(true);
    try {
      const exam = await post("/exams", payload);
      setExamId(exam._id);
      setCreating(false);
      setNotice({ type: "success", message: "Exam schedule created." });
      await load();
    } catch (reason) {
      setNotice({ type: "error", message: reason.message || "Could not create exam." });
    } finally { setBusy(false); }
  };
  const publish = async () => { setBusy(true); try { await post(`/exams/${examId}/publish`, {}); setNotice({ type: "success", message: "Exam results published." }); setConfirmPublish(false); await load(); } catch (reason) { setNotice({ type: "error", message: reason.message }); } finally { setBusy(false); } };
  const selectedExam = exams.find((item) => item._id === examId);
  const canManage = ["school_admin", "principal"].includes(user.role);
  return <><PageHeader title="Exams & results" description={user.role === "teacher" ? "Enter marks only for subjects assigned to you and review published subject results." : "Review assessment schedules and published class results."} action={<div className="intro-action">{canManage && <button className="button button-outline" onClick={() => setCreating(true)}><Plus size={16} />Create exam</button>}{selectedExam && user.role === "teacher" && selectedExam.status === "scheduled" && <button className="button button-primary" onClick={() => setMarking(true)}><BookOpen size={16} />Enter marks</button>}{selectedExam && canManage && selectedExam.status === "scheduled" && <button className="button button-primary" onClick={() => setConfirmPublish(true)}><BookOpen size={16} />Publish results</button>}</div>} /><Notice notice={notice} onClose={() => setNotice(null)} /><section className="content-card table-card"><div className="filter-toolbar"><label>Assessment<select value={examId} onChange={(event) => setExamId(event.target.value)}><option value="">Select an exam</option>{exams.map((exam) => <option key={exam._id} value={exam._id}>{exam.name}</option>)}</select></label><span className={`badge badge-${selectedExam?.status || "active"}`}>{selectedExam?.status || "—"}</span></div>{loading ? <SkeletonRows /> : error ? <ErrorState error={{ message: error }} onRetry={load} /> : results?.items?.length ? <div className="table-scroll"><table><thead><tr>{Object.keys(results.items[0]).filter((key) => !["_id", "schoolId"].includes(key)).slice(0, 6).map((key) => <th key={key}>{columnLabel(key)}</th>)}</tr></thead><tbody>{results.items.map((row, index) => <tr key={row.studentId || row.student?.id || index}>{Object.entries(row).filter(([key]) => !["_id", "schoolId"].includes(key)).slice(0, 6).map(([key, value]) => <td key={key}>{typeof value === "object" ? JSON.stringify(value) : String(value ?? "—")}</td>)}</tr>)}</tbody></table></div> : <EmptyState title={examId ? selectedExam?.status === "scheduled" ? "Assessment is not published" : "No results available yet" : "No assessments created"} detail={user.role === "teacher" ? "Marks and result details are limited to your assigned subjects." : "Results become available after marks are entered and the assessment is published."} />}</section>{creating && <ExamCreateModal busy={busy} onClose={() => setCreating(false)} onSubmit={createExam} />}{marking && selectedExam && <MarksEntryModal exam={selectedExam} onClose={() => setMarking(false)} onSaved={(message) => { setNotice({ type: "success", message }); setMarking(false); }} onError={(message) => setNotice({ type: "error", message })} />}{confirmPublish && <ConfirmDialog title="Publish exam results?" message={`Results for ${selectedExam?.name || "this assessment"} will become visible to authorized students and parents.`} confirmLabel="Publish results" busy={busy} onClose={() => setConfirmPublish(false)} onConfirm={publish} />}</>;
}

function ExamCreateModal({ busy, onClose, onSubmit }) {
  const [sessions, setSessions] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [classSubjects, setClassSubjects] = useState([]);
  const [sessionId, setSessionId] = useState("");
  const [classId, setClassId] = useState("");
  const [name, setName] = useState("");
  const [gradingScale, setGradingScale] = useState([{ minPercent: "", maxPercent: "", grade: "", remark: "" }]);
  const [schedule, setSchedule] = useState([{
    classSubjectId: "", examDate: "", startTime: "", durationMinutes: "", maxMarks: "", passingMarks: ""
  }]);
  const [loading, setLoading] = useState(true);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [error, setError] = useState("");

  const loadOptions = async () => {
    setLoading(true);
    setError("");
    try {
      const [sessionResult, classResult, subjectResult] = await Promise.all([
        get("/academics/sessions?limit=100"),
        get("/academics/classes?isActive=true&limit=100"),
        get("/academics/subjects?isActive=true&limit=100")
      ]);
      setSessions(sessionResult.items || []);
      setClasses(classResult.items || []);
      setSubjects(subjectResult.items || []);
    } catch (reason) {
      setError(reason.message || "Could not load exam setup options.");
    } finally { setLoading(false); }
  };
  useEffect(() => { loadOptions(); }, []);
  const loadClassSubjects = useCallback(async () => {
    if (!sessionId || !classId) {
      setClassSubjects([]);
      return;
    }
    setSubjectsLoading(true);
    setError("");
    try {
      const result = await get(`/academics/class-subjects${queryString({ academicSessionId: sessionId, classId, isActive: true, limit: 100 })}`);
      setClassSubjects(result.items || []);
    } catch (reason) {
      setError(reason.message || "Could not load class subjects.");
    } finally { setSubjectsLoading(false); }
  }, [sessionId, classId]);
  useEffect(() => { loadClassSubjects(); }, [loadClassSubjects]);

  const updateRow = (setter, index, key, value) =>
    setter((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  const submit = (event) => {
    event.preventDefault();
    try {
      onSubmit(buildExamPayload({
        academicSessionId: sessionId,
        classId,
        name,
        gradingScale,
        subjects: schedule
      }));
    } catch (reason) {
      setError(reason.message || "Check the grading scale and exam schedule.");
    }
  };
  const subjectLabel = (assignment) => {
    const subject = subjects.find((item) => item._id === (assignment.subjectId?._id || assignment.subjectId));
    return subject?.name || "Assigned subject";
  };
  return <Modal title="Create exam schedule" onClose={onClose}><form className="form-stack modal-form" onSubmit={submit}>
    {error && <div className="form-error" role="alert">{error} <button type="button" className="button button-quiet button-small" onClick={sessionId && classId ? loadClassSubjects : loadOptions} disabled={loading || subjectsLoading}>Retry options</button></div>}
    {loading ? <SkeletonRows rows={2} /> : <>
      <label>Exam name<input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={120} /></label>
      <div className="form-grid">
        <label>Academic session<select value={sessionId} onChange={(event) => { setSessionId(event.target.value); setClassSubjects([]); }} required><option value="">Select a session</option>{sessions.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
        <label>Class<select value={classId} onChange={(event) => { setClassId(event.target.value); setClassSubjects([]); }} required><option value="">Select a class</option>{classes.map((item) => <option key={item._id} value={item._id}>{item.name} · {item.code}</option>)}</select></label>
      </div>
      <div className="fee-line-items"><strong>School grading scale</strong><small className="field-hint">Enter contiguous percentage bands covering 0–100 using your school’s grading policy.</small>
        {gradingScale.map((band, index) => <div className="form-grid" key={index}>
          <label>Minimum %<input type="number" min="0" max="100" step="0.01" value={band.minPercent} onChange={(event) => updateRow(setGradingScale, index, "minPercent", event.target.value)} required /></label>
          <label>Maximum %<input type="number" min="0" max="100" step="0.01" value={band.maxPercent} onChange={(event) => updateRow(setGradingScale, index, "maxPercent", event.target.value)} required /></label>
          <label>Grade<input value={band.grade} maxLength={8} onChange={(event) => updateRow(setGradingScale, index, "grade", event.target.value)} required /></label>
          <label>Remark<input value={band.remark} maxLength={60} onChange={(event) => updateRow(setGradingScale, index, "remark", event.target.value)} /></label>
          {gradingScale.length > 1 && <button type="button" className="button button-quiet" onClick={() => setGradingScale((rows) => rows.filter((_, row) => row !== index))}>Remove band</button>}
        </div>)}
        <button type="button" className="button button-outline button-small" disabled={gradingScale.length >= 20} onClick={() => setGradingScale((rows) => [...rows, { minPercent: "", maxPercent: "", grade: "", remark: "" }])}>Add grading band</button>
      </div>
      <div className="fee-line-items"><strong>Scheduled subjects</strong>
        {subjectsLoading ? <SkeletonRows rows={2} /> : !sessionId || !classId ? <small className="field-hint">Select a session and class to load assigned subjects.</small> : !classSubjects.length ? <small className="field-hint">No active subject assignments were found for this class and session.</small> : schedule.map((entry, index) => <div className="form-grid" key={index}>
          <label>Assigned subject<select value={entry.classSubjectId} onChange={(event) => updateRow(setSchedule, index, "classSubjectId", event.target.value)} required><option value="">Select a subject</option>{classSubjects.filter((item) => item._id === entry.classSubjectId || !schedule.some((row, rowIndex) => rowIndex !== index && row.classSubjectId === item._id)).map((item) => <option key={item._id} value={item._id}>{subjectLabel(item)}</option>)}</select></label>
          <label>Exam date<input type="date" value={entry.examDate} onChange={(event) => updateRow(setSchedule, index, "examDate", event.target.value)} required /></label>
          <label>Start time<input type="time" value={entry.startTime} onChange={(event) => updateRow(setSchedule, index, "startTime", event.target.value)} required /></label>
          <label>Duration (minutes)<input type="number" min="1" max="600" value={entry.durationMinutes} onChange={(event) => updateRow(setSchedule, index, "durationMinutes", event.target.value)} required /></label>
          <label>Maximum marks<input type="number" min="0.01" max="10000" step="0.01" value={entry.maxMarks} onChange={(event) => updateRow(setSchedule, index, "maxMarks", event.target.value)} required /></label>
          <label>Passing marks<input type="number" min="0" max="10000" step="0.01" value={entry.passingMarks} onChange={(event) => updateRow(setSchedule, index, "passingMarks", event.target.value)} required /></label>
          {schedule.length > 1 && <button type="button" className="button button-quiet" onClick={() => setSchedule((rows) => rows.filter((_, row) => row !== index))}>Remove subject</button>}
        </div>)}
        <button type="button" className="button button-outline button-small" disabled={!classSubjects.length || schedule.length >= classSubjects.length || schedule.length >= 50} onClick={() => setSchedule((rows) => [...rows, { classSubjectId: "", examDate: "", startTime: "", durationMinutes: "", maxMarks: "", passingMarks: "" }])}>Add subject schedule</button>
      </div>
    </>}
    <div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy || loading || subjectsLoading || Boolean(error) || !sessions.length || !classes.length || !classSubjects.length}>{busy ? "Creating…" : "Create exam"}</button></div>
  </form></Modal>;
}

function MarksEntryModal({ exam, onClose, onSaved, onError }) {
  const [subjectId, setSubjectId] = useState(exam.subjects?.[0]?.classSubjectId || "");
  const [roster, setRoster] = useState([]);
  const [marks, setMarks] = useState({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const selectedSubject = exam.subjects.find((subject) => subject.classSubjectId === subjectId);
  useEffect(() => {
    let active = true;
    const fetchRoster = async () => {
      if (!subjectId) return;
      setLoading(true);
      try {
        const rows = await get(`/portal/teacher/exams/${exam._id}/roster${queryString({ classSubjectId: subjectId })}`);
        if (active) {
          setRoster(rows);
          setMarks(Object.fromEntries(rows.map((student) => [student.id, ""])));
        }
      } catch (reason) { if (active) onError(reason.message); }
      finally { if (active) setLoading(false); }
    };
    fetchRoster();
    return () => { active = false; };
  }, [exam._id, subjectId]);
  const save = async (event) => {
    event.preventDefault();
    const records = roster.filter((student) => marks[student.id] !== "").map((student) => ({
      studentId: student.id,
      marksObtained: Number(marks[student.id])
    }));
    if (!records.length) { onError("Enter at least one mark before saving."); return; }
    setBusy(true);
    try {
      await post(`/exams/${exam._id}/marks`, { classSubjectId: subjectId, records });
      onSaved(`Saved marks for ${records.length} student${records.length === 1 ? "" : "s"}.`);
    } catch (reason) { onError(reason.message); }
    finally { setBusy(false); }
  };
  return <Modal title={`Enter marks · ${exam.name}`} onClose={onClose}><form className="form-stack modal-form" onSubmit={save}><label>Assigned subject<select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>{exam.subjects.map((subject) => <option value={subject.classSubjectId} key={subject.classSubjectId}>{subject.subjectName || subject.subjectId} · max {subject.maxMarks}</option>)}</select></label>{loading ? <SkeletonRows /> : roster.length ? <div className="marks-roster">{roster.map((student) => <label className="mark-row" key={student.id}><span><strong>{student.firstName} {student.lastName}</strong><small>{student.admissionNumber}</small></span><input aria-label={`Marks for ${student.firstName} ${student.lastName}`} type="number" min="0" max={selectedSubject?.maxMarks} step="0.01" value={marks[student.id] ?? ""} onChange={(event) => setMarks((current) => ({ ...current, [student.id]: event.target.value }))} /></label>)}</div> : <EmptyState title="No enrolled students found" />}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy || loading || !roster.length}>{busy ? "Saving…" : "Save marks"}</button></div></form></Modal>;
}

function ReportsPage() {
  const [report, setReport] = useState("students");
  const [filters, setFilters] = useState({ from: `${new Date().getFullYear()}-01-01`, to: today() });
  const [appliedFilters, setAppliedFilters] = useState({ from: `${new Date().getFullYear()}-01-01`, to: today() });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], pagination: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);
  const [options, setOptions] = useState({ classes: [], sessions: [], students: [] });
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState("");
  const config = REPORT_CONFIG[report];
  const activeFilters = Object.fromEntries(config.filters.map((name) => [name, appliedFilters[name]]));
  const rows = data.items.map((item) => reportRow(report, item));
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await get(`/reports${config.endpoint}${queryString({ ...activeFilters, page, limit: 100 })}`);
      setData({ items: Array.isArray(result?.items) ? result.items : [], pagination: result?.pagination || null });
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  }, [config, activeFilters.from, activeFilters.to, activeFilters.classId, activeFilters.academicSessionId, activeFilters.studentId, activeFilters.status, activeFilters.method, page]);

  const loadOptions = useCallback(async () => {
    setOptionsLoading(true);
    setOptionsError("");
    const requests = [
      ["/academics/classes?limit=100", "classes"],
      ["/academics/sessions?limit=100", "sessions"],
      ["/students?limit=100", "students"]
    ];
    const results = await Promise.allSettled(requests.map(([path]) => get(path)));
    const nextOptions = {};
    const failed = [];
    results.forEach((result, index) => {
      const [, key] = requests[index];
      if (result.status === "fulfilled") nextOptions[key] = Array.isArray(result.value?.items) ? result.value.items : [];
      else {
        nextOptions[key] = [];
        failed.push(key);
      }
    });
    setOptions(nextOptions);
    if (failed.length) setOptionsError(`Some filter options could not be loaded (${failed.join(", ")}).`);
    setOptionsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadOptions(); }, [loadOptions]);

  const updateFilter = (name, value) => {
    setFilters((current) => ({ ...current, [name]: value }));
  };
  const runReport = () => {
    const changed = config.filters.some((name) => filters[name] !== appliedFilters[name]);
    setAppliedFilters({ ...filters });
    if (page !== 1) setPage(1);
    else if (!changed) load();
  };
  const changeReport = (value) => {
    setReport(value);
    setFilters((current) => ({ ...current, status: "" }));
    setAppliedFilters((current) => ({ ...current, status: "" }));
    setPage(1);
  };
  const exportRows = async (format) => {
    try {
      if (format === "csv") exportCsv(`${config.fileName}-report.csv`, rows);
      if (format === "excel") await exportExcel(`${config.fileName}-report.xlsx`, rows, config.shortTitle);
      if (format === "pdf") printPdf(`${config.title} report`, rows);
    } catch (reason) {
      setNotice({ type: "error", message: reason.message });
    }
  };

  return <>
    <PageHeader title="Reports & insights" description="Build clear, export-ready views of your school’s live records." action={rows.length > 0 && !loading && <div className="export-actions">
      <button className="button button-outline" onClick={() => exportRows("csv")}><Download size={15} />CSV</button>
      <button className="button button-outline" onClick={() => exportRows("excel")}>Excel</button>
      <button className="button button-outline" onClick={() => exportRows("pdf")}>PDF</button>
    </div>} />
    <Notice notice={notice} onClose={() => setNotice(null)} />
    <section className="content-card report-card">
      <div className="report-heading">
        <div><span className="page-kicker">REPORT BUILDER</span><h2>{config.title}</h2><p>{config.description}</p></div>
        <label className="report-type">Report type<select value={report} onChange={(event) => changeReport(event.target.value)}>{Object.entries(REPORT_CONFIG).map(([key, item]) => <option key={key} value={key}>{item.title}</option>)}</select></label>
      </div>
      <div className="report-filters">
        {config.filters.map((name) => <ReportFilter key={`${report}-${name}`} name={name} report={report} value={filters[name] || ""} options={options} optionsLoading={optionsLoading} onChange={updateFilter} />)}
        <button className="button button-primary report-run" onClick={runReport} disabled={loading}>{loading ? "Updating…" : "Run report"}</button>
      </div>
      {optionsError && <div className="report-option-error" role="status">{optionsError} <button onClick={loadOptions} disabled={optionsLoading}>{optionsLoading ? "Retrying…" : "Retry options"}</button></div>}
      <div className="report-results-heading">
        <div><strong>Report results</strong><span>{loading ? "Refreshing records…" : `${data.pagination?.total ?? rows.length} records · up to 100 per page${rows.length > 0 ? " · exports include this page" : ""}`}</span></div>
        {!loading && rows.length > 0 && <span className="report-result-tag">{config.shortTitle}</span>}
      </div>
      {loading ? <SkeletonRows /> : error ? <ErrorState error={{ message: error }} onRetry={load} /> : rows.length === 0 ? <EmptyState title="No records match these filters" detail="Adjust the filters or choose a wider date range, then run the report again." /> : <>
        <div className="table-scroll report-table-scroll"><table className="report-table"><thead><tr>{config.columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>
          {rows.map((row, index) => <tr key={`${report}-${index}`}>{config.columns.map(([key]) => <td key={key}>{key === "status" ? <span className={`badge badge-${String(row[key] || "").toLowerCase()}`}>{row[key] || "—"}</span> : row[key] ?? "—"}</td>)}</tr>)}
        </tbody></table></div>
        <Pagination pagination={data.pagination} onPage={setPage} />
      </>}
    </section>
  </>;
}

const REPORT_CONFIG = {
  students: {
    title: "Student records", shortTitle: "Students", fileName: "students", endpoint: "/students/records",
    description: "Review admissions, enrollment status, and student placements.",
    filters: ["from", "to", "classId", "academicSessionId", "studentId", "status"],
    columns: [["admissionNumber", "Admission no."], ["name", "Student"], ["status", "Status"], ["admissionDate", "Admission date"], ["academicSession", "Academic session"], ["class", "Class"], ["section", "Section"]]
  },
  attendance: {
    title: "Attendance records", shortTitle: "Attendance", fileName: "attendance", endpoint: "/attendance/records",
    description: "Track daily attendance patterns for students and classes.",
    filters: ["from", "to", "classId", "academicSessionId", "studentId", "status"],
    columns: [["date", "Date"], ["admissionNumber", "Admission no."], ["studentName", "Student"], ["className", "Class"], ["sectionName", "Section"], ["academicSession", "Academic session"], ["status", "Status"]]
  },
  collections: {
    title: "Fee collections", shortTitle: "Collections", fileName: "fee-collections", endpoint: "/finance/collections",
    description: "Review received payments by date, student, class, and method.",
    filters: ["from", "to", "classId", "studentId", "method"],
    columns: [["receiptNumber", "Receipt no."], ["receivedAt", "Received"], ["admissionNumber", "Admission no."], ["studentName", "Student"], ["className", "Class"], ["period", "Period"], ["amount", "Amount"], ["method", "Method"]]
  },
  dues: {
    title: "Outstanding dues", shortTitle: "Dues", fileName: "outstanding-dues", endpoint: "/finance/dues",
    description: "Identify unpaid and partially paid balances that need follow-up.",
    filters: ["from", "to", "classId", "studentId", "status"],
    columns: [["admissionNumber", "Admission no."], ["studentName", "Student"], ["className", "Class"], ["period", "Period"], ["dueDate", "Due date"], ["balance", "Balance"], ["status", "Status"]]
  },
  classes: {
    title: "Class & session summary", shortTitle: "Class summary", fileName: "class-session-summary", endpoint: "/academics/classes",
    description: "Compare class enrollment and student status across academic sessions.",
    filters: ["academicSessionId", "classId"],
    columns: [["className", "Class"], ["academicSession", "Academic session"], ["enrolled", "Enrolled"], ["withdrawn", "Withdrawn"], ["transferred", "Transferred"], ["graduated", "Graduated"]]
  },
  results: {
    title: "Exam results", shortTitle: "Exam results", fileName: "exam-results", endpoint: "/academics/results",
    description: "Review assessment performance by student, class, and session.",
    filters: ["from", "to", "classId", "academicSessionId", "studentId", "status"],
    columns: [["examName", "Exam"], ["examDate", "Exam date"], ["academicSession", "Academic session"], ["className", "Class"], ["admissionNumber", "Admission no."], ["studentName", "Student"], ["subject", "Subject"], ["marksObtained", "Marks"], ["maxMarks", "Maximum"], ["passingMarks", "Passing"], ["grade", "Grade"], ["status", "Result"]]
  }
};

function ReportFilter({ name, value, report, options, optionsLoading, onChange }) {
  const filterLabels = { from: "From", to: "To", classId: "Class", academicSessionId: "Academic session", studentId: "Student", status: "Status", method: "Payment method" };
  const filterOptions = {
    classId: options.classes.map((item) => [item.classId || item._id || item.id, item.className || item.name || item.code || "Class"]),
    academicSessionId: options.sessions.map((item) => [item.academicSessionId || item._id || item.id, item.academicSession || item.name || item.title || "Session"]),
    studentId: options.students.map((item) => [item.studentId || item._id || item.id, `${item.firstName || ""} ${item.lastName || ""}`.trim() || item.name || item.admissionNumber || "Student"])
  };
  const choices = name === "status" ? statusOptionsForReport(report)
    : name === "method" ? ["cash", "bank_transfer", "cheque", "other"] : null;
  return <label className="report-filter">{filterLabels[name]}
    {name === "from" || name === "to" ? <input type="date" value={value} onChange={(event) => onChange(name, event.target.value)} /> : <select value={value} onChange={(event) => onChange(name, event.target.value)} disabled={optionsLoading && !choices}>
      <option value="">{choices ? `Any ${name === "method" ? "method" : "status"}` : `All ${name === "classId" ? "classes" : name === "studentId" ? "students" : "sessions"}`}</option>
      {choices ? choices.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>) : (filterOptions[name] || []).filter(([id]) => id).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
    </select>}
  </label>;
}

function statusOptionsForReport(report) {
  if (report === "students") return ["enrolled", "withdrawn", "transferred", "graduated"];
  if (report === "attendance") return ["present", "absent", "late", "leave"];
  if (report === "dues") return ["unpaid", "partial"];
  if (report === "results") return ["passed", "failed"];
  return null;
}

function reportRow(report, item) {
  const name = [item.firstName, item.lastName].filter(Boolean).join(" ") || item.name;
  const amount = (value, currency) => {
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format((value || 0) / 100); }
    catch { return `${((value || 0) / 100).toFixed(2)} ${currency || ""}`.trim(); }
  };
  const date = (value) => {
    if (!value) return "—";
    const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
    return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleDateString();
  };
  const entity = (value) => typeof value === "object" && value !== null ? value.name || value.className || value.title || value.code || "—" : value || "—";
  if (report === "students") return { admissionNumber: item.admissionNumber, name: name || "—", status: item.status, admissionDate: date(item.admissionDate), academicSession: entity(item.academicSession), class: entity(item.class), section: entity(item.section) };
  if (report === "attendance") return { date: date(item.date), admissionNumber: item.admissionNumber, studentName: item.studentName, className: item.className, sectionName: item.sectionName, academicSession: entity(item.academicSession), status: item.status };
  if (report === "collections") return { receiptNumber: item.receiptNumber, receivedAt: date(item.receivedAt), admissionNumber: item.admissionNumber, studentName: item.studentName, className: item.className, period: item.period, amount: amount(item.amountMinor, item.currency), method: item.method };
  if (report === "dues") return { admissionNumber: item.admissionNumber, studentName: item.studentName, className: item.className, period: item.period, dueDate: date(item.dueDate), balance: amount(item.balanceMinor, item.currency), status: item.status };
  if (report === "classes") return { className: item.className, academicSession: entity(item.academicSession), enrolled: item.byStatus?.enrolled ?? item.enrolled, withdrawn: item.byStatus?.withdrawn ?? 0, transferred: item.byStatus?.transferred ?? 0, graduated: item.byStatus?.graduated ?? 0 };
  return { examName: item.examName, examDate: date(item.examDate), academicSession: entity(item.academicSession), className: item.className, admissionNumber: item.admissionNumber, studentName: item.studentName, subject: item.subject, marksObtained: item.marksObtained, maxMarks: item.maxMarks, passingMarks: item.passingMarks, grade: item.grade, status: item.status };
}

function SubscriptionPage({ page }) {
  const isPlatform = page === "platform" || page === "platform/plans";
  const [tab, setTab] = useState(page === "platform/plans" ? "plans" : "schools");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setLoading(true); setError("");
    try {
      const result = isPlatform
        ? await get(tab === "plans" ? "/platform/plans?includeInactive=true&limit=100" : "/platform/schools?limit=100")
        : await get("/schools/subscription");
      setItems(isPlatform ? result.items || [] : [result]);
    } catch (reason) { setError(reason.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [tab, page]);
  const toggleSchool = async (school) => {
    if (school.status !== "suspended") {
      setConfirmation({ type: "suspend-school", item: school });
      return;
    }
    try {
      await patch(`/platform/schools/${school._id}/status`, { status: school.status === "suspended" ? "active" : "suspended" });
      setNotice({ type: "success", message: `School ${school.status === "suspended" ? "reactivated" : "suspended"}.` });
      await load();
    } catch (reason) { setNotice({ type: "error", message: reason.message }); }
  };
  const confirmSuspendSchool = async () => {
    const school = confirmation.item;
    setBusy(true);
    try {
      await patch(`/platform/schools/${school._id}/status`, { status: "suspended" });
      setNotice({ type: "success", message: "School suspended." });
      setConfirmation(null);
      await load();
    } catch (reason) { setNotice({ type: "error", message: reason.message }); }
    finally { setBusy(false); }
  };
  const updatePlanAvailability = async (plan) => {
    try {
      await patch(`/platform/plans/${plan._id}`, { isActive: !plan.isActive });
      setNotice({ type: "success", message: `Plan ${plan.isActive ? "deactivated" : "activated"}.` });
      await load();
    } catch (reason) { setNotice({ type: "error", message: reason.message }); }
  };
  const savePlan = async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const features = Object.fromEntries(FEATURES.map((feature) => [feature, form[`feature:${feature}`] === "on"]));
    const asLimit = (name) => form[name] === "" ? null : Number(form[name]);
    const body = {
      name: form.name, code: form.code, description: form.description || undefined,
      priceMinor: Number(form.priceMinor), currency: form.currency.toUpperCase(),
      billingInterval: form.billingInterval,
      trialDurationDays: form.trialDurationDays === "" ? null : Number(form.trialDurationDays),
      limits: { students: asLimit("students"), staff: asLimit("staff"), branches: asLimit("branches") },
      features, isActive: form.isActive === "on", isDefaultTrial: form.isDefaultTrial === "on"
    };
    setBusy(true);
    try {
      await post("/platform/plans", body);
      setNotice({ type: "success", message: "Subscription plan created." });
      setDialog(null); await load();
    } catch (reason) { setNotice({ type: "error", message: reason.message }); }
    finally { setBusy(false); }
  };
  const saveSchoolPlan = async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const body = { planId: form.planId, status: form.status };
    if (form.status === "trial" && form.trialEndsAt) body.trialEndsAt = new Date(`${form.trialEndsAt}T23:59:59.000Z`).toISOString();
    if (form.status === "active" && form.currentPeriodEnd) body.currentPeriodEnd = new Date(`${form.currentPeriodEnd}T23:59:59.000Z`).toISOString();
    setBusy(true);
    try {
      await patch(`/platform/schools/${dialog.school._id}/subscription`, body);
      setNotice({ type: "success", message: "School plan assignment updated." });
      setDialog(null); await load();
    } catch (reason) { setNotice({ type: "error", message: reason.message }); }
    finally { setBusy(false); }
  };
  if (!isPlatform) {
    const subscription = items[0];
    return <><PageHeader title="Your subscription" description="Plan entitlements configured for your school workspace." /><Notice notice={notice} onClose={() => setNotice(null)} /><section className="content-card plan-card">{loading ? <LoadingState /> : error ? <ErrorState error={{ message: error }} onRetry={load} /> : subscription?.plan ? <><div className="plan-header"><div><span className="page-kicker">CURRENT PLAN</span><h2>{subscription.plan.name}</h2><p>{subscription.plan.priceMinor === 0 ? "Included trial plan" : `${formatMinor(subscription.plan.priceMinor, subscription.plan.currency)} / ${subscription.plan.billingInterval}`}</p></div><span className={`badge badge-${subscription.status}`}>{subscription.status}</span></div><div className="plan-limits">{Object.entries(subscription.plan.limits || {}).map(([key, limit]) => <div key={key}><span>{key}</span><strong>{subscription.usage?.[key] ?? 0} / {limit ?? "Unlimited"}</strong></div>)}</div><h3>Included features</h3><div className="feature-chips">{Object.entries(subscription.plan.features || {}).map(([feature, enabled]) => <span className={enabled ? "feature-on" : "feature-off"} key={feature}>{enabled ? "✓" : "×"} {feature}</span>)}</div></> : <EmptyState title="No active plan assigned" detail="Contact your platform administrator for subscription setup." />}</section></>;
  }
  return <>
    <PageHeader title="Platform administration" description="Manage customer schools and configurable subscription plans." action={tab === "plans" && <button className="button button-primary" onClick={() => setDialog({ type: "create-plan" })}><Plus size={16} />Create plan</button>} />
    <Notice notice={notice} onClose={() => setNotice(null)} />
    <div className="tabs platform-tabs" role="group" aria-label="Platform administration view"><button type="button" aria-pressed={tab === "schools"} className={tab === "schools" ? "tab active-tab" : "tab"} onClick={() => setTab("schools")}>Schools</button><button type="button" aria-pressed={tab === "plans"} className={tab === "plans" ? "tab active-tab" : "tab"} onClick={() => setTab("plans")}>Plans</button></div>
    <section className="content-card table-card">
      {loading ? <SkeletonRows /> : error ? <ErrorState error={{ message: error }} onRetry={load} /> : items.length ? <div className="table-scroll">
        <table><thead><tr>{tab === "schools" ? ["name", "slug", "email", "status", "subscription"].map((key) => <th key={key}>{columnLabel(key)}</th>) : ["name", "code", "priceMinor", "currency", "billingInterval", "limits", "isActive", "isDefaultTrial"].map((key) => <th key={key}>{columnLabel(key)}</th>)}<th>Actions</th></tr></thead>
          <tbody>{items.map((item) => <tr key={item._id}>{tab === "schools" ? <>
            <td><strong>{item.name}</strong></td><td>{item.slug}</td><td>{item.email}</td><td><span className={`badge badge-${item.status}`}>{item.status}</span></td><td>{item.subscription?.plan || item.subscription?.status || "Unassigned"}</td>
            <td><div className="row-actions"><button className="button button-small button-outline" onClick={() => setDialog({ type: "school-plan", school: item })}>Manage plan</button><button className="button button-small button-outline" onClick={() => toggleSchool(item)}>{item.status === "suspended" ? "Reactivate" : "Suspend"}</button></div></td>
          </> : <>
            <td><strong>{item.name}</strong></td><td>{item.code}</td><td>{formatMinor(item.priceMinor, item.currency)}</td><td>{item.currency}</td><td>{item.billingInterval}</td><td><ul className="limit-list">{Object.entries(item.limits || {}).map(([key, limit]) => <li key={key}>{columnLabel(key)}: {limit ?? "Unlimited"}</li>)}</ul></td><td><span className={`badge badge-${item.isActive ? "active" : "suspended"}`}>{item.isActive ? "Active" : "Inactive"}</span></td><td>{item.isDefaultTrial ? "Default trial" : "—"}</td>
            <td><button disabled={item.isDefaultTrial && item.isActive} className="button button-small button-outline" onClick={() => updatePlanAvailability(item)}>{item.isActive ? "Deactivate" : "Activate"}</button></td>
          </>}</tr>)}</tbody>
        </table>
      </div> : <EmptyState title="No records found" detail="No records are currently available." />}
    </section>
    {dialog?.type === "create-plan" && <PlanCreateModal busy={busy} onClose={() => setDialog(null)} onSubmit={savePlan} />}
    {dialog?.type === "school-plan" && <SchoolPlanModal school={dialog.school} busy={busy} onClose={() => setDialog(null)} onSubmit={saveSchoolPlan} />}
    {confirmation?.type === "suspend-school" && <ConfirmDialog title="Suspend this school?" message={`${confirmation.item.name} will lose access to its school workspace until reactivated.`} confirmLabel="Suspend school" busy={busy} onClose={() => setConfirmation(null)} onConfirm={confirmSuspendSchool} />}
  </>;
}

const FEATURES = ["academics", "students", "staff", "attendance", "fees", "exams", "calendar", "inventory", "library", "notifications", "reports"];

function PlanCreateModal({ busy, onClose, onSubmit }) {
  return <Modal title="Create subscription plan" onClose={onClose}><form className="form-stack modal-form" onSubmit={onSubmit}>
    <div className="form-grid"><label>Plan name<input name="name" required minLength="2" maxLength="100" /></label><label>Unique code<input name="code" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></label><label>Price (minor units)<input name="priceMinor" type="number" min="0" required defaultValue="0" /></label><label>Currency<input name="currency" required minLength="3" maxLength="3" defaultValue="USD" /></label><label>Billing interval<select name="billingInterval"><option value="monthly">Monthly</option><option value="annual">Annual</option></select></label><label>Trial duration (days)<input name="trialDurationDays" type="number" min="1" max="365" placeholder="Leave blank if not trial" /></label><label>Student limit<input name="students" type="number" min="1" placeholder="Unlimited" /></label><label>Staff limit<input name="staff" type="number" min="1" placeholder="Unlimited" /></label><label>Branch limit<input name="branches" type="number" min="1" placeholder="Unlimited" /></label></div>
    <label>Description<textarea name="description" rows="2" maxLength="500" /></label>
    <div className="feature-grid">{FEATURES.map((feature) => <label key={feature}><input type="checkbox" name={`feature:${feature}`} />{feature}</label>)}</div>
    <div className="form-grid"><label className="checkbox-field"><input type="checkbox" name="isActive" defaultChecked />Plan active</label><label className="checkbox-field"><input type="checkbox" name="isDefaultTrial" />Default trial plan</label></div>
    <div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? "Creating…" : "Create plan"}</button></div>
  </form></Modal>;
}

function SchoolPlanModal({ school, busy, onClose, onSubmit }) {
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => { get("/platform/plans?limit=100").then((result) => setPlans(result.items || [])).catch((reason) => setError(reason.message)); }, []);
  const currentStatus = school.subscription?.status || (school.status === "trial" ? "trial" : "active");
  const [status, setStatus] = useState(currentStatus);
  const [planId, setPlanId] = useState(school.subscription?.planId || "");
  const eligiblePlans = plans.filter((plan) => status === "trial" ? plan.isDefaultTrial : status === "active" ? !plan.isDefaultTrial : true);
  const selectedPlanId = eligiblePlans.some((plan) => plan._id === planId) ? planId : "";
  return <Modal title={`Manage plan · ${school.name}`} onClose={onClose}><form className="form-stack modal-form" onSubmit={onSubmit}>
    {error && <div className="form-error" role="alert">{error}</div>}
    <label>Subscription plan<select name="planId" required value={selectedPlanId} onChange={(event) => setPlanId(event.target.value)}><option value="" disabled>Select a plan for this status</option>{eligiblePlans.map((plan) => <option key={plan._id} value={plan._id}>{plan.name} · {plan.code}</option>)}</select></label>
    <label>Subscription status<select name="status" value={status} onChange={(event) => setStatus(event.target.value)}>{["trial", "active", "past_due", "canceled"].map((value) => <option key={value} value={value}>{value.replace("_", " ")}</option>)}</select></label>
    {status === "trial" && <label>Trial ends<input name="trialEndsAt" type="date" required defaultValue={school.subscription?.trialEndsAt?.slice(0, 10) || ""} /></label>}
    {status === "active" && <label>Current period ends<input name="currentPeriodEnd" type="date" required defaultValue={school.subscription?.currentPeriodEnd?.slice(0, 10) || ""} /></label>}
    <p className="field-hint">Trial subscriptions require the default trial plan. Active subscriptions require a future billing end date; past-due and canceled schools are suspended.</p>
    {plans.length > 0 && !eligiblePlans.length && <div className="form-error" role="alert">No active plan is configured for this subscription status.</div>}
    <div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy || !eligiblePlans.length}>{busy ? "Saving…" : "Save subscription"}</button></div>
  </form></Modal>;
}

function SchoolProfile() {
  const [school, setSchool] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = async () => { setLoading(true); try { setSchool((await get("/schools/me")).school); } catch (reason) { setError(reason.message); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  return <><PageHeader title="School profile" description="Identity and subscription status for your school." />{loading ? <LoadingState /> : error ? <ErrorState error={{ message: error }} onRetry={load} /> : <div className="content-card profile-card"><div className="profile-logo">{school.name?.slice(0, 1)}</div><h2>{school.name}</h2><p>{school.email}</p><div className="profile-details">{[["Workspace URL", school.slug], ["Status", school.status], ["Plan", school.subscription?.plan], ["Subscription status", school.subscription?.status], ["Current period end", school.subscription?.currentPeriodEnd ? new Date(school.subscription.currentPeriodEnd).toLocaleDateString() : "—"]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value || "—"}</strong></div>)}</div></div>}</>;
}

function ParentChildren() {
  const [children, setChildren] = useState([]); const [selected, setSelected] = useState(""); const [detail, setDetail] = useState(null); const [tab, setTab] = useState("attendance"); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); setError(""); try { const result = await get("/portal/parent/students"); setChildren(result); setSelected((current) => current || result[0]?.id || ""); } catch (reason) { setError(reason.message); } finally { setLoading(false); } };
  const loadDetail = useCallback(async () => { if (!selected) return; setLoading(true); setError(""); try { setDetail(await get(`/portal/parent/students/${selected}/${tab}`)); } catch (reason) { setError(reason.message); } finally { setLoading(false); } }, [selected, tab]);
  useEffect(() => { load(); }, []);
  useEffect(() => { loadDetail(); }, [loadDetail]);
  const changeTab = (event, nextTab) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const tabs = ["attendance", "fees", "results"];
    const nextIndex = (tabs.indexOf(tab) + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    setTab(tabs[nextIndex]);
    event.currentTarget.parentElement.querySelector(`[data-tab="${tabs[nextIndex]}"]`)?.focus();
  };
  return <><PageHeader title="My children" description="Personal school updates, visible only for students linked to your verified parent account." />{children.length > 0 && <section className="content-card table-card"><div className="filter-toolbar"><label>Student<select value={selected} onChange={(event) => setSelected(event.target.value)}>{children.map((child) => <option key={child.id} value={child.id}>{child.firstName} {child.lastName} · {child.admissionNumber}</option>)}</select></label><div className="tabs" role="tablist" aria-label="Student records">{["attendance", "fees", "results"].map((value) => <button key={value} type="button" role="tab" data-tab={value} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} id={`parent-tab-${value}`} aria-controls="parent-records" className={tab === value ? "tab active-tab" : "tab"} onKeyDown={(event) => changeTab(event, value)} onClick={() => setTab(value)}>{value}</button>)}</div></div><div id="parent-records" role="tabpanel" aria-labelledby={`parent-tab-${tab}`}>{loading ? <SkeletonRows /> : error ? <ErrorState error={{ message: error }} onRetry={loadDetail} /> : <ParentRecords tab={tab} detail={detail} />}</div></section>}{loading && !children.length && <LoadingState />}{error && !children.length && <ErrorState error={{ message: error }} onRetry={load} />}</>;
}

function ParentRecords({ tab, detail }) {
  const columns = tab === "attendance"
    ? [["date", "Date", (row) => row.date ? new Date(row.date).toLocaleDateString() : "—"], ["status", "Status"], ["checkIn", "Check-in", (row) => row.checkIn ? new Date(row.checkIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"], ["checkOut", "Check-out", (row) => row.checkOut ? new Date(row.checkOut).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"], ["note", "Note"]]
    : tab === "fees"
      ? [["period", "Period"], ["dueDate", "Due date", (row) => row.dueDate ? new Date(row.dueDate).toLocaleDateString() : "—"], ["amountDueMinor", "Amount due", (row) => formatMinor(row.amountDueMinor, row.currency)], ["paidAmountMinor", "Paid", (row) => formatMinor(row.paidAmountMinor, row.currency)], ["balanceMinor", "Balance", (row) => formatMinor(row.balanceMinor, row.currency)], ["status", "Status"]]
      : [["examId", "Assessment reference"], ["classSubjectId", "Subject reference"], ["marksObtained", "Marks"], ["enteredAt", "Entered", (row) => row.enteredAt ? new Date(row.enteredAt).toLocaleDateString() : "—"]];
  const rows = tab === "attendance" ? detail || [] : tab === "fees" ? detail?.vouchers || [] : detail || [];
  if (!rows.length) return <EmptyState title={`No ${tab} records`} detail="There are no records available for the selected student." />;
  return <>{tab === "fees" && <><h2 className="parent-record-heading">Fee vouchers</h2><RecordsTable columns={columns} rows={rows} />{detail?.payments?.length > 0 && <><h2 className="parent-record-heading">Recent payments</h2><RecordsTable columns={[["receiptNumber", "Receipt"], ["amountMinor", "Amount", (row) => formatMinor(row.amountMinor, row.currency)], ["method", "Method"], ["receivedAt", "Received", (row) => row.receivedAt ? new Date(row.receivedAt).toLocaleDateString() : "—"]]} rows={detail.payments} /></>}</>}{tab !== "fees" && <RecordsTable columns={columns} rows={rows} />}</>;
}

function RecordsTable({ columns, rows }) {
  return <div className="table-scroll"><table><thead><tr>{columns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row._id || row.id || index}>{columns.map(([key, , render]) => <td key={key}>{render ? render(row) : key === "status" ? <span className={`badge badge-${row[key] || "active"}`}>{row[key] || "—"}</span> : String(row[key] ?? "—")}</td>)}</tr>)}</tbody></table></div>;
}

function MovementButtons({ item, onMove }) {
  return <div className="row-actions"><button aria-label={`Receive stock for ${item.name}`} className="icon-action" onClick={() => onMove("received")}><ArrowDownToLine size={16} /></button><button aria-label={`Issue stock for ${item.name}`} className="icon-action" onClick={() => onMove("issued")}><ArrowUpFromLine size={16} /></button></div>;
}

function RowActionModal({ page, action, busy, onClose, onSubmit }) {
  let title = action.type === "edit" ? "Update record" : action.type === "issue" ? "Issue library book" : `${action.type === "received" ? "Receive" : "Issue"} inventory`;
  let fields;
  if (action.type === "edit" && page === "students") {
    fields = [
      { name: "firstName", label: "First name", defaultValue: action.item.firstName },
      { name: "lastName", label: "Last name", defaultValue: action.item.lastName },
      { name: "dateOfBirth", label: "Date of birth", type: "date", defaultValue: String(action.item.dateOfBirth || "").slice(0, 10) },
      { name: "gender", label: "Gender", type: "select", options: ["female", "male", "other", "unspecified"], defaultValue: action.item.gender }
    ];
  } else if (action.type === "edit" && page === "staff") {
    fields = [
      { name: "name", label: "Full name", defaultValue: action.item.name },
      { name: "phone", label: "Phone", defaultValue: action.item.phone },
      { name: "jobTitle", label: "Job title", defaultValue: action.item.jobTitle },
      { name: "status", label: "Account status", type: "select", options: ["active", "disabled"], defaultValue: action.item.status }
    ];
  } else if (action.type === "edit") {
    fields = [
      { name: "name", label: "Class name", defaultValue: action.item.name },
      { name: "code", label: "Class code", defaultValue: action.item.code },
      { name: "level", label: "Level", type: "number", min: 0, max: 30, defaultValue: action.item.level },
      { name: "isActive", label: "Class active", type: "select", options: ["true", "false"], defaultValue: String(action.item.isActive) }
    ];
  } else if (action.type === "issue") {
    fields = [
      { name: "studentId", label: "Student record ID", required: true },
      { name: "dueAt", label: "Due date", type: "date", defaultValue: today(), required: true },
      { name: "note", label: "Note" }
    ];
  } else {
    fields = [
      { name: "quantity", label: "Quantity", type: "number", min: 1, required: true, defaultValue: 1 },
      { name: "reference", label: "Reference" },
      { name: "note", label: "Note" }
    ];
  }
  const submit = (event) => {
    if (action.type === "edit" && page === "academics") {
      const active = event.currentTarget.elements.isActive;
      if (active) {
        const hidden = document.createElement("input");
        hidden.type = "hidden"; hidden.name = "isActive"; hidden.value = String(active.value === "true");
        event.currentTarget.appendChild(hidden); active.disabled = true;
      }
    }
    onSubmit(event);
  };
  return <CreateModal title={title} fields={fields} busy={busy} onClose={onClose} onSubmit={submit} />;
}

function formatMinor(value, currency = "USD") { return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format((value || 0) / 100); }
function CheckIcon() { return <CircleDollarSign size={16} />; }
