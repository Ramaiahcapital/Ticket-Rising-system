import { getSupabaseAdmin } from "./supabase.js";
import type {
  AuditLogRow,
  NotificationRow,
  Profile,
  Role,
  TicketTimelineRow,
  UnifiedUser,
} from "./db-types.js";

// Generate next ticket number based on format setting
export async function generateTicketNumber(): Promise<string> {
  const supabase = getSupabaseAdmin();

  const { data: formatRows } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "ticket_number_format")
    .maybeSingle();
  const { data: counterRows } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "ticket_number_counter")
    .maybeSingle();

  const format = formatRows?.value || "RC-YYYY-XXXXXX";
  let counter = parseInt(counterRows?.value || "0", 10);
  counter++;

  const year = new Date().getFullYear().toString();
  const ticketNumber = format
    .replace("YYYY", year)
    .replace("XXXXXX", counter.toString().padStart(6, "0"));

  await supabase
    .from("system_settings")
    .update({ value: counter.toString() })
    .eq("key", "ticket_number_counter");

  return ticketNumber;
}

// Create audit log entry
export async function createAuditLog(params: {
  userId?: string;
  userType: "admin" | "branch" | "system";
  userName?: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}) {
  const supabase = getSupabaseAdmin();
  const row: Omit<AuditLogRow, "id" | "createdAt"> = {
    userId: params.userId ?? null,
    userType: params.userType,
    userName: params.userName ?? null,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId ?? null,
    details: params.details ? JSON.stringify(params.details) : null,
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
  };
  await supabase.from("audit_logs").insert(row);
}

// Create timeline entry
export async function createTimelineEntry(params: {
  ticketId: string;
  action: string;
  actorId: string;
  actorType: Role;
  actorName: string;
  previousValue?: string;
  newValue?: string;
  description?: string;
}) {
  const supabase = getSupabaseAdmin();
  const row: Omit<TicketTimelineRow, "id" | "createdAt"> = {
    ticketId: params.ticketId,
    action: params.action,
    actorId: params.actorId,
    actorType: params.actorType,
    actorName: params.actorName,
    previousValue: params.previousValue ?? null,
    newValue: params.newValue ?? null,
    description: params.description ?? null,
    metadata: null,
  };
  await supabase.from("ticket_timeline").insert(row);
}

// Create notification
export async function createNotification(params: {
  recipientId: string;
  recipientType: Role;
  title: string;
  message: string;
  type: NotificationRow["type"];
  ticketId?: string;
}) {
  const supabase = getSupabaseAdmin();
  const row: Omit<NotificationRow, "id" | "createdAt" | "isRead"> = {
    recipientId: params.recipientId,
    recipientType: params.recipientType,
    title: params.title,
    message: params.message,
    type: params.type,
    ticketId: params.ticketId ?? null,
  };
  await supabase.from("notifications").insert(row);
}

// Notify all admins about an event
export async function notifyAllAdmins(params: {
  title: string;
  message: string;
  type: NotificationRow["type"];
  ticketId?: string;
}) {
  const supabase = getSupabaseAdmin();
  const { data: admins } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "admin");

  for (const admin of (admins as Profile[] | null) ?? []) {
    await createNotification({
      recipientId: admin.id,
      recipientType: "admin",
      title: params.title,
      message: params.message,
      type: params.type,
      ticketId: params.ticketId,
    });
  }
}

// Notify all cluster users belonging to a cluster
export async function notifyClusterUsers(clusterId: string, title: string, message: string, type: NotificationRow["type"]) {
  const supabase = getSupabaseAdmin();
  if (!clusterId) return;
  const { data: users } = await supabase
    .from("profiles")
    .select("id")
    .eq("clusterId", clusterId)
    .eq("role", "cluster");
  if (!users?.length) return;
  await supabase.from("notifications").insert(
    (users as { id: string }[]).map((u) => ({ recipientId: u.id, recipientType: "cluster", title, message, type }))
  );
}

// Notify all branch users linked to a branch
export async function notifyBranchUsers(branchId: string, title: string, message: string, type: NotificationRow["type"]) {
  const supabase = getSupabaseAdmin();
  if (!branchId) return;
  const { data: users } = await supabase
    .from("profiles")
    .select("id")
    .eq("branchId", branchId)
    .eq("role", "branch");
  if (!users?.length) return;
  await supabase.from("notifications").insert(
    (users as { id: string }[]).map((u) => ({ recipientId: u.id, recipientType: "branch", title, message, type }))
  );
}

