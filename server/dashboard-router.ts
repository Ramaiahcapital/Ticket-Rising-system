import { createRouter, adminQuery, authedQuery } from "./middleware.js";
import { getSupabaseAdmin } from "./lib/supabase.js";
import type { Profile, TicketStatusRow, TicketPriorityRow, TicketRow, TicketTimelineRow } from "./lib/db-types.js";
import { getTicketScopeFilter } from "./lib/utils.js";

export const dashboardRouter = createRouter({
  adminStats: adminQuery.query(async ({ ctx }) => {
    const supabase = getSupabaseAdmin();
    const scope = getTicketScopeFilter(ctx.user);

    let totalQuery = supabase.from("tickets").select("*", { count: "exact", head: true });
    let allTicketsQuery = supabase.from("tickets").select("*");
    let recentQuery = supabase.from("tickets").select("*").order("createdAt", { ascending: false }).limit(10);
    let branchCountQuery = supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "branch");
    let activeBranchQuery = branchCountQuery;

    if (scope) {
      totalQuery = totalQuery.eq("branchRole", scope.branchRole);
      allTicketsQuery = allTicketsQuery.eq("branchRole", scope.branchRole);
      recentQuery = recentQuery.eq("branchRole", scope.branchRole);
      branchCountQuery = branchCountQuery.eq("branchRole", scope.branchRole);
      activeBranchQuery = activeBranchQuery.eq("branchRole", scope.branchRole);
    }

    const { count: totalTickets } = await totalQuery;

    const { count: totalBranches } = await branchCountQuery;

    const { count: activeBranches } = await activeBranchQuery.eq("isActive", true);

    // Get all statuses with counts
    const { data: statuses } = await supabase
      .from("ticket_statuses")
      .select("*")
      .order("sortOrder", { ascending: true });
    const { data: allTickets } = await allTicketsQuery;

    const statusCountMap = new Map<string, number>();
    for (const t of allTickets ?? []) {
      if (t.statusId) {
        statusCountMap.set(t.statusId, (statusCountMap.get(t.statusId) || 0) + 1);
      }
    }

    // Get priority distribution
    const { data: priorities } = await supabase
      .from("ticket_priorities")
      .select("*")
      .order("sortOrder", { ascending: true });

    const priorityCountMap = new Map<string, number>();
    for (const t of allTickets ?? []) {
      if (t.priorityId) {
        priorityCountMap.set(t.priorityId, (priorityCountMap.get(t.priorityId) || 0) + 1);
      }
    }

    // Branch performance
    const branchCountMap = new Map<string, number>();
    for (const t of allTickets ?? []) {
      if (t.branchId) {
        branchCountMap.set(t.branchId, (branchCountMap.get(t.branchId) || 0) + 1);
      }
    }

    const { data: allBranches } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", "branch");
    const branchMap = new Map<string, string>();
    for (const b of (allBranches as Profile[] | null) ?? []) {
      branchMap.set(b.id, b.branchName || `Branch ${b.id}`);
    }

    const branchPerf = Array.from(branchCountMap.entries())
      .map(([branchId, count]) => ({
        branchName: branchMap.get(branchId) || `Branch ${branchId}`,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Department bucket counts
    const { data: roles } = await supabase
      .from("branch_roles")
      .select("*")
      .order("sortOrder", { ascending: true });
    const deptCounts: Record<string, number> = {};
    for (const r of roles ?? []) deptCounts[r.name] = 0;
    for (const t of allTickets ?? []) {
      const role = (t as any).branchRole as string | undefined;
      if (role && role in deptCounts) {
        deptCounts[role]++;
      }
    }
    let departmentCounts = (roles ?? []).map((r) => ({
      name: r.name,
      count: deptCounts[r.name] ?? 0,
      color: r.color,
    }));
    if (scope) {
      departmentCounts = departmentCounts.filter((r) => r.name === scope.branchRole);
    }

    // Recent tickets
    const { data: recentTickets } = await recentQuery;

    // Stationary budget per branch (main admin only)
    let stationaryBudget: { branchName: string; total: number }[] = [];
    if (!scope) {
      const { data: branchList } = await supabase.from("branches").select("id, name");
      const { data: orderItems } = await supabase
        .from("stationary_order_items")
        .select("quantity, unitPrice, lineTotal, orderId");
      const { data: orders } = await supabase
        .from("stationary_orders")
        .select("id, branchId");

      const orderBranchMap = new Map((orders ?? []).map(o => [o.id, o.branchId]));
      const branchBudgetMap = new Map<string, number>();
      for (const item of orderItems ?? []) {
        const branchId = orderBranchMap.get(item.orderId);
        if (branchId) {
          const total = item.lineTotal ?? (item.quantity * (item.unitPrice ?? 0));
          branchBudgetMap.set(branchId, (branchBudgetMap.get(branchId) || 0) + total);
        }
      }

      const branchNameMap = new Map((branchList ?? []).map(b => [b.id, b.name]));
      stationaryBudget = Array.from(branchBudgetMap.entries())
        .map(([branchId, total]) => ({
          branchName: branchNameMap.get(branchId) || `Branch ${branchId}`,
          total: Math.round(total * 100) / 100,
        }))
        .sort((a, b) => b.total - a.total);
    }

    return {
      totalTickets: Number(totalTickets || 0),
      totalBranches: Number(totalBranches || 0),
      activeBranches: Number(activeBranches || 0),
      statusDistribution: (statuses as TicketStatusRow[] | null ?? []).map(s => ({
        id: s.id,
        name: s.name,
        color: s.color,
        count: Number(statusCountMap.get(s.id) || 0),
      })),
      priorityDistribution: (priorities as TicketPriorityRow[] | null ?? []).map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        count: Number(priorityCountMap.get(p.id) || 0),
      })),
      departmentCounts,
      branchPerformance: branchPerf,
      stationaryBudget,
      recentTickets: recentTickets as TicketRow[] | null ?? [],
    };
  }),

  branchStats: authedQuery.query(async ({ ctx }) => {
    const supabase = getSupabaseAdmin();

    if (ctx.user.type !== "branch") {
      throw new Error("Branch stats only available for branch users");
    }

    const branchId = ctx.user.id;

    const { count: totalTickets } = await supabase
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .eq("branchId", branchId);

    // Status breakdown
    const { data: statuses } = await supabase
      .from("ticket_statuses")
      .select("*")
      .order("sortOrder", { ascending: true });

    const { data: branchTickets } = await supabase
      .from("tickets")
      .select("*")
      .eq("branchId", branchId);

    const statusCountMap = new Map<string, number>();
    for (const t of branchTickets ?? []) {
      if (t.statusId) {
        statusCountMap.set(t.statusId, (statusCountMap.get(t.statusId) || 0) + 1);
      }
    }

    // Recent activity (timeline)
    const ticketIds = (branchTickets ?? []).map(t => t.id);
    let recentActivity: TicketTimelineRow[] = [];
    if (ticketIds.length > 0) {
      const { data: timeline } = await supabase
        .from("ticket_timeline")
        .select("*")
        .in("ticketId", ticketIds)
        .order("createdAt", { ascending: false })
        .limit(10);
      recentActivity = (timeline as TicketTimelineRow[] | null) ?? [];
    }

    // Recent tickets
    const { data: recentTickets } = await supabase
      .from("tickets")
      .select("*")
      .eq("branchId", branchId)
      .order("createdAt", { ascending: false })
      .limit(5);

    return {
      totalTickets: Number(totalTickets || 0),
      statusBreakdown: (statuses as TicketStatusRow[] | null ?? []).map(s => ({
        id: s.id,
        name: s.name,
        color: s.color,
        isOpen: s.isOpen,
        count: Number(statusCountMap.get(s.id) || 0),
      })),
      recentActivity,
      recentTickets: recentTickets as TicketRow[] | null ?? [],
    };
  }),
});
