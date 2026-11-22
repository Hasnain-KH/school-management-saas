import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity, ArrowRight, ArrowUpRight, Bell, BookOpenCheck, Building2, CalendarDays, CircleDollarSign,
  ClipboardList, FileText, GraduationCap, Heart, LayoutDashboard, Presentation, Receipt, ShieldCheck, Users
} from "../components/ui/icon/icons.jsx";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { get, queryString } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import { EmptyState, ErrorState, LoadingState, SkeletonCards, SkeletonRows } from "../components/feedback.jsx";
import usePrefersReducedMotion from "../utils/usePrefersReducedMotion.js";

const number = (value) => new Intl.NumberFormat().format(value || 0);
const money = (minor, currency = "USD") => {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format((minor || 0) / 100); }
  catch { return `${((minor || 0) / 100).toFixed(0)} ${currency}`; }
};
const total = (list = []) => list.reduce((sum, item) => sum + (item.count || 0), 0);
const monthKey = () => new Date().toISOString().slice(0, 7);
const greeting = () => { const hour = new Date().getHours(); return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"; };

/** Count a numeric headline value up once; reduced motion and non-numeric values render immediately. */
function useCountUp(target, enabled) {
  const [display, setDisplay] = useState(enabled ? 0 : (target || 0));

  useEffect(() => {
    if (!enabled || !Number.isFinite(target) || typeof requestAnimationFrame !== "function") {
      setDisplay(target || 0);
      return undefined;
    }
    let frame;
    let startedAt;
    const tick = (now) => {
      if (startedAt === undefined) startedAt = now;
      const progress = Math.min(1, (now - startedAt) / 600);
      setDisplay(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, enabled]);

  return display;
}

const QUICK_ACTIONS = {
  school_admin: [["Add a student", "/students", GraduationCap], ["Take attendance", "/attendance", ClipboardList], ["Fees & finance", "/finance", CircleDollarSign], ["Reports", "/reports", Activity]],
  principal: [["Students", "/students", GraduationCap], ["Take attendance", "/attendance", ClipboardList], ["Fees & finance", "/finance", CircleDollarSign], ["Reports", "/reports", Activity]],
  teacher: [["Take attendance", "/attendance", ClipboardList], ["Exams & results", "/exams", BookOpenCheck], ["School calendar", "/calendar", CalendarDays], ["Documents", "/documents", FileText]],
  parent: [["My children", "/my-children", GraduationCap], ["School calendar", "/calendar", CalendarDays], ["Notifications", "/notifications", Bell], ["Documents", "/documents", FileText]],
  platform_super_admin: [["Schools", "/platform", Users], ["Subscription plans", "/platform/plans", CircleDollarSign], ["Revenue", "/platform/revenue", Receipt], ["Audit log", "/platform/audit", Activity]]
};

export default function DashboardPage() {
  const { user, school } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [children, setChildren] = useState([]);
  const [teacherSchedule, setTeacherSchedule] = useState([]);

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      if (user.role === "parent") {
        setChildren(await get("/portal/parent/students"));
      } else if (user.role === "teacher") {
        const sessions = await get("/academics/sessions?status=active&limit=1");
        const active = sessions.items?.[0];
        const schedule = active ? (await get(`/academics/timetable${queryString({ academicSessionId: active._id, limit: 100 })}`)).items || [] : [];
        const attendance = await get(`/attendance/staff/me${queryString({ month: monthKey() })}`);
        setTeacherSchedule(schedule);
        setData({ attendance, session: active || null });
      } else if (user.role === "platform_super_admin") {
        const [schoolResult, planResult, revenue] = await Promise.all([
          get("/platform/schools?limit=100"),
          get("/platform/plans?includeInactive=false&limit=100"),
          get("/platform/reports/revenue")
        ]);
        setData({ schools: schoolResult.items || [], plans: planResult.items || [], revenue });
      } else {
        setData(await get("/reports/dashboard"));
      }
    } catch (reason) {
      setError(reason.message || "Dashboard data is unavailable.");
    } finally { setBusy(false); }
  }, [user.role]);

  useEffect(() => { load(); }, [load]);

  const isParent = user.role === "parent";
  const isPlatform = user.role === "platform_super_admin";
  const introTitle = isParent ? `Welcome, ${user.name.split(" ")[0]}` : `Good ${greeting()}, ${user.name.split(" ")[0]}`;

  if (busy) return <><PageIntro title={introTitle} subtitle={school?.name || "Your SchoolFlow workspace"} /><SkeletonCards count={user?.role === "parent" ? 2 : 4} /><section className="content-card"><SkeletonRows rows={4} /></section></>;
  if (error) return <><PageIntro title={introTitle} subtitle={school?.name || "Your SchoolFlow workspace"} /><ErrorState error={{ message: error }} onRetry={load} /></>;

  if (isParent) return <ParentDashboard user={user} school={school} children={children} navigate={navigate} />;
  if (isPlatform) return <PlatformDashboard data={data} navigate={navigate} />;
  if (user.role === "teacher") return <TeacherDashboard user={user} data={data} schedule={teacherSchedule} navigate={navigate} />;
  return <SchoolDashboard user={user} school={school} data={data} navigate={navigate} />;
}

