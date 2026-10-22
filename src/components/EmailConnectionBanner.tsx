import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { AlertTriangle, Mail } from "lucide-react";
import { Link, useLocation } from "react-router";

/**
 * Warns the signed-in user when their own Gmail connection can no longer send,
 * so notifications are not silently sent from an administrator mailbox.
 */
export default function EmailConnectionBanner() {
  const { user } = useAuth();
  const location = useLocation();
  const { data: status, isLoading } = trpc.googleAuth.status.useQuery(undefined, {
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  if (!user || isLoading || !status) return null;
  // The Email Settings page already shows the full connect/reconnect panel.
  if (location.pathname === "/email-settings") return null;

  if (status.connected && !status.healthy) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-red-300 bg-red-50 p-3">
        <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-600" />
        <p className="flex-1 text-sm text-red-800">
          Your email connection has expired. Tickets and orders you raise are being notified from an
          administrator mailbox instead of <strong>{status.email}</strong>.
        </p>
        <Link
          to="/email-settings"
          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors"
        >
          Reconnect now
        </Link>
      </div>
    );
  }

  if (!status.connected) {
    // Admins are few and the fallback covers them; only nag the people who
    // raise tickets and place orders every day.
    if (user.type === "admin") return null;
    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
        <Mail className="w-5 h-5 flex-shrink-0 text-amber-600" />
        <p className="flex-1 text-sm text-amber-800">
          Your Google account is not connected, so tickets and orders you raise are notified from an
          administrator mailbox instead of your own address.
        </p>
        <Link
          to="/email-settings"
          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition-colors"
        >
          Connect Google Account
        </Link>
      </div>
    );
  }

  return null;
}
