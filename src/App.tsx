import { Routes, Route, Navigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import Login from "@/pages/Login";
import AdminDashboard from "@/pages/AdminDashboard";
import BranchDashboard from "@/pages/BranchDashboard";
import TicketList from "@/pages/TicketList";
import TicketDetail from "@/pages/TicketDetail";
import CreateTicket from "@/pages/CreateTicket";
import UserManagement from "@/pages/UserManagement";
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
import EmailConnectPage from "@/pages/EmailConnectPage";
import NotFound from "@/pages/NotFound";

function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && user.type !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <AppLayout>{children}</AppLayout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <RoleBasedDashboard />
          </ProtectedRoute>
        }
      />
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
        path="/users"
        element={
          <ProtectedRoute requireAdmin>
            <UserManagement />
          </ProtectedRoute>
        }
      />
      <Route
        path="/statuses"
        element={
          <ProtectedRoute requireAdmin>
            <StatusManagement />
          </ProtectedRoute>
        }
      />
      <Route
        path="/categories"
        element={
          <ProtectedRoute requireAdmin>
            <CategoryManagement />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute requireAdmin>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/audit-log"
        element={
          <ProtectedRoute requireAdmin>
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
          <ProtectedRoute requireAdmin>
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
          <ProtectedRoute requireAdmin>
            <BranchesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ticket-form-config"
        element={
          <ProtectedRoute requireAdmin>
            <TicketFormConfig />
          </ProtectedRoute>
        }
      />
      <Route
        path="/clusters"
        element={
          <ProtectedRoute requireAdmin>
            <ClusterManagement />
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
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function RoleBasedDashboard() {
  const { user } = useAuth();
  if (user?.type === "admin") return <AdminDashboard />;
  if (user?.type === "cluster") return <ClusterDashboard />;
  return <BranchDashboard />;
}