/**
 * Ticket scope for a sub-admin. Returns a branchRole to filter tickets by,
 * or null when the user is a main admin (sees everything) or not an admin.
 */
export function getTicketScopeFilter(user?: UnifiedUser): { branchRole: string } | null {
  if (user?.type === "admin" && user.adminRole) {
    return { branchRole: user.adminRole };
  }
  return null;
}

/** Whether an admin user is scoped to a ticket (matches their bucket or is main admin). */
export function canAdminAccessTicket(user: UnifiedUser | undefined, ticketBranchRole: string | null): boolean {
  if (!user || user.type !== "admin") return false;
  if (!user.adminRole) return true;
  return ticketBranchRole === user.adminRole;
}

/** Check if a user has transfer access to a ticket (by email match on ticket_transfers). */
export async function hasTransferAccess(
  _userId: string,
  userMail: string | null,
  ticketId: string,
): Promise<boolean> {
  if (!userMail) return false;
  const supabase = getSupabaseAdmin();
  const { data } = await (supabase as any)
    .from("ticket_transfers")
    .select("id")
    .eq("ticket_id", ticketId)
    .eq("to_email", userMail.toLowerCase().trim())
    .eq("status", "accepted")
    .maybeSingle();
  return !!data;
}

/** Get user email from profile (for any user type). */
export async function getUserEmail(
  user: UnifiedUser,
): Promise<string | null> {
  if (user.type === "branch") return user.email;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("profiles").select("email").eq("id", user.id).maybeSingle();
  return data?.email ?? null;
}

/**
 * Admins who should receive role-specific notifications/emails for a ticket:
 * the sub-admins in the matching bucket plus every main admin.
 * Also includes transfer users whose monitorRole matches the bucket (middle admins).
 */
export async function getRoleAdminRecipients(
  role: string | null,
  opts: { excludeId?: string; activeOnly?: boolean } = {}
): Promise<Profile[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase.from("profiles").select("*");
  if (opts.activeOnly) query = query.eq("isActive", true);

  const { data } = await query;
  const users = (data as Profile[] | null) ?? [];

  return users.filter((u) => {
    if (opts.excludeId && u.id === opts.excludeId) return false;
    if (u.role === "admin") {
      // Sub-admin buckets matching the ticket's branch role, plus all main admins.
      return !u.adminRole || u.adminRole === role;
    }
    if (u.role === "transfer") {
      // Middle admins (transfer users with monitor access) for the matching department.
      return !!(u as any).monitorRole && (u as any).monitorRole === role;
    }
    return false;
  });
}

/** Batch-notify the admins relevant to a ticket's branch role. */
export async function notifyRoleAdmins(
  role: string | null,
  params: {
    title: string;
    message: string;
    type: NotificationRow["type"];
    ticketId?: string;
    excludeId?: string;
  }
) {
  const recipients = await getRoleAdminRecipients(role, { excludeId: params.excludeId });
  if (!recipients.length) return;
  const supabase = getSupabaseAdmin();
  await supabase.from("notifications").insert(
    recipients.map((r) => ({
      recipientId: r.id,
      recipientType: (r.role === "admin" ? "admin" : "transfer") as
        | "admin"
        | "transfer",
      title: params.title,
      message: params.message,
      type: params.type,
      ticketId: params.ticketId ?? null,
    }))
  );
}

// Get client IP from request
export function getClientIP(req: Request): string {
  return req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
}

// Check whether a branch role name exists in the dynamic branch_roles table
export async function roleExists(supabase: ReturnType<typeof getSupabaseAdmin>, role: string): Promise<boolean> {
  const { data } = await supabase.from("branch_roles").select("id").eq("name", role).maybeSingle();
  return !!data;
}

// Throw if the branch role does not exist
export async function requireRoleExists(supabase: ReturnType<typeof getSupabaseAdmin>, role: string): Promise<void> {
  if (!(await roleExists(supabase, role))) {
    throw new Error(`Branch role "${role}" does not exist`);
  }
}
