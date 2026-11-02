import { Routes, Route, Navigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import Login from "@/pages/Login";
import LandingPage from "@/pages/LandingPage";
import TermsAndConditions from "@/pages/TermsAndConditions";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import AdminDashboard from "@/pages/AdminDashboard";
import BranchDashboard from "@/pages/BranchDashboard";
import TicketList from "@/pages/TicketList";
import TicketDetail from "@/pages/TicketDetail";
import CreateTicket from "@/pages/CreateTicket";
import StatusManagement from "@/pages/StatusManagement";
import CategoryManagement from "@/pages/CategoryManagement";
import SettingsPage from "@/pages/SettingsPage";
import AuditLogPage from "@/pages/AuditLogPage";
import ReportsPage from "@/pages/ReportsPage";
import StationaryAdmin from "@/pages/StationaryAdmin";
import StationaryPortal from "@/pages/StationaryPortal";
import BranchesPage from "@/pages/BranchesPage";
import ClusterManagement from "@/pages/ClusterManagement";
import ClusterDashboard from "@/pages/ClusterDashboard";
import ClusterOrders from "@/pages/ClusterOrders";
import ClusterBranchTickets from "@/pages/ClusterBranchTickets";
import TicketFormConfig from "@/pages/TicketFormConfig";
import RolesManagement from "@/pages/RolesManagement";
import EmailConnectPage from "@/pages/EmailConnectPage";
import AdminUsersPage from "@/pages/AdminUsersPage";
import TicketAccess from "@/pages/TicketAccess";
import TransferUsersPage from "@/pages/TransferUsersPage";
import TransferAccept from "@/pages/TransferAccept";
import MonitorDashboard from "@/pages/MonitorDashboard";
import AllUsersPage from "@/pages/AllUsersPage";
import NotFound from "@/pages/NotFound";
import type { PermissionKey } from "@/lib/permissions";

function ProtectedRoute({
  children,
  requireAdmin = false,
  requireMainAdmin = false,
  requireStationaryAdmin = false,
  requireCanRaise = false,
  requirePermission,
  blockTransfer = false,
}: {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireMainAdmin?: boolean;
  requireStationaryAdmin?: boolean;
  requireCanRaise?: boolean;
  requirePermission?: PermissionKey;
  blockTransfer?: boolean;
}) {
  const { user, isLoading, hasPermission } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (blockTransfer && user.type === "transfer") {
    return <Navigate to="/" replace />;
  }

  if (requirePermission && !hasPermission(requirePermission)) {
    return <Navigate to="/" replace />;
  }

  if (requireStationaryAdmin) {
    const isMainAdminUser = user.type === "admin" && !user.adminRole;
    const isStationaryAdminUser = user.type === "admin" && (user as any).adminRole === "Stationary Admin";
    const isTransferWithAccess = user.type === "transfer" && (user as any).stationaryAccess;
    if (!isMainAdminUser && !isStationaryAdminUser && !isTransferWithAccess) return <Navigate to="/" replace />;
  } else if (requireCanRaise) {
    if (!(user as any).canRaiseTicket) return <Navigate to="/" replace />;
  } else if (requireMainAdmin) {
    if (user.type !== "admin" || user.adminRole) {
      return <Navigate to="/" replace />;
    }
  } else if (requireAdmin && user.type !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <AppLayout>{children}</AppLayout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/terms" element={<TermsAndConditions />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/" element={<HomeRoute />} />
      <Route
        path="/tickets"
        element={
          <ProtectedRoute>
            <TicketList />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tickets/new"
        element={
          <ProtectedRoute requirePermission="raise_ticket">
            <CreateTicket />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tickets/:id"
        element={
          <ProtectedRoute>
            <TicketDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/statuses"
        element={
          <ProtectedRoute requirePermission="manage_settings">
            <StatusManagement />
          </ProtectedRoute>
        }
      />
      <Route
        path="/categories"
        element={
          <ProtectedRoute requirePermission="manage_settings">
            <CategoryManagement />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute requirePermission="manage_settings">
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/audit-log"
        element={
          <ProtectedRoute requirePermission="audit_log">
            <AuditLogPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ticket-access"
        element={
          <ProtectedRoute requireMainAdmin>
            <TicketAccess />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute requirePermission="reports">
            <ReportsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/stationary/admin"
        element={
          <ProtectedRoute requirePermission="stationary_admin">
            <StationaryAdmin />
          </ProtectedRoute>
        }
      />
      <Route
        path="/stationary"
        element={
          <ProtectedRoute requirePermission="stationary_order">
            <StationaryPortal />
          </ProtectedRoute>
        }
      />
      <Route
        path="/branches"
        element={
          <ProtectedRoute requirePermission="manage_departments">
            <BranchesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ticket-form-config"
        element={
          <ProtectedRoute requirePermission="manage_settings">
            <TicketFormConfig />
          </ProtectedRoute>
        }
      />
      <Route
        path="/roles"
        element={
          <ProtectedRoute requirePermission="manage_departments">
            <RolesManagement />
          </ProtectedRoute>
        }
      />
      <Route
        path="/clusters"
        element={
          <ProtectedRoute requirePermission="manage_departments">
            <ClusterManagement />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin-users"
        element={
          <ProtectedRoute requireMainAdmin>
            <AdminUsersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute requirePermission="manage_users">
            <AllUsersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/transfer-users"
        element={
          <ProtectedRoute requireAdmin>
            <TransferUsersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/cluster/orders"
        element={
          <ProtectedRoute>
            <ClusterOrders />
          </ProtectedRoute>
        }
      />
      <Route
        path="/cluster/branch-tickets"
        element={
          <ProtectedRoute>
            <ClusterBranchTickets />
          </ProtectedRoute>
        }
      />
      <Route
        path="/email-settings"
        element={
          <ProtectedRoute>
            <EmailConnectPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/monitor"
        element={
          <ProtectedRoute>
            <MonitorDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/:token"
        element={<TransferAccept />}
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function HomeRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600" />
      </div>
    );
  }
  if (!user) return <LandingPage />;
  return (
    <ProtectedRoute>
      <RoleBasedDashboard />
    </ProtectedRoute>
  );
}

function RoleBasedDashboard() {
  const { user } = useAuth();
  if (user?.type === "admin") {
    if ((user as any).adminRole === "Stationary Admin") {
      return <StationaryAdmin />;
    }
    return <AdminDashboard />;
  }
  if (user?.type === "cluster") return <ClusterDashboard />;
  if (user?.type === "transfer") {
    if ((user as any).monitorRole) return <MonitorDashboard />;
    return <TicketList />;
  }
  return <BranchDashboard />;
}
