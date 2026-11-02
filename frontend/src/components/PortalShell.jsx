import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Activity, Archive, Bell, BookOpen, CalendarDays, ChartNoAxesCombined,
  CircleDollarSign, GraduationCap, LayoutDashboard, LibraryBig, Menu, School, Boxes,
  Settings2, Shield, Users, X
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider.jsx";

const roleGroups = {
  platform_super_admin: [
    ["Platform", [["platform", "Overview", LayoutDashboard], ["platform/plans", "Plans", CircleDollarSign], ["platform/audit", "Audit log", Activity]]]
  ],
  school_admin: [
    ["Workspace", [["", "Overview", LayoutDashboard], ["students", "Students", GraduationCap], ["staff", "People", Users], ["academics", "Academics", BookOpen], ["attendance", "Attendance", Activity]]],
    ["School operations", [["finance", "Fees & finance", CircleDollarSign], ["exams", "Exams & results", ChartNoAxesCombined], ["inventory", "Inventory", Archive], ["assets", "Fixed assets", Boxes], ["library", "Library", LibraryBig], ["calendar", "Calendar", CalendarDays], ["announcements", "Announcements", Bell], ["reports", "Reports", ChartNoAxesCombined]]],
    ["Administration", [["subscriptions", "Subscription", Shield], ["school", "School profile", Settings2], ["audit", "Audit log", Activity]]]
  ],
  principal: [
    ["Workspace", [["", "Overview", LayoutDashboard], ["students", "Students", GraduationCap], ["staff", "People", Users], ["academics", "Academics", BookOpen], ["attendance", "Attendance", Activity]]],
    ["School operations", [["finance", "Fees & finance", CircleDollarSign], ["exams", "Exams & results", ChartNoAxesCombined], ["inventory", "Inventory", Archive], ["assets", "Fixed assets", Boxes], ["library", "Library", LibraryBig], ["calendar", "Calendar", CalendarDays], ["announcements", "Announcements", Bell], ["reports", "Reports", ChartNoAxesCombined]]],
    ["Administration", [["audit", "Audit log", Activity]]]
  ],
  teacher: [
    ["My classroom", [["", "Overview", LayoutDashboard], ["attendance", "Attendance", Activity], ["academics", "Timetable", BookOpen], ["exams", "Exams & results", ChartNoAxesCombined], ["calendar", "Calendar", CalendarDays], ["announcements", "Announcements", Bell]]]
  ],
  parent: [
    ["Family", [["", "Overview", LayoutDashboard], ["my-children", "My children", GraduationCap], ["calendar", "School calendar", CalendarDays], ["announcements", "Announcements", Bell]]]
  ]
};

const roleName = (role) => ({
  platform_super_admin: "Platform admin",
  school_admin: "School administrator",
  principal: "Principal",
  teacher: "Teacher",
  parent: "Parent"
}[role] || "School member");

export default function PortalShell() {
  const { user, school, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const groups = roleGroups[user?.role] || [];

  const logout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
      <div className="brand"><span className="brand-mark"><School size={19} /></span><span>school<span className="brand-light">flow</span></span><button className="sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Close navigation"><X size={20} /></button></div>
      <div className="school-switcher" aria-label={school?.name || "Platform workspace"}><div className="school-avatar" aria-hidden="true">{school?.name?.slice(0, 1) || "S"}</div><div className="school-label"><strong>{school?.name || "SchoolFlow"}</strong><span>{school ? school.subscription?.plan || "School workspace" : "Platform workspace"}</span></div></div>
      <nav className="sidebar-nav" aria-label="Main navigation">
        {groups.map(([group, links]) => <section key={group} className="nav-group">
          <div className="nav-group-title">{group}</div>
          {links.map(([to, label, Icon]) => <NavLink key={to} to={`/${to}`} end={to === ""} onClick={() => setMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`}><Icon size={18} /><span>{label}</span></NavLink>)}
        </section>)}
      </nav>
      <div className="sidebar-footer"><div className="help-card"><div className="help-dot" /><strong>Workspace status</strong><span>{school?.status || "Platform access"}</span></div><div className="profile-block"><span className="profile-avatar" aria-hidden="true">{user?.name?.slice(0, 1) || "U"}</span><span className="profile-copy"><strong>{user?.name}</strong><small>{roleName(user?.role)}</small></span></div><button className="profile-signout" onClick={logout}>Sign out</button></div>
    </aside>
    {menuOpen && <button className="mobile-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation overlay" />}
    <main className="main-area">
      <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu size={21} /></button><div className="breadcrumbs"><span>{school?.name || "SchoolFlow"}</span><span className="crumb-slash">/</span><strong>{roleName(user?.role)}</strong></div><div className="topbar-actions"><span className="status-pill">{school?.status || roleName(user?.role)}</span><span className="topbar-avatar" aria-hidden="true">{user?.name?.slice(0, 1) || "U"}</span></div></header>
      <div className="page-frame"><Outlet /></div>
    </main>
  </div>;
}