function ParentDashboard({ user, school, children, navigate }) {
  return <div className="dashboard-page layout-parent">
    <PageIntro title={`Welcome, ${user.name.split(" ")[0]}`} subtitle="A clear view of your family’s school life." eyebrow="FAMILY WORKSPACE" icon={Heart} />
    <div className="metric-grid metric-grid--dashboard">
      <Metric icon={GraduationCap} label="Linked students" value={number(children.length)} count={children.length} format={number} detail={children.length === 1 ? "1 child linked to your account" : "Children linked to your account"} tone="blue" featured />
      <Metric icon={BookOpenCheck} label="School" value={school?.name || "—"} detail="Your verified school workspace" tone="violet" />
    </div>
    <section className="content-card section-card panel-card">
      <SectionHeading title="Your children" subtitle="Attendance, fees, and published results are available in each student record." />
      {children.length ? <div className="child-grid">{children.map((child) => <button type="button" className="child-card child-card--panel" key={child.id} onClick={() => navigate("/my-children")}>
        <span className="student-avatar" aria-hidden="true">{child.firstName?.[0]}{child.lastName?.[0]}</span>
        <div><strong>{child.firstName} {child.lastName}</strong><small>{child.className || "Student"} · {child.admissionNumber}</small></div>
        <span className={`badge badge-${child.status}`}>{child.status}</span>
      </button>)}</div> : <EmptyState title="No linked students yet" detail="Ask your school administrator to link your parent account to a student guardian record." />}
    </section>
    <QuickActions role="parent" navigate={navigate} />
  </div>;
}

