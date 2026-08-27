import { trpc } from "@/providers/trpc";
import { supabase } from "@/lib/supabase";
import { useCallback, useMemo } from "react";

export type UnifiedUser =
  | {
      type: "admin";
      id: string;
      name: string | null;
      email: string | null;
      role: "admin";
      /** Sub-admin department bucket; null = main admin (sees everything). */
      adminRole: string | null;
      avatar?: string | null;
    }
  | {
      type: "branch";
      id: string;
      name: string;
      branchName: string;
      branchCode: string;
      role: "branch";
      branchRole: string | null;
      branchId: string | null;
      clusterId: string | null;
      email: string;
      username: string;
    }
  | {
      type: "cluster";
      id: string;
      name: string | null;
      email: string | null;
      role: "cluster";
      clusterId: string | null;
      clusterName: string | null;
    }
  | {
      type: "transfer";
      id: string;
      name: string | null;
      email: string | null;
      role: "transfer";
      stationaryAccess: boolean;
      monitorRole: string | null;
    };

export function useAuth() {
  const utils = trpc.useUtils();

  const { data: user, isLoading } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
    },
  });

  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore - ensure we still clear local state below
    }
    try {
      await logoutMutation.mutateAsync();
    } catch {
      // server logout is a no-op; never block the client sign-out
    }
    window.location.reload();
  }, [logoutMutation]);

  return useMemo(
    () => ({
      user: (user as UnifiedUser) ?? null,
      isAuthenticated: !!user,
      isAdmin: user?.type === "admin",
      /** Main admin (no sub-admin bucket) — has access to all admin features. */
      isMainAdmin: user?.type === "admin" && !user.adminRole,
      /** Sub-admin department bucket, or null for main admins / non-admins. */
      adminRole: user?.type === "admin" ? user.adminRole : null,
      isBranch: user?.type === "branch",
      isCluster: user?.type === "cluster",
      isTransfer: user?.type === "transfer",
      hasStationaryAccess: user?.type === "transfer" && !!(user as any).stationaryAccess,
      /** Transfer user promoted to view-only middle admin (monitors a department). */
      isMonitor: user?.type === "transfer" && !!(user as any).monitorRole,
      /** Department the transfer user monitors (view-only). NULL = not a monitor. */
      monitorRole: user?.type === "transfer" ? ((user as any).monitorRole ?? null) : null,
      isLoading: isLoading || logoutMutation.isPending,
      logout,
    }),
    [user, isLoading, logoutMutation.isPending, logout],
  );
}
