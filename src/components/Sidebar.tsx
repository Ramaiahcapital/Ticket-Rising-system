import { useState } from "react";
import { useNavigate, useLocation } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  LayoutDashboard,
  Ticket,
  Users,
  Settings,
  ClipboardList,
  BarChart3,
  Tags,
  LogOut,
  X,
  ChevronDown,
  Package,
  Building2,
  Layers,
  Mail,
  User,
} from "lucide-react";

interface SidebarProps {
  isAdmin: boolean;
  mobile: boolean;
  onClose: () => void;
}

type NavItem = { label: string; icon: React.ComponentType<{ className?: string }>; path: string };

const branchNavItems: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/" },
  { label: "My Tickets", icon: Ticket, path: "/tickets" },
  { label: "Create Ticket", icon: Ticket, path: "/tickets/new" },
  { label: "Stationary", icon: Package, path: "/stationary" },
  { label: "Email Settings", icon: Mail, path: "/email-settings" },
];

const clusterNavItems: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/" },
  { label: "Orders", icon: Package, path: "/cluster/orders" },
  { label: "Email Settings", icon: Mail, path: "/email-settings" },
];

const settingsChildren: NavItem[] = [
  { label: "Ticket Settings", icon: Settings, path: "/settings" },
  { label: "Ticket Form", icon: ClipboardList, path: "/ticket-form-config" },
  { label: "Branches", icon: Building2, path: "/branches" },
  { label: "Clusters", icon: Layers, path: "/clusters" },
  { label: "Status Management", icon: Tags, path: "/statuses" },
  { label: "Stationary", icon: Package, path: "/stationary/admin" },
];

export default function Sidebar({ isAdmin, mobile, onClose }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user, isCluster } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(
    location.pathname === "/settings" ||
      location.pathname === "/statuses" ||
      location.pathname === "/categories" ||
      location.pathname === "/ticket-form-config" ||
      location.pathname === "/stationary/admin" ||
      location.pathname === "/clusters"
  );

  const isSettingsChild = settingsChildren.some((c) => c.path === location.pathname);

  const go = (path: string) => {
    navigate(path);
    if (mobile) onClose();
  };

  return (
    <aside
      className={`bg-white border-r border-gray-200 flex flex-col h-full ${
        mobile ? "w-[260px]" : "w-[260px]"
      }`}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Ramaiah Capital"
            className="h-8 w-8 rounded-lg object-contain"
            onError={(e) => {
              const el = e.currentTarget;
              if (el.src.endsWith("/logo.png")) {
                el.src = "/logo.jpg";
              } else if (el.src.endsWith("/logo.jpg")) {
                el.src = "/logo.webp";
              } else if (el.src.endsWith("/logo.webp")) {
                el.src = "/logo.svg";
              }
            }}
          />
          <div className="flex flex-col">
            <span className="text-sm font-bold text-gray-800 leading-tight">Ramaiah Capital</span>
            <span className="text-[10px] text-gray-500 leading-tight">Ticket Management</span>
          </div>
        </div>
        {mobile && (
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-auto">
        {isAdmin ? (
          <>
            <button onClick={() => go("/")} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${location.pathname === "/" ? "bg-red-50 text-red-600 border-l-[3px] border-red-600" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}>
              <LayoutDashboard className={`w-5 h-5 ${location.pathname === "/" ? "text-red-600" : "text-gray-400"}`} /> Dashboard
            </button>
            <button onClick={() => go("/tickets")} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${location.pathname === "/tickets" ? "bg-red-50 text-red-600 border-l-[3px] border-red-600" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}>
              <Ticket className={`w-5 h-5 ${location.pathname === "/tickets" ? "text-red-600" : "text-gray-400"}`} /> Tickets
            </button>
            <button onClick={() => go("/users")} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${location.pathname === "/users" ? "bg-red-50 text-red-600 border-l-[3px] border-red-600" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}>
              <Users className={`w-5 h-5 ${location.pathname === "/users" ? "text-red-600" : "text-gray-400"}`} /> Branch Users
            </button>
            <button onClick={() => go("/audit-log")} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${location.pathname === "/audit-log" ? "bg-red-50 text-red-600 border-l-[3px] border-red-600" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}>
              <ClipboardList className={`w-5 h-5 ${location.pathname === "/audit-log" ? "text-red-600" : "text-gray-400"}`} /> Audit Log
            </button>
            <button onClick={() => go("/reports")} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${location.pathname === "/reports" ? "bg-red-50 text-red-600 border-l-[3px] border-red-600" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}>
              <BarChart3 className={`w-5 h-5 ${location.pathname === "/reports" ? "text-red-600" : "text-gray-400"}`} /> Reports
            </button>

            {/* Settings (expandable) */}
            <div>
              <button
                onClick={() => setSettingsOpen((o) => !o)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isSettingsChild || location.pathname === "/settings"
                    ? "bg-red-50 text-red-600"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <span className="flex items-center gap-3">
                  <Settings className={`w-5 h-5 ${isSettingsChild ? "text-red-600" : "text-gray-400"}`} /> Settings
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${settingsOpen ? "rotate-180" : ""}`} />
              </button>
              {settingsOpen && (
                <div className="ml-4 mt-1 space-y-1 border-l border-gray-200 pl-3">
                  {settingsChildren.map((c) => {
                    const isActive = location.pathname === c.path;
                    return (
                      <button
                        key={c.path}
                        onClick={() => go(c.path)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                          isActive ? "bg-red-50 text-red-600" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                        }`}
                      >
                        <c.icon className={`w-4 h-4 ${isActive ? "text-red-600" : "text-gray-400"}`} />
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : isCluster ? (
          clusterNavItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => go(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-red-50 text-red-600 border-l-[3px] border-red-600"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? "text-red-600" : "text-gray-400"}`} />
                {item.label}
              </button>
            );
          })
        ) : (
          branchNavItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => go(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-red-50 text-red-600 border-l-[3px] border-red-600"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? "text-red-600" : "text-gray-400"}`} />
                {item.label}
              </button>
            );
          })
        )}
      </nav>

      {/* User Info & Logout */}
      <div className="p-3 border-t border-gray-200">
        <div className="px-3 py-2 mb-2">
          {user?.type === "branch" ? (
            <>
              <p className="text-sm font-medium text-gray-800 truncate">{user.name}</p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                  user.branchRole === "IT" ? "bg-blue-100 text-blue-700" :
                  user.branchRole === "Branch Admin" ? "bg-green-100 text-green-700" :
                  user.branchRole === "Manager" ? "bg-amber-100 text-amber-700" :
                  "bg-gray-100 text-gray-600"
                }`}>{user.branchRole || "User"}</span>
                <span className="text-[10px] text-gray-400 truncate">{user.branchName}</span>
              </div>
            </>
          ) : user?.type === "cluster" ? (
            <>
              <p className="text-sm font-medium text-gray-800 truncate">{user.name || "Cluster Admin"}</p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-800 truncate">{user?.name || "Admin"}</p>
              <p className="text-xs text-gray-500 capitalize">{user?.type || "admin"} User</p>
            </>
          )}
        </div>
        <button
          onClick={() => setShowLogoutConfirm(true)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-all"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </div>

      <ConfirmDialog
        open={showLogoutConfirm}
        onOpenChange={setShowLogoutConfirm}
        title="Sign out?"
        description="You will be returned to the login page."
        confirmLabel="Sign Out"
        cancelLabel="Cancel"
        onConfirm={logout}
      />
    </aside>
  );
}
