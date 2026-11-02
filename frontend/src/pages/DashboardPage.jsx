import { useEffect, useState } from "react";
import { Activity, ArrowUpRight, BookOpenCheck, CalendarDays, CircleDollarSign, GraduationCap, Users } from "lucide-react";
import { CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart, Bar } from "recharts";
import { get, queryString } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import { EmptyState, ErrorState, LoadingState } from "../components/feedback.jsx";

const number = (value) => new Intl.NumberFormat().format(value || 0);
const money = (minor, currency = "USD") => new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format((minor || 0) / 100);
const total = (list = []) => list.reduce((sum, item) => sum + item.count, 0);

export default function DashboardPage() {
  const { user, school } = useAuth();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [children, setChildren] = useState([]);
  const [teacherSchedule, setTeacherSchedule] = useState([]);

  const load = async () => {
    setBusy(true); setError("");
    try {
      if (user.role === "parent") {
        setChildren(await get("/portal/parent/students"));
      } else if (user.role === "teacher") {
        const sessions = await get("/academics/sessions?status=active&limit=1");
        const active = sessions.items?.[0];
        setTeacherSchedule(active ? (await get(`/academics/timetable${queryString({ academicSessionId: active._id, limit: 100 })}`)).items || [] : []);
        const month = new Date().toISOString().slice(0, 7);
        const attendance = await get(`/attendance/staff/me${queryString({ month })}`);
        setData({ attendance });
      } else if (user.role === "platform_super_admin") {
        setData(null);
      } else {
        setData(await get("/reports/dashboard"));
      }
    } catch (reason) {
      setError(reason.message || "Dashboard data is unavailable.");
    } finally { setBusy(false); }
  };

  useEffect(() => { load(); }, [user.role]);
  const isPlatform = user.role === "platform_super_admin";
  const isParent = user.role === "parent";

  if (busy) return <><PageIntro title={`Good ${greeting()}, ${user.name.split(" ")[0]}`} subtitle={school?.name || "Your SchoolFlow workspace"} /><LoadingState /></>;
  if (error) return <><PageIntro title={`Good ${greeting()}, ${user.name.split(" ")[0]}`} subtitle={school?.name || "Your SchoolFlow workspace"} /><ErrorState error={{ message: error }} onRetry={load} /></>;

  if (isParent) return <><PageIntro title={`Welcome, ${user.name.split(" ")[0]}`} subtitle="A clear view of your family’s school life." /><div className="metric-grid"><Metric icon={GraduationCap} label="Linked students" value={number(children.length)} tone="blue" /><Metric icon={CalendarDays} label="School calendar" value="Up to date" tone="violet" /><Metric icon={BookOpenCheck} label="Family access" value="Active" tone="green" /></div><section className="content-card section-card"><SectionHeading title="Your children" subtitle="Attendance, fees, and published results are available in each student record." /><div className="child-grid">{children.map((child) => <article className="child-card" key={child.id}><span className="student-avatar">{child.firstName?.[0]}{child.lastName?.[0]}</span><div><strong>{child.firstName} {child.lastName}</strong><small>{child.className || "Student"} · {child.admissionNumber}</small></div><span className={`badge badge-${child.status}`}>{child.status}</span></article>)}{children.length === 0 && <EmptyState title="No linked students yet" detail="Ask your school administrator to link your parent account to a student guardian record." />}</div></section></>;

  if (isPlatform) return <><PageIntro title="Platform overview" subtitle="Manage the SchoolFlow subscription catalog and school accounts." action={<a className="button button-primary" href="/platform">Manage schools <ArrowUpRight size={16} /></a>} /><div className="welcome-panel"><span className="welcome-symbol"><Users size={24} /></span><div><strong>Platform administration</strong><p>School directory and configurable subscription plans are available from the platform workspace.</p></div></div><div className="metric-grid"><Metric icon={ShieldIcon} label="Access level" value="Super admin" tone="violet" /><Metric icon={CircleDollarSign} label="Plan catalog" value="Database managed" tone="green" /></div></>;

  if (user.role === "teacher") {
    const records = data?.attendance?.items || [];
    const summary = data?.attendance?.summary || {};
    const chartData = ["present", "late", "absent", "leave"]
      .filter((status) => records.length > 0 && Number.isFinite(summary[status]))
      .map((status) => ({ name: status[0].toUpperCase() + status.slice(1), days: summary[status] }));
    return <><PageIntro title={`Good ${greeting()}, ${user.name.split(" ")[0]}`} subtitle="Your attendance and teaching schedule." />
      <section className="content-card chart-card"><SectionHeading title="My staff attendance this month" subtitle={data?.attendance?.month || "Current month"} /><div className="chart-area">{records.length ? <ResponsiveContainer width="100%" height={250}><BarChart data={chartData} barSize={32} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}><CartesianGrid vertical={false} stroke="#edf0f5" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#8290a5", fontSize: 12 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#8290a5", fontSize: 12 }} /><Tooltip cursor={{ fill: "#f6f8fc" }} /><Bar dataKey="days" fill="#4669e8" radius={[7, 7, 2, 2]} /></BarChart></ResponsiveContainer> : <EmptyState title="No attendance records this month" detail="Your staff attendance will appear here after it is recorded." />}</div></section>
      <section className="content-card section-card"><SectionHeading title="This term’s timetable" subtitle="Schedule from your active academic session." />{teacherSchedule.length ? <DataTable rows={teacherSchedule} /> : <EmptyState title="No timetable available" />}</section>
    </>;
  }

  const attendance = data?.studentAttendanceToday || [];
  const chartData = attendance.map(({ status, count }) => ({ name: status[0].toUpperCase() + status.slice(1), students: count }));
  const students = total(data?.studentsByStatus);
  const staff = total(data?.staffByRoleAndStatus);
  const collections = data?.collectionsThisMonth || [];
  const overdue = data?.overdueBalances || [];
  const currency = collections[0]?.currency || overdue[0]?.currency || "USD";
  const collected = collections.filter((item) => item.currency === currency).reduce((sum, item) => sum + item.amountMinor, 0);
  const due = overdue.filter((item) => item.currency === currency).reduce((sum, item) => sum + item.balanceMinor, 0);
  return <><PageIntro title={`Good ${greeting()}, ${user.name.split(" ")[0]}`} subtitle={`Here’s what’s happening at ${school?.name || "your school"} today.`} action={<div className="as-of">Live school data <span className="live-dot" /></div>} />
    <div className="metric-grid">
      <Metric icon={GraduationCap} label="Students" value={number(students)} detail="Across all enrollment statuses" tone="blue" />
      <Metric icon={Users} label="Staff members" value={number(staff)} detail="Active school team" tone="violet" />
      <Metric icon={CircleDollarSign} label="Collected this month" value={money(collected, currency)} detail={collections.reduce((sum, item) => sum + item.payments, 0) + " recorded payments"} tone="green" />
      <Metric icon={Activity} label="Outstanding dues" value={money(due, currency)} detail={number(overdue.reduce((sum, item) => sum + item.vouchers, 0)) + " overdue vouchers"} tone="amber" />
    </div>
    <div className="dashboard-grid"><section className="content-card chart-card"><SectionHeading title="Attendance today" subtitle="Student attendance records by status" /><div className="chart-area">{chartData.length ? <ResponsiveContainer width="100%" height={250}><BarChart data={chartData} barSize={32} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}><CartesianGrid vertical={false} stroke="#edf0f5" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#8290a5", fontSize: 12 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#8290a5", fontSize: 12 }} /><Tooltip cursor={{ fill: "#f6f8fc" }} /><Bar dataKey="students" fill="#4669e8" radius={[7, 7, 2, 2]} /></BarChart></ResponsiveContainer> : <EmptyState title="No attendance records today" detail="Once teachers record attendance, the live summary will appear here." />}</div></section>
      <section className="content-card summary-card"><SectionHeading title="School at a glance" subtitle="Current academic operations" /><div className="summary-list"><SummaryRow icon={BookOpenCheck} label="Academic session" value={data?.activeAcademicSession?.name || "Not set"} /><SummaryRow icon={CalendarDays} label="Scheduled exams" value={number(data?.scheduledExams)} /><SummaryRow icon={Activity} label="Attendance records" value={number(total(attendance))} /><SummaryRow icon={CircleDollarSign} label="Overdue vouchers" value={number(overdue.reduce((sum, item) => sum + item.vouchers, 0))} /></div></section></div>
  </>;
}

