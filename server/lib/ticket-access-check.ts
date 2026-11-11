import type { TrpcContext } from "../context.js";
import { getSupabaseAdmin } from "./supabase.js";
import { departmentAccess, type TicketAccessLevel } from "./ticket-access.js";
import { getUserEmail, hasTransferAccess } from "./utils.js";

type AccessTicket = {
  id: string;
  createdBy: string;
  branchId: string;
  branchRole: string | null;
};

/**
 * Resolve what a signed-in user may do with one ticket:
 *   none = hidden
 *   view = can open/read but not act
 *   edit = can reply, change status, assign, etc.
 *
 * Rules (highest priority first):
 *   1. Tickets the user raised themselves are always editable.
 *   2. Tickets transferred to the user's email are editable.
 *   3. Cluster users can view tickets raised by branches in their cluster.
 *   4. Department access from user_ticket_access / role defaults.
 */
export async function resolveTicketAccess(
  ctx: TrpcContext,
  ticket: AccessTicket
): Promise<TicketAccessLevel> {
  const user = ctx.user;
  if (!user) return "none";

  if (ticket.createdBy === user.id) return "edit";
  if (
    (user.type === "branch" || user.type === "cluster") &&
    ticket.branchId === user.id
  ) {
    return "edit";
  }

  const email = await getUserEmail(user);
  if (await hasTransferAccess(user.id, email, ticket.id)) return "edit";

  const departmentLevel = departmentAccess(ctx.ticketAccess, ticket.branchRole);

  if (user.type === "cluster") {
    const clusterId = user.clusterId ?? null;
    if (clusterId) {
      const supabase = getSupabaseAdmin();
      const { data: creator } = await supabase
        .from("profiles")
        .select("clusterId, role")
        .eq("id", ticket.branchId)
        .maybeSingle();
      if (creator?.role === "branch" && creator.clusterId === clusterId) {
        return departmentLevel === "edit" ? "edit" : "view";
      }
    }
  }

  return departmentLevel;
}
