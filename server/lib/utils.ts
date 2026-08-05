import { getSupabaseAdmin } from "./supabase.js";
import type {
  AuditLogRow,
  NotificationRow,
  Profile,
  Role,
  TicketTimelineRow,
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
  recipientType: "admin" | "branch";
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