function greeting() { const hour = new Date().getHours(); return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"; }
function PageIntro({ title, subtitle, action }) { return <div className="page-intro"><div><div className="page-kicker">SCHOOLFLOW WORKSPACE</div><h1>{title}</h1><p>{subtitle}</p></div>{action && <div className="intro-action">{action}</div>}</div>; }
function Metric({ icon: Icon, label, value, detail, tone }) { return <article className="metric-card"><div className={`metric-icon tone-${tone}`}><Icon size={19} /></div><div className="metric-label">{label}</div><strong className="metric-value">{value}</strong>{detail && <div className="metric-detail">{detail}</div>}</article>; }
function SectionHeading({ title, subtitle }) { return <div className="section-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><span className="heading-dot" /></div>; }
function SummaryRow({ icon: Icon, label, value }) { return <div className="summary-row"><span className="summary-icon"><Icon size={16} /></span><span>{label}</span><strong>{value}</strong></div>; }
function DataTable({ rows }) { return <div className="table-scroll"><table><thead><tr>{Object.keys(rows[0] || {}).filter((key) => !["_id", "schoolId", "__v"].includes(key)).slice(0, 5).map((key) => <th key={key}>{key.replace(/[A-Z]/g, (letter) => ` ${letter}`).toUpperCase()}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row._id}>{Object.entries(row).filter(([key]) => !["_id", "schoolId", "__v"].includes(key)).slice(0, 5).map(([key, value]) => <td key={key}>{typeof value === "object" ? "—" : String(value ?? "—")}</td>)}</tr>)}</tbody></table></div>; }
function ShieldIcon(props) { return <Users {...props} />; }
