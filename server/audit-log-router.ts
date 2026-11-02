import { z } from "zod";
import { createRouter, permissionQuery } from "./middleware.js";
import { getSupabaseAdmin } from "./lib/supabase.js";

export const auditLogRouter = createRouter({
  list: permissionQuery("audit_log")
    .input(
      z.object({
        page: z.number().default(1),
        limit: z.number().default(25),
        action: z.string().optional(),
        entityType: z.string().optional(),
        userId: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const supabase = getSupabaseAdmin();
      const params = input || { page: 1, limit: 25 };

      const applyFilters = (q: any) => {
        if (params.action) q = q.ilike("action", `%${params.action}%`);
        if (params.entityType) q = q.eq("entityType", params.entityType);
        if (params.userId) q = q.eq("userId", params.userId);
        if (params.dateFrom) q = q.gte("createdAt", params.dateFrom);
        if (params.dateTo) q = q.lte("createdAt", params.dateTo);
        return q;
      };

      const countQuery = applyFilters(
        supabase.from("audit_logs").select("*", { count: "exact", head: true })
      );
      const { count } = await countQuery;

      const itemsQuery = applyFilters(
        supabase.from("audit_logs").select("*")
      );
      const { data: items } = await itemsQuery
        .order("createdAt", { ascending: false })
        .range((params.page - 1) * params.limit, params.page * params.limit - 1);

      const total = count ?? 0;

      return {
        items: items ?? [],
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(total / params.limit),
      };
    }),
});
