import { trpc } from "@/providers/trpc";
import { useCallback, useMemo } from "react";

export type BranchRoleInfo = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
};

const DEFAULT_COLOR = "#6B7280";

export function useBranchRoles() {
  const { data: roles, isLoading } = trpc.branchRole.list.useQuery(undefined, {
    staleTime: 1000 * 60,
  });

  const byName = useMemo(() => {
    const map = new Map<string, BranchRoleInfo>();
    for (const r of roles ?? []) map.set(r.name, r);
    return map;
  }, [roles]);

  const activeRoles = useMemo(
    () => (roles ?? []).filter((r) => r.isActive),
    [roles]
  );

  const getColor = useCallback(
    (name: string | null | undefined) => byName.get(name ?? "")?.color ?? DEFAULT_COLOR,
    [byName]
  );

  return { roles, activeRoles, byName, getColor, isLoading };
}