function PlatformDashboard({ data, navigate }) {
  const schools = data?.schools || [];
  const plans = data?.plans || [];
  const totals = data?.revenue?.totals || [];
  const primary = totals[0];
  const activeSchools = schools.filter((item) => item.status === "active").length;
  return <div className="dashboard-page layout-platform">
    <PageIntro title="Platform overview" subtitle="Manage the SchoolFlow subscription catalog and school accounts." eyebrow="PLATFORM CONTROL CENTER" icon={Building2} action={<button className="button button-primary" onClick={() => navigate("/platform")}>Manage schools <ArrowUpRight size={16} aria-hidden="true" /></button>} />
    <div className="metric-grid metric-grid--dashboard">
      <Metric icon={Users} label="Customer schools" value={number(schools.length)} count={schools.length} format={number} detail="Registered school workspaces" tone="blue" />
      <Metric icon={ShieldCheck} label="Active schools" value={number(activeSchools)} count={activeSchools} format={number} detail="Workspaces with active access" tone="green" />
      <Metric icon={CircleDollarSign} label="Active plans" value={number(plans.length)} count={plans.length} format={number} detail="Plans available to assign" tone="violet" />
      <Metric icon={Receipt} label="Gross revenue" value={primary ? money(primary.grossMinor, primary.currency) : money(0, "USD")} count={primary?.grossMinor || 0} format={(amount) => money(amount, primary?.currency || "USD")} detail={primary ? `${number(primary.payments)} paid payments` : "No paid payments recorded yet"} tone="amber" featured />
    </div>
    <div className="platform-content">
      <section className="content-card table-card">
        <div className="table-toolbar"><div><strong>Customer schools</strong><span>{schools.length} record{schools.length === 1 ? "" : "s"}</span></div>{schools.length > 0 && <button className="button button-outline button-small" onClick={() => navigate("/platform")}>View all</button>}</div>
        {schools.length ? <div className="table-scroll"><table><thead><tr><th>School</th><th>Workspace URL</th><th>Status</th><th>Plan</th></tr></thead>
          <tbody>{schools.slice(0, 6).map((item) => <tr key={item._id}><td><strong>{item.name}</strong></td><td>{item.slug}</td><td><span className={`badge badge-${item.status}`}>{item.status}</span></td><td>{item.subscription?.plan || item.subscription?.status || "Unassigned"}</td></tr>)}</tbody></table></div>
          : <EmptyState title="No customer schools yet" detail="Schools appear here once they complete onboarding." />}
      </section>
      <QuickActions role="platform_super_admin" navigate={navigate} variant="rail" />
    </div>
  </div>;
}

function TeacherDashboard({ user, data, schedule, navigate }) {
  const reduceMotion = usePrefersReducedMotion();
  const records = data?.attendance?.items || [];
  const summary = data?.attendance?.summary || {};
  const chartData = ["present", "late", "absent", "leave"]
    .filter((status) => records.length > 0 && Number.isFinite(summary[status]))
    .map((status) => ({ name: status[0].toUpperCase() + status.slice(1), days: summary[status] }));
  const sessionName = data?.session?.name || "Not set";
  return <div className="dashboard-page layout-teacher">
    <PageIntro title={`Good ${greeting()}, ${user.name.split(" ")[0]}`} subtitle="Your attendance and teaching schedule." eyebrow="TEACHING WORKSPACE" icon={ClipboardList} />
    <div className="metric-grid metric-grid--dashboard">
      <Metric icon={CalendarDays} label="Scheduled periods" value={number(schedule.length)} count={schedule.length} format={number} detail="Across your active session" tone="blue" featured />
      <Metric icon={ClipboardList} label="Present days" value={number(summary.present || 0)} count={summary.present || 0} format={number} detail={data?.attendance?.month || "Current month"} tone="green" />
      <Metric icon={Activity} label="Absent days" value={number(summary.absent || 0)} count={summary.absent || 0} format={number} detail={data?.attendance?.month || "Current month"} tone="amber" />
      <Metric icon={BookOpenCheck} label="Active session" value={sessionName} detail="Your current academic session" tone="violet" />
    </div>
    <div className="dashboard-grid dashboard-grid--panel">
      <section className="content-card summary-card panel-card">
        <SectionHeading title="This term’s timetable" subtitle="Schedule from your active academic session." />
        {schedule.length ? <TimetableTable rows={schedule} /> : <EmptyState title="No timetable available" detail="Your scheduled periods will appear here once the timetable is published." />}
      </section>
      <section className="content-card chart-card panel-card">
        <SectionHeading title="My staff attendance this month" subtitle={data?.attendance?.month || "Current month"} />
        <div className="chart-area chart-area--panel">{chartData.length ? <ResponsiveContainer width="100%" height={250}><BarChart data={chartData} barSize={32} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--line)" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} /><Tooltip cursor={{ fill: "var(--brand-soft)" }} /><Bar dataKey="days" fill="var(--brand)" radius={[7, 7, 2, 2]} isAnimationActive={!reduceMotion} /></BarChart></ResponsiveContainer> : <EmptyState title="No attendance records this month" detail="Your staff attendance will appear here after it is recorded." />}</div>
      </section>
    </div>
    <QuickActions role="teacher" navigate={navigate} />
  </div>;
}

