import { z } from "zod";
import { createRouter, publicQuery, adminQuery, mainAdminQuery } from "./middleware.js";
import { getSupabaseAdmin } from "./lib/supabase.js";
import { createAuditLog } from "./lib/utils.js";
import {
  getTicketNotificationSettings,
  saveTicketNotificationSettings,
} from "./lib/ticket-notifications.js";

export const settingsRouter = createRouter({
  list: publicQuery.query(async () => {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from("system_settings").select("*");
    const settingsMap: Record<string, string> = {};
    for (const s of data ?? []) {
      settingsMap[s.key] = s.value;
    }
    return settingsMap;
  }),

  get: publicQuery
    .input(z.object({ key: z.string() }))
    .query(async ({ input }) => {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", input.key)
        .maybeSingle();
      return data?.value || null;
    }),

  update: adminQuery
    .input(z.object({ settings: z.record(z.string(), z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const now = new Date().toISOString();

      const rows = Object.entries(input.settings).map(([key, value]) => ({
        key,
        value,
        updatedAt: now,
        updatedBy: ctx.user.id,
      }));

      await supabase.from("system_settings").upsert(rows, { onConflict: "key" });

      await createAuditLog({
        userId: ctx.user.id,
        userType: "admin",
        action: "update_settings",
        entityType: "systemSettings",
        details: { keys: Object.keys(input.settings) },
      });

      return { success: true };
    }),

  previewTicketNumber: adminQuery.query(async () => {
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
    const counter = parseInt(counterRows?.value || "0", 10) + 1;
    const year = new Date().getFullYear().toString();

    const preview = format
      .replace("YYYY", year)
      .replace("XXXXXX", counter.toString().padStart(6, "0"));

    return { preview, format };
  }),

  /** Who receives an email when a new ticket is created. */
  getTicketNotifications: mainAdminQuery.query(async () => {
    return getTicketNotificationSettings();
  }),

  updateTicketNotifications: mainAdminQuery
    .input(
      z.object({
        enabled: z.boolean(),
        mode: z.enum(["department", "all", "custom"]),
        customRecipients: z.array(z.string()).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const settings = await saveTicketNotificationSettings(
        {
          enabled: input.enabled,
          mode: input.mode,
          customRecipients: input.customRecipients,
        },
        ctx.user.id
      );

      await createAuditLog({
        userId: ctx.user.id,
        userType: "admin",
        action: "update_ticket_notifications",
        entityType: "systemSettings",
        details: { ...settings },
      });

      return { success: true, settings };
    }),
});
