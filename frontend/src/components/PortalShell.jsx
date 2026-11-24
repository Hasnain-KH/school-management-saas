import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity, Archive, Bell, BellRing, BookOpen, CalendarDays, ChartNoAxesCombined,
  CircleDollarSign, FileText, GraduationCap, Image, LayoutDashboard, LibraryBig, LogOut, Menu, PanelLeftClose,
  Receipt, Boxes, Settings2, Shield, ShieldCheck, Users, X
} from "./ui/icon/icons.jsx";
import { useAuth } from "../auth/AuthProvider.jsx";
import NotificationBell from "./NotificationBell.jsx";
import SchoolLogo from "./SchoolLogo.jsx";
import { notify } from "../components/feedback/appFeedback.js";
import { confirmUnsavedNavigation } from "../components/feedback/unsavedChanges.js";

const roleGroups = {
  platform_super_admin: [
    ["Platform", [["platform", "Overview", LayoutDashboard], ["platform/plans", "Plans", CircleDollarSign], ["platform/revenue", "Revenue", Receipt], ["platform/audit", "Audit log", Activity]]]
  ],
  school_admin: [
    ["Workspace", [["", "Overview", LayoutDashboard], ["students", "Students", GraduationCap], ["staff", "People", Users], ["academics", "Academics", BookOpen], ["attendance", "Attendance", Activity]]],
    ["School operations", [["finance", "Fees & finance", CircleDollarSign], ["exams", "Exams & results", ChartNoAxesCombined], ["inventory", "Inventory", Archive], ["assets", "Fixed assets", Boxes], ["library", "Library", LibraryBig], ["calendar", "Calendar", CalendarDays], ["announcements", "Announcements", Bell], ["notifications", "Notifications", BellRing], ["documents", "Documents", FileText], ["student-media/review", "Media review", ShieldCheck], ["student-media/usage", "Media usage", ChartNoAxesCombined], ["reports", "Reports", ChartNoAxesCombined]]],
    ["Administration", [["subscriptions", "Subscription", Shield], ["billing", "Billing history", Receipt], ["school", "School profile", Settings2], ["audit", "Audit log", Activity]]]
  ],
  principal: [
    ["Workspace", [["", "Overview", LayoutDashboard], ["students", "Students", GraduationCap], ["academics", "Academics", BookOpen], ["attendance", "Attendance", Activity]]],
    ["School operations", [["finance", "Fees & finance", CircleDollarSign], ["exams", "Exams & results", ChartNoAxesCombined], ["inventory", "Inventory", Archive], ["assets", "Fixed assets", Boxes], ["library", "Library", LibraryBig], ["calendar", "Calendar", CalendarDays], ["announcements", "Announcements", Bell], ["notifications", "Notifications", BellRing], ["documents", "Documents", FileText], ["student-media/review", "Media review", ShieldCheck], ["student-media/usage", "Media usage", ChartNoAxesCombined], ["reports", "Reports", ChartNoAxesCombined]]]
  ],
  teacher: [
    ["My classroom", [["", "Overview", LayoutDashboard], ["attendance", "Attendance", Activity], ["academics", "Timetable", BookOpen], ["exams", "Exams & results", ChartNoAxesCombined], ["calendar", "Calendar", CalendarDays], ["announcements", "Announcements", Bell], ["notifications", "Notifications", BellRing], ["documents", "Documents", FileText], ["student-media", "Student media", Image]]]
  ],
  parent: [
    ["Family", [["", "Overview", LayoutDashboard], ["my-children", "My children", GraduationCap], ["moments", "Moments & progress", Image], ["calendar", "School calendar", CalendarDays], ["announcements", "Announcements", Bell], ["notifications", "Notifications", BellRing], ["documents", "Documents", FileText]]]
  ]
};

const roleName = (role) => ({
  platform_super_admin: "Platform admin",
  school_admin: "School administrator",
  principal: "Principal",
  teacher: "Teacher",
  parent: "Parent"
}[role] || "School member");

const accountLinks = (role) => {
  if (role === "platform_super_admin") return [["Revenue", "/platform/revenue", Receipt]];
  const links = [];
  if (["school_admin", "principal"].includes(role)) links.push(["School profile", "/school", Settings2]);
  links.push(["Notifications", "/notifications", BellRing]);
  return links;
};

const COLLAPSE_KEY = "schoolflow.sidebar.collapsed";

