import { z } from "zod";
import { createRouter, authedQuery } from "./middleware.js";
import { getSupabaseAdmin } from "./lib/supabase.js";
import { canAdminAccessTicket } from "./lib/utils.js";

export const ticketTimelineRouter = createRouter({
  list: authedQuery
    .input(z.object({ ticketId: z.string() }))
    .query(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();

      // Verify ticket access
      const { data: ticket } = await supabase
        .from("tickets")
        .select("*")
        .eq("id", input.ticketId)
        .maybeSingle();
      if (!ticket) throw new Error("Ticket not found");
      if (ctx.user.type === "branch" && ticket.branchId !== ctx.user.id) {
        throw new Error("Access denied");
      }
      if (ctx.user.type === "admin" && !canAdminAccessTicket(ctx.user, ticket.branchRole)) {
        throw new Error("Access denied");
      }

      const { data: entries } = await supabase
        .from("ticket_timeline")
        .select("*")
        .eq("ticketId", input.ticketId)
        .order("createdAt", { ascending: false });

      return entries ?? [];
    }),
});