function SchoolDashboard({ user, school, data, navigate }) {
  const reduceMotion = usePrefersReducedMotion();
  const isPrincipal = user.role === "principal";
  const attendance = data?.studentAttendanceToday || [];
  const chartData = attendance.map(({ status, count }) => ({ name: status[0].toUpperCase() + status.slice(1), students: count }));
  const students = total(data?.studentsByStatus);
  const staff = total(data?.staffByRoleAndStatus);
  const collections = data?.collectionsThisMonth || [];
  const overdue = data?.overdueBalances || [];
  const currency = collections[0]?.currency || overdue[0]?.currency || "USD";
  const collected = collections.filter((item) => item.currency === currency).reduce((sum, item) => sum + item.amountMinor, 0);
  const due = overdue.filter((item) => item.currency === currency).reduce((sum, item) => sum + item.balanceMinor, 0);
  const overdueVouchers = overdue.reduce((sum, item) => sum + item.vouchers, 0);

  const metrics = <div className="metric-grid metric-grid--dashboard">
    <Metric icon={GraduationCap} label="Students" value={number(students)} count={students} format={number} detail="Across all enrollment statuses" tone="blue" featured={isPrincipal} />
    <Metric icon={Users} label="Staff members" value={number(staff)} count={staff} format={number} detail="Active school team" tone="violet" />
    <Metric icon={CircleDollarSign} label="Collected this month" value={money(collected, currency)} count={collected} format={(amount) => money(amount, currency)} detail={`${number(collections.reduce((sum, item) => sum + item.payments, 0))} recorded payments`} tone="green" featured={!isPrincipal} />
    <Metric icon={Activity} label="Outstanding dues" value={money(due, currency)} count={due} format={(amount) => money(amount, currency)} detail={`${number(overdueVouchers)} overdue vouchers`} tone="amber" />
  </div>;

  const chart = <section className="content-card chart-card panel-card">
    <SectionHeading title="Attendance today" subtitle="Student attendance records by status" />
    <div className="chart-area chart-area--panel">{chartData.length ? <ResponsiveContainer width="100%" height={250}><BarChart data={chartData} barSize={32} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--line)" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} /><Tooltip cursor={{ fill: "var(--brand-soft)" }} /><Bar dataKey="students" fill="var(--brand)" radius={[7, 7, 2, 2]} isAnimationActive={!reduceMotion} /></BarChart></ResponsiveContainer> : <EmptyState title="No attendance records today" detail="Once teachers record attendance, the live summary will appear here." />}</div>
  </section>;

  const glance = <section className="content-card summary-card panel-card">
    <SectionHeading title="School at a glance" subtitle="Current academic operations" />
    <div className="summary-list summary-list--panel">
      <SummaryRow icon={BookOpenCheck} label="Academic session" value={data?.activeAcademicSession?.name || "Not set"} />
      <SummaryRow icon={CalendarDays} label="Scheduled exams" value={number(data?.scheduledExams)} />
      <SummaryRow icon={Activity} label="Attendance records" value={number(total(attendance))} />
      <SummaryRow icon={CircleDollarSign} label="Overdue vouchers" value={number(overdueVouchers)} />
    </div>
  </section>;

  if (isPrincipal) return <div className="dashboard-page layout-school layout-school--principal">
    <PageIntro title={`Good ${greeting()}, ${user.name.split(" ")[0]}`} subtitle={`Here’s what’s happening at ${school?.name || "your school"} today.`} eyebrow="PRINCIPAL WORKSPACE" icon={Presentation} action={<div className="as-of">Live school data <span className="live-dot" /></div>} />
    {metrics}
    <div className="dashboard-grid dashboard-grid--panel">
      {glance}
      <QuickActions role={user.role} navigate={navigate} variant="rail" />
    </div>
    {chart}
  </div>;

  return <div className="dashboard-page layout-school layout-school--admin">
    <PageIntro title={`Good ${greeting()}, ${user.name.split(" ")[0]}`} subtitle={`Here’s what’s happening at ${school?.name || "your school"} today.`} eyebrow="SCHOOL ADMIN WORKSPACE" icon={LayoutDashboard} action={<div className="as-of">Live school data <span className="live-dot" /></div>} />
    {metrics}
    <div className="dashboard-grid dashboard-grid--panel">
      {chart}
      {glance}
    </div>
    <QuickActions role={user.role} navigate={navigate} />
  </div>;
}

