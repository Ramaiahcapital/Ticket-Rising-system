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
import TicketFormConfig from "@/pages/TicketFormConfig";
import RolesManagement from "@/pages/RolesManagement";
import EmailConnectPage from "@/pages/EmailConnectPage";
import AdminUsersPage from "@/pages/AdminUsersPage";
import TransferUsersPage from "@/pages/TransferUsersPage";
import TransferAccept from "@/pages/TransferAccept";
import NotFound from "@/pages/NotFound";

function ProtectedRoute({ children, requireAdmin = false, requireMainAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean; requireMainAdmin?: boolean }) {
  const { user, isLoading } = useAuth();

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

  if (requireMainAdmin) {
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
          <ProtectedRoute>
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
          <ProtectedRoute requireMainAdmin>
            <StatusManagement />
          </ProtectedRoute>
        }
      />
      <Route
        path="/categories"
        element={
          <ProtectedRoute requireMainAdmin>
            <CategoryManagement />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute requireMainAdmin>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/audit-log"
        element={
          <ProtectedRoute requireMainAdmin>
            <AuditLogPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute requireAdmin>
            <ReportsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/stationary/admin"
        element={
          <ProtectedRoute requireMainAdmin>
            <StationaryAdmin />
          </ProtectedRoute>
        }
      />
      <Route
        path="/stationary"
        element={
          <ProtectedRoute>
            <StationaryPortal />
          </ProtectedRoute>
        }
      />
      <Route
        path="/branches"
        element={
          <ProtectedRoute requireMainAdmin>
            <BranchesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ticket-form-config"
        element={
          <ProtectedRoute requireMainAdmin>
            <TicketFormConfig />
          </ProtectedRoute>
        }
      />
      <Route
        path="/roles"
        element={
          <ProtectedRoute requireMainAdmin>
            <RolesManagement />
          </ProtectedRoute>
        }
      />
      <Route
        path="/clusters"
        element={
          <ProtectedRoute requireMainAdmin>
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
        path="/email-settings"
        element={
          <ProtectedRoute>
            <EmailConnectPage />
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
  if (user?.type === "admin") return <AdminDashboard />;
  if (user?.type === "cluster") return <ClusterDashboard />;
  return <BranchDashboard />;
}
