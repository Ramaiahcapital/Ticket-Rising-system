import { getSupabaseAdmin } from "./supabase.js";
import type { Profile } from "./db-types.js";
import { getRoleAdminRecipients } from "./utils.js";
import { getEffectivePermissionsFor } from "./permissions.js";

export type TicketNotificationMode = "department" | "all" | "custom";

export type TicketNotificationSettings = {
  enabled: boolean;
  mode: TicketNotificationMode;
  customRecipients: string[];
};

export type TicketEmailRecipient = {
  id?: string;
  email: string;
  name?: string | null;
};

const SETTINGS_KEY = "ticket_notification_settings";

export const DEFAULT_TICKET_NOTIFICATION_SETTINGS: TicketNotificationSettings = {
  enabled: true,
  mode: "department",
  customRecipients: [],
};

function normaliseEmails(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim().toLowerCase())
        .filter((v) => v.includes("@"))
    )
  );
}

export async function getTicketNotificationSettings(): Promise<TicketNotificationSettings> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();

  if (!data?.value) return { ...DEFAULT_TICKET_NOTIFICATION_SETTINGS };

  try {
    const parsed = JSON.parse(data.value) as Partial<TicketNotificationSettings>;
    const mode: TicketNotificationMode =
      parsed.mode === "all" || parsed.mode === "custom" ? parsed.mode : "department";
    return {
      enabled: parsed.enabled !== false,
      mode,
      customRecipients: normaliseEmails(parsed.customRecipients),
    };
  } catch {
    return { ...DEFAULT_TICKET_NOTIFICATION_SETTINGS };
  }
}

export async function saveTicketNotificationSettings(
  input: TicketNotificationSettings,
  updatedBy: string
): Promise<TicketNotificationSettings> {
  const supabase = getSupabaseAdmin();
  const settings: TicketNotificationSettings = {
    enabled: !!input.enabled,
    mode: input.mode === "all" || input.mode === "custom" ? input.mode : "department",
    customRecipients: normaliseEmails(input.customRecipients),
  };

  const { error } = await supabase.from("system_settings").upsert(
    {
      key: SETTINGS_KEY,
      value: JSON.stringify(settings),
      description: "Who receives an email when a new ticket is created",
      updatedAt: new Date().toISOString(),
      updatedBy,
    },
    { onConflict: "key" }
  );
  if (error) throw new Error(error.message);

  return settings;
}

/**
 * Resolve the recipients for a new ticket email.
 *
 * - "department": department admins + transfer monitors (legacy behaviour),
 *   filtered by each recipient's email_notifications permission.
 * - "all": every active profile with email_notifications enabled.
 * - "custom": only the configured email addresses.
 */
export async function resolveTicketEmailRecipients(
  ticketRole: string | null
): Promise<{
  recipients: TicketEmailRecipient[];
  disabledReason?: string;
  mode: TicketNotificationMode;
}> {
  const settings = await getTicketNotificationSettings();

  if (!settings.enabled) {
    return {
      recipients: [],
      disabledReason: "New-ticket email notifications are turned off by the administrator.",
      mode: settings.mode,
    };
  }

  if (settings.mode === "custom") {
    if (!settings.customRecipients.length) {
      return {
        recipients: [],
        disabledReason: "No custom email recipients are configured for new tickets.",
        mode: settings.mode,
      };
    }
    return {
      recipients: settings.customRecipients.map((email) => ({ email })),
      mode: settings.mode,
    };
  }

  const supabase = getSupabaseAdmin();

  if (settings.mode === "all") {
    const { data } = await supabase.from("profiles").select("*").eq("isActive", true);
    const profiles = (data ?? []) as Profile[];
    const permissions = await getEffectivePermissionsFor(profiles);

    const recipients = profiles
      .filter((p) => !!p.email && permissions.get(p.id)?.email_notifications)
      .map((p) => ({ id: p.id, email: p.email as string, name: p.name }));

    if (!recipients.length) {
      return {
        recipients,
        disabledReason: "No active user has new-ticket emails enabled.",
        mode: settings.mode,
      };
    }
    return { recipients, mode: settings.mode };
  }

  // Department mode — preserve the branch_roles.emailNotifications switch.
  if (ticketRole) {
    const { data: roleSetting } = await supabase
      .from("branch_roles")
      .select("emailNotifications")
      .eq("name", ticketRole)
      .maybeSingle();
    if (roleSetting?.emailNotifications === false) {
      return {
        recipients: [],
        disabledReason: `Email notifications are turned off for the "${ticketRole}" department.`,
        mode: settings.mode,
      };
    }
  }

  const admins = await getRoleAdminRecipients(ticketRole, { activeOnly: true });
  const permissions = await getEffectivePermissionsFor(admins);
  const recipients = admins
    .filter((a) => !!a.email && permissions.get(a.id)?.email_notifications)
    .map((a) => ({ id: a.id, email: a.email as string, name: a.name }));

  if (!recipients.length) {
    return {
      recipients,
      disabledReason: `No admin is configured to receive "${ticketRole ?? "any"}" department emails.`,
      mode: settings.mode,
    };
  }

  return { recipients, mode: settings.mode };
}