function PageIntro({ title, subtitle, action, eyebrow = "SCHOOLFLOW WORKSPACE", icon: Icon }) {
  return <div className="page-intro">
    <div className={Icon ? "dashboard-intro" : undefined}>
      {Icon && <span className="page-intro-mark" aria-hidden="true"><Icon size={21} /></span>}
      <div className={Icon ? "page-intro-copy" : undefined}>
        <div className="page-kicker">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p>
      </div>
    </div>
    {action && <div className="intro-action">{action}</div>}
  </div>;
}

function Metric({ icon: Icon, label, value, detail, tone, featured = false, count, format }) {
  const reduceMotion = usePrefersReducedMotion();
  const animated = !reduceMotion && Number.isFinite(count) && typeof format === "function";
  const current = useCountUp(count, animated);
  const shown = animated ? format(current) : value;
  return <article className={`metric-card metric-card--dashboard${featured ? " metric-card--feature" : ""}`}>
    <div className="metric-head"><div className={`metric-icon tone-${tone}`}><Icon size={19} aria-hidden="true" /></div><div className="metric-label">{label}</div></div>
    <strong className="metric-value">{animated ? <><span aria-hidden="true">{shown}</span><span className="sr-only">{value}</span></> : value}</strong>{detail && <div className="metric-detail">{detail}</div>}
  </article>;
}

function SectionHeading({ title, subtitle }) {
  return <div className="section-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><span className="heading-dot" aria-hidden="true" /></div>;
}

function SummaryRow({ icon: Icon, label, value }) {
  return <div className="summary-row summary-row--panel"><span className="summary-icon"><Icon size={16} aria-hidden="true" /></span><span>{label}</span><strong>{value}</strong></div>;
}

function QuickActions({ role, navigate, variant = "panel" }) {
  const actions = QUICK_ACTIONS[role] || [];
  if (!actions.length) return null;
  return <section className="content-card section-card">
    <SectionHeading title="Quick actions" subtitle="Jump straight to the tasks you use most." />
    <div className={`quick-grid quick-grid--panel${variant === "rail" ? " quick-grid--rail" : ""}`}>
      {actions.map(([label, to, Icon]) => <button type="button" className="quick-action quick-action--panel" key={to} onClick={() => navigate(to)}><Icon size={17} aria-hidden="true" /><span>{label}</span><ArrowRight size={15} aria-hidden="true" /></button>)}
    </div>
  </section>;
}

function TimetableTable({ rows }) {
  const dayNames = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return <div className="table-scroll"><table><thead><tr><th>Day</th><th>Period</th><th>Starts</th><th>Ends</th><th>Room</th></tr></thead>
    <tbody>{rows.map((row, index) => <tr key={row._id || index}><td><strong>{dayNames[Number(row.dayOfWeek)] || "—"}</strong></td><td>{row.periodNumber ?? "—"}</td><td>{row.startsAt || "—"}</td><td>{row.endsAt || "—"}</td><td>{row.room || "—"}</td></tr>)}</tbody></table></div>;
}
