import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider.jsx";
import PortalShell from "./components/PortalShell.jsx";
import { LoadingState } from "./components/feedback.jsx";
const AuthPage = lazy(() => import("./pages/AuthPage.jsx"));
const DashboardPage = lazy(() => import("./pages/DashboardPage.jsx"));
const WorkspacePage = lazy(() => import("./pages/WorkspacePage.jsx"));
const FixedAssetsPage = lazy(() => import("./pages/FixedAssetsPage.jsx"));

function Protected({ children, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="auth-loading"><LoadingState /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function Guest({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="auth-loading"><LoadingState /></div>;
  return user ? <Navigate to="/" replace /> : children;
}

const adminRoles = ["school_admin", "principal"];
const staffRoles = ["school_admin"];
const classRoles = ["school_admin", "principal", "teacher"];
const allSchoolRoles = ["school_admin", "principal", "teacher", "parent"];

function WorkspaceRoute({ page, roles = adminRoles }) {
  return <Protected roles={roles}><WorkspacePage page={page} /></Protected>;
}

export default function App() {
  return <Suspense fallback={<div className="auth-loading"><LoadingState /></div>}><Routes>
    <Route path="/login" element={<Guest><AuthPage mode="login" /></Guest>} />
    <Route path="/register" element={<Guest><AuthPage mode="register" /></Guest>} />
    <Route path="/forgot-password" element={<Guest><AuthPage mode="recovery" /></Guest>} />
    <Route path="/reset-password" element={<Guest><AuthPage mode="reset" /></Guest>} />
    <Route element={<Protected><PortalShell /></Protected>}>
      <Route index element={<DashboardPage />} />
      <Route path="students" element={<WorkspaceRoute page="students" />} />
      <Route path="staff" element={<WorkspaceRoute page="staff" roles={staffRoles} />} />
      <Route path="academics" element={<WorkspaceRoute page="academics" roles={classRoles} />} />
      <Route path="attendance" element={<WorkspaceRoute page="attendance" roles={classRoles} />} />
      <Route path="finance" element={<WorkspaceRoute page="finance" />} />
      <Route path="exams" element={<WorkspaceRoute page="exams" roles={classRoles} />} />
      <Route path="inventory" element={<WorkspaceRoute page="inventory" />} />
      <Route path="assets" element={<Protected roles={adminRoles}><FixedAssetsPage /></Protected>} />
      <Route path="library" element={<WorkspaceRoute page="library" />} />
      <Route path="calendar" element={<WorkspaceRoute page="calendar" roles={allSchoolRoles} />} />
      <Route path="announcements" element={<WorkspaceRoute page="announcements" roles={allSchoolRoles} />} />
      <Route path="reports" element={<WorkspaceRoute page="reports" />} />
      <Route path="audit" element={<WorkspaceRoute page="audit" roles={staffRoles} />} />
      <Route path="subscriptions" element={<WorkspaceRoute page="subscriptions" />} />
      <Route path="school" element={<WorkspaceRoute page="school" />} />
      <Route path="my-children" element={<WorkspaceRoute page="my-children" roles={["parent"]} />} />
      <Route path="platform" element={<WorkspaceRoute page="platform" roles={["platform_super_admin"]} />} />
      <Route path="platform/plans" element={<WorkspaceRoute page="platform/plans" roles={["platform_super_admin"]} />} />
      <Route path="platform/audit" element={<WorkspaceRoute page="platform/audit" roles={["platform_super_admin"]} />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></Suspense>;
}
