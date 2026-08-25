import { useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { trpc } from "@/providers/trpc";
import { Menu, Bell } from "lucide-react";

interface HeaderProps {
  onMenuClick: () => void;
  onDesktopToggle: () => void;
  sidebarCollapsed: boolean;
}

export default function Header({ onMenuClick, onDesktopToggle, sidebarCollapsed }: HeaderProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);

  const { data: unreadData } = trpc.notification.unreadCount.useQuery();
  const { data: notificationsData } = trpc.notification.list.useQuery(
    { limit: 5 },
    { enabled: notifOpen }
  );
  const utils = trpc.useUtils();
  const markAsRead = trpc.notification.markAsRead.useMutation({
    onSuccess: () => {
      utils.notification.unreadCount.invalidate();
      utils.notification.list.invalidate();
    },
  });
  const markAllAsRead = trpc.notification.markAllAsRead.useMutation({
    onSuccess: () => {
      utils.notification.unreadCount.invalidate();
      utils.notification.list.invalidate();
    },
  });

  const unreadCount = unreadData?.count || 0;

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
      {/* Left */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            if (window.matchMedia("(min-width: 1024px)").matches) onDesktopToggle();
            else onMenuClick();
          }}
          className="p-2 hover:bg-gray-100 rounded-lg"
          title={sidebarCollapsed ? "Show menu" : "Hide menu"}
        >
          <Menu className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-lg font-semibold text-gray-800 hidden sm:block">
          {user?.type === "admin" ? "Admin Portal" : user?.type === "cluster" ? (user as any)?.clusterName || "Cluster Portal" : user?.type === "transfer" ? "Transfer Portal" : user?.branchName || "Branch Portal"}
        </h1>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {/* Notification Bell */}
        <div className="relative">
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Bell className="w-5 h-5 text-gray-600" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {/* Notification Dropdown */}
          {notifOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-800">Notifications</h3>
                  {unreadCount > 0 && (
                    <button
                      onClick={() => markAllAsRead.mutate()}
                      className="text-xs text-red-600 hover:text-red-700 font-medium"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-auto">
                  {!notificationsData?.items?.length ? (
                    <div className="px-4 py-8 text-center text-gray-500 text-sm">
                      No notifications yet
                    </div>
                  ) : (
                    notificationsData.items.map((notif) => (
                      <div
                        key={notif.id}
                        className={`px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                          !notif.isRead ? "bg-red-50/30" : ""
                        }`}
                        onClick={() => {
                          if (!notif.isRead) markAsRead.mutate({ id: notif.id });
                          if (notif.ticketId) navigate(`/tickets/${notif.ticketId}`);
                          setNotifOpen(false);
                        }}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{notif.title}</p>
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
                            <p className="text-[10px] text-gray-400 mt-1">
                              {new Date(notif.createdAt ?? new Date()).toLocaleDateString()}
                            </p>
                          </div>
                          {!notif.isRead && (
                            <div className="w-2 h-2 bg-red-500 rounded-full mt-1.5 flex-shrink-0" />
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* User Avatar */}
        <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center">
          <span className="text-white text-sm font-medium">
            {user?.type === "admin"
              ? (user.name?.[0] || "A").toUpperCase()
              : ((user as { branchName?: string | null }).branchName?.[0] || "B").toUpperCase()}
          </span>
        </div>
      </div>
    </header>
  );
}
