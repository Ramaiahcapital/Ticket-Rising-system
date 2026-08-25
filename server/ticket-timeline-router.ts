import { z } from "zod";
import { createRouter, authedQuery } from "./middleware.js";
import { getSupabaseAdmin } from "./lib/supabase.js";
import { canAdminAccessTicket, hasTransferAccess, getUserEmail } from "./lib/utils.js";

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
      let hasAccess = false;
      if (ctx.user.type === "branch" && ticket.branchId === ctx.user.id) hasAccess = true;
      else if (ctx.user.type === "admin" && canAdminAccessTicket(ctx.user, ticket.branchRole)) hasAccess = true;
      else if (ctx.user.type === "cluster") hasAccess = true;
      if (!hasAccess) {
        const email = await getUserEmail(ctx.user);
        if (await hasTransferAccess(ctx.user.id, email, input.ticketId)) hasAccess = true;
      }
      if (!hasAccess) throw new Error("Access denied");

      const { data: entries } = await supabase
        .from("ticket_timeline")
        .select("*")
        .eq("ticketId", input.ticketId)
        .order("createdAt", { ascending: false });

      return entries ?? [];
    }),
});
