import { z } from "zod";
import { createRouter, adminQuery } from "./middleware.js";
import { getSupabaseAdmin } from "./lib/supabase.js";
import type { TicketStatusRow, TicketPriorityRow, TicketCategoryRow, TicketRow, Profile } from "./lib/db-types.js";
import { getTicketScopeFilter } from "./lib/utils.js";

export const reportRouter = createRouter({
  generate: adminQuery
    .input(
      z.object({
        dateFrom: z.string(),
        dateTo: z.string(),
        branchIds: z.array(z.string()).optional(),
        categoryIds: z.array(z.string()).optional(),
        priorityIds: z.array(z.string()).optional(),
        statusIds: z.array(z.string()).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const scope = getTicketScopeFilter(ctx.user);

      let query = supabase
        .from("tickets")
        .select("*")
        .gte("createdAt", input.dateFrom)
        .lte("createdAt", input.dateTo);

      if (scope) {
        query = query.eq("branchRole", scope.branchRole);
      }

      if (input.branchIds && input.branchIds.length > 0) {
        query = query.in("branchId", input.branchIds);
      }
      if (input.categoryIds && input.categoryIds.length > 0) {
        query = query.in("categoryId", input.categoryIds);
      }
      if (input.priorityIds && input.priorityIds.length > 0) {
        query = query.in("priorityId", input.priorityIds);
      }
      if (input.statusIds && input.statusIds.length > 0) {
        query = query.in("statusId", input.statusIds);
      }

      const { data: ticketList } = await query.order("createdAt", { ascending: false });
      const tickets = (ticketList as TicketRow[] | null) ?? [];

      // Get all related data for enrichment
      const { data: allStatuses } = await supabase.from("ticket_statuses").select("*");
      const { data: allPriorities } = await supabase.from("ticket_priorities").select("*");
      const { data: allCategories } = await supabase.from("ticket_categories").select("*");
      const { data: allBranches } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "branch");

      const statusRows = (allStatuses as TicketStatusRow[] | null) ?? [];
      const priorityRows = (allPriorities as TicketPriorityRow[] | null) ?? [];
      const categoryRows = (allCategories as TicketCategoryRow[] | null) ?? [];
      const branchRows = (allBranches as Profile[] | null) ?? [];

      const statusName = (id: string | null) =>
        statusRows.find(s => s.id === id)?.name || "Unknown";
      const statusColor = (id: string | null) =>
        statusRows.find(s => s.id === id)?.color || "#ccc";
      const priorityName = (id: string | null) =>
        priorityRows.find(p => p.id === id)?.name || "Unknown";
      const priorityColor = (id: string | null) =>
        priorityRows.find(p => p.id === id)?.color || "#ccc";
      const categoryName = (id: string | null) =>
        categoryRows.find(c => c.id === id)?.name || "Unknown";
      const branchName = (id: string) =>
        branchRows.find(b => b.id === id)?.branchName || `Branch ${id}`;

      const groupCount = (key: "statusId" | "priorityId" | "branchId" | "categoryId") => {
        const map = new Map<string, number>();
        for (const t of tickets) {
          const v = t[key];
          if (v) map.set(v, (map.get(v) || 0) + 1);
        }
        return map;
      };

      const statusCountMap = groupCount("statusId");
      const priorityCountMap = groupCount("priorityId");
      const branchCountMap = groupCount("branchId");
      const categoryCountMap = groupCount("categoryId");

      return {
        summary: {
          totalTickets: tickets.length,
          dateRange: { from: input.dateFrom, to: input.dateTo },
        },
        byStatus: Array.from(statusCountMap.entries()).map(([statusId, count]) => ({
          status: statusName(statusId),
          color: statusColor(statusId),
          count,
        })),
        byPriority: Array.from(priorityCountMap.entries()).map(([priorityId, count]) => ({
          priority: priorityName(priorityId),
          color: priorityColor(priorityId),
          count,
        })),
        byBranch: Array.from(branchCountMap.entries()).map(([branchId, count]) => ({
          branch: branchName(branchId),
          count,
        })),
        byCategory: Array.from(categoryCountMap.entries()).map(([categoryId, count]) => ({
          category: categoryName(categoryId),
          count,
        })),
        tickets,
      };
    }),
});