export default function PortalShell() {
  const { user, school, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.localStorage.getItem(COLLAPSE_KEY) === "true"; } catch { return false; }
  });
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef(null);
  const accountButtonRef = useRef(null);
  const accountMenuRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const groups = roleGroups[user?.role] || [];
  const userInitial = user?.name?.slice(0, 1)?.toUpperCase() || "U";

  const currentLabel = useMemo(() => {
    const path = location.pathname.replace(/^\//, "");
    for (const [, links] of groups) {
      const match = links.find(([to]) => to === path);
      if (match) return match[1];
    }
    return "Overview";
  }, [groups, location.pathname]);

  useEffect(() => {
    try { window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "true" : "false"); } catch { /* storage may be unavailable */ }
  }, [collapsed]);

  // NavLink clicks close the mobile menu immediately. Do not also close it in a
  // passive route effect: under load that effect can run after the user has
  // reopened the menu for the next navigation, leaving the links off-screen.
  useEffect(() => { setAccountOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!accountOpen) return;
    const onPointer = (event) => { if (accountRef.current && !accountRef.current.contains(event.target)) setAccountOpen(false); };
    const onKey = (event) => {
      if (event.key === "Escape") {
        setAccountOpen(false);
        accountButtonRef.current?.focus();
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const items = [...(accountMenuRef.current?.querySelectorAll('[role="menuitem"]') || [])];
        if (!items.length) return;
        event.preventDefault();
        const index = items.indexOf(document.activeElement);
        const next = event.key === "ArrowDown"
          ? (index + 1) % items.length
          : (index <= 0 ? items.length - 1 : index - 1);
        items[next].focus();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    accountMenuRef.current?.querySelector('[role="menuitem"]')?.focus();
    return () => { document.removeEventListener("mousedown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [accountOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const logout = async () => {
    try {
      await signOut();
      notify.success("Signed out successfully");
    } catch (error) {
      notify.error(error, { title: "Sign out failed", fallback: "You were signed out locally. Please sign in again." });
    } finally {
      navigate("/login", { replace: true });
    }
  };

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""} ${collapsed ? "sidebar-collapsed" : ""}`}>
      <div className="brand">
        <SchoolLogo className="brand-mark" size={19} />
        <span>school<span className="brand-light">flow</span></span>
        <button type="button" className="sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Close navigation"><X size={20} aria-hidden="true" /></button>
        <button type="button" className="sidebar-collapse" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} aria-pressed={collapsed} title={collapsed ? "Expand navigation" : "Collapse navigation"}><PanelLeftClose size={17} aria-hidden="true" /></button>
      </div>
      <div className="school-switcher" role="group" aria-label={school?.name || "Platform workspace"}>
        <SchoolLogo className="school-avatar" size={20} fallback={school?.name?.slice(0, 1) || "S"} />
        <div className="school-label"><strong>{school?.name || "SchoolFlow"}</strong><span>{school ? school.subscription?.plan || "School workspace" : "Platform workspace"}</span></div>
      </div>
      <nav className="sidebar-nav" aria-label="Main navigation">
        {groups.map(([group, links]) => <section key={group} className="nav-group" role="group" aria-label={group}>
          <div className="nav-group-title" aria-hidden="true">{group}</div>
          {links.map(([to, label, Icon]) => <NavLink key={to} to={`/${to}`} end={to === ""} onClick={(event) => {
            if (!confirmUnsavedNavigation()) { event.preventDefault(); return; }
            setMenuOpen(false);
          }} data-label={label} data-unsaved-guarded="true" title={collapsed ? label : undefined} className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`}><Icon size={18} aria-hidden="true" /><span>{label}</span></NavLink>)}
        </section>)}
      </nav>
      <div className="sidebar-footer">
        <div className="help-card"><div className="help-dot" /><strong>Workspace status</strong><span>{school?.status || "Platform access"}</span></div>
        <div className="profile-block"><span className="profile-avatar" aria-hidden="true"><SchoolLogo size={16} fallback={userInitial} /></span><span className="profile-copy"><strong>{user?.name}</strong><small>{roleName(user?.role)}</small></span></div>
        <button type="button" className="profile-signout" onClick={logout}><LogOut size={16} aria-hidden="true" /><span>Sign out</span></button>
      </div>
    </aside>
    {menuOpen && <button type="button" className="mobile-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation overlay" />}
    <main id="main-content" tabIndex={-1} className={`main-area ${collapsed ? "main-area-wide" : ""}`}>
      <header className="topbar">
        <button type="button" className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation" aria-expanded={menuOpen}><Menu size={21} aria-hidden="true" /></button>
        <div className="breadcrumbs"><span>{school?.name || "SchoolFlow"}</span><span className="crumb-slash">/</span><strong>{currentLabel}</strong></div>
        <div className="topbar-actions">
          {user?.role !== "platform_super_admin" && <NotificationBell />}
          <span className="status-pill">{school?.status || roleName(user?.role)}</span>
          <div className="account" ref={accountRef}>
            <button ref={accountButtonRef} type="button" className="topbar-avatar" onClick={() => setAccountOpen((value) => !value)} aria-haspopup="menu" aria-expanded={accountOpen} aria-controls="account-menu" aria-label="Account menu"><SchoolLogo size={16} fallback={userInitial} /></button>
            {accountOpen && <div id="account-menu" ref={accountMenuRef} className="account-menu" role="menu" aria-label="Account menu">
              <header><strong>{user?.name}</strong><small>{roleName(user?.role)}{school?.name ? ` · ${school.name}` : ""}</small></header>
              {accountLinks(user?.role).map(([label, to, Icon]) => <button type="button" key={to} className="menu-item" role="menuitem" onClick={() => { if (!confirmUnsavedNavigation()) return; navigate(to); }}><Icon size={16} aria-hidden="true" />{label}</button>)}
              <div className="menu-sep" />
              <button type="button" className="menu-item menu-item-danger" role="menuitem" onClick={logout}><LogOut size={16} aria-hidden="true" />Sign out</button>
            </div>}
          </div>
        </div>
      </header>
      <div className="page-frame" key={location.pathname}><Outlet /></div>
    </main>
  </div>;
}
