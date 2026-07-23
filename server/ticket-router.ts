import { z } from "zod";
import { createRouter, authedQuery, adminQuery } from "./middleware.js";
import { getSupabaseAdmin } from "./lib/supabase.js";
import type { TicketRow } from "./lib/db-types.js";
import {
  generateTicketNumber,
  createTimelineEntry,
  createNotification,
  notifyAllAdmins,
  createAuditLog,
} from "./lib/utils.js";
import { sendEmailFromUser } from "./email-service.js";
import type { TrpcContext } from "./context.js";

function getActorName(ctx: { user: TrpcContext["user"] }): string {
  if (!ctx.user) return "Unknown";
  if (ctx.user.type === "branch") {
    return ctx.user.name || ctx.user.branchName || "Branch";
  }
  return ctx.user.name || "Admin";
}

export const ticketRouter = createRouter({
  list: authedQuery
    .input(
      z.object({
        page: z.number().default(1),
        limit: z.number().default(10),
        search: z.string().optional(),
        statusId: z.string().optional(),
        priorityId: z.string().optional(),
        categoryId: z.string().optional(),
        branchId: z.string().optional(),
        branchRole: z.enum(["IT", "Branch Admin", "Manager"]).optional(),
        assignedTo: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        sortBy: z.string().default("createdAt"),
        sortOrder: z.enum(["asc", "desc"]).default("desc"),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const params = input || { page: 1, limit: 10, sortBy: "createdAt", sortOrder: "desc" };
      const from = (params.page - 1) * params.limit;

      let query = supabase.from("tickets").select("*", { count: "exact" });

      if (ctx.user.type === "branch") {
        query = query.eq("branchId", ctx.user.id);
      } else if (params.branchId) {
        query = query.eq("branchId", params.branchId);
      }

      if (params.search) {
        query = query.or(
          `ticketNumber.ilike.%${params.search}%,subject.ilike.%${params.search}%,description.ilike.%${params.search}%`
        );
      }
      if (params.statusId) query = query.eq("statusId", params.statusId);
      if (params.priorityId) query = query.eq("priorityId", params.priorityId);
      if (params.categoryId) query = query.eq("categoryId", params.categoryId);
      if (params.assignedTo) query = query.eq("assignedTo", params.assignedTo);
      if (params.branchRole) query = query.eq("branchRole", params.branchRole);
      if (params.dateFrom) query = query.gte("createdAt", params.dateFrom);
      if (params.dateTo) query = query.lte("createdAt", params.dateTo);

      const { data: items, count, error } = await query
        .order(params.sortBy, { ascending: params.sortOrder === "asc" })
        .range(from, from + params.limit - 1);

      if (error) throw new Error(error.message);

      const { data: statuses } = await supabase.from("ticket_statuses").select("*");
      const { data: priorities } = await supabase.from("ticket_priorities").select("*");
      const { data: categories } = await supabase.from("ticket_categories").select("*");
      const { data: profiles } = await supabase.from("profiles").select("*");

      const statusMap = new Map((statuses ?? []).map((s) => [s.id, s]));
      const priorityMap = new Map((priorities ?? []).map((p) => [p.id, p]));
      const categoryMap = new Map((categories ?? []).map((c) => [c.id, c]));
      const profileMap = new Map((profiles ?? []).map((b) => [b.id, b]));

      const enrichedItems = (items ?? []).map((t) => ({
        ...t,
        status: statusMap.get(t.statusId ?? "") || null,
        priority: priorityMap.get(t.priorityId ?? "") || null,
        category: categoryMap.get(t.categoryId ?? "") || null,
        branch: profileMap.get(t.branchId ?? "") || null,
        assignee: profileMap.get(t.assignedTo ?? "") || null,
      }));

      const total = count ?? 0;
      return {
        items: enrichedItems,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(total / params.limit),
      };
    }),

  listExport: adminQuery
    .input(
      z.object({
        search: z.string().optional(),
        statusId: z.string().optional(),
        branchId: z.string().optional(),
        branchRole: z.enum(["IT", "Branch Admin", "Manager"]).optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const supabase = getSupabaseAdmin();
      const params = input || {};

      let query = supabase.from("tickets").select("*", { count: "exact" });

      if (params.search) {
        query = query.or(
          `ticketNumber.ilike.%${params.search}%,subject.ilike.%${params.search}%,description.ilike.%${params.search}%`
        );
      }
      if (params.statusId) query = query.eq("statusId", params.statusId);
      if (params.branchId) query = query.eq("branchId", params.branchId);
      if (params.branchRole) query = query.eq("branchRole", params.branchRole);
      if (params.dateFrom) query = query.gte("createdAt", params.dateFrom);
      if (params.dateTo) query = query.lte("createdAt", params.dateTo);

      const { data: items, error } = await query.order("createdAt", { ascending: false });

      if (error) throw new Error(error.message);

      const { data: statuses } = await supabase.from("ticket_statuses").select("*");
      const { data: branches } = await supabase.from("branches").select("*");
      const { data: profiles } = await supabase.from("profiles").select("*");

      const statusMap = new Map((statuses ?? []).map((s) => [s.id, s]));
      const branchMap = new Map((branches ?? []).map((b) => [b.id, b]));
      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

      return (items ?? []).map((t) => ({
        ticketNumber: t.ticketNumber,
        subject: t.subject,
        branch: branchMap.get(t.branchId ?? "")?.name || profileMap.get(t.branchId ?? "")?.branchName || "-",
        status: statusMap.get(t.statusId ?? "")?.name || "-",
        branchRole: t.branchRole || "-",
        createdAt: t.createdAt,
      }));
    }),

  byId: authedQuery
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { data: ticket } = await supabase.from("tickets").select("*").eq("id", input.id).maybeSingle();
      if (!ticket) throw new Error("Ticket not found");
      if (ctx.user.type === "branch" && ticket.branchId !== ctx.user.id) {
        throw new Error("Access denied");
      }
      return await enrichTicket(supabase, ticket);
    }),

  byNumber: authedQuery
    .input(z.object({ number: z.string() }))
    .query(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { data: ticket } = await supabase
        .from("tickets")
        .select("*")
        .eq("ticketNumber", input.number)
        .maybeSingle();
      if (!ticket) throw new Error("Ticket not found");
      if (ctx.user.type === "branch" && ticket.branchId !== ctx.user.id) {
        throw new Error("Access denied");
      }
      return await enrichTicket(supabase, ticket);
    }),

  create: authedQuery
    .input(
      z.object({
        subject: z.string().min(5).max(500),
        description: z.string().min(20),
        categoryId: z.string().optional(),
        subcategoryId: z.string().optional(),
        priorityId: z.string().optional(),
        department: z.string().optional(),
        customFields: z.record(z.string(), z.any()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();

      if (ctx.user.type !== "branch") {
        throw new Error("Only branch users can create tickets");
      }

      const ticketNumber = await generateTicketNumber();

      const { data: defaultStatuses } = await supabase
        .from("ticket_statuses")
        .select("*")
        .eq("isDefault", true)
        .eq("isEnabled", true)
        .order("sortOrder", { ascending: true })
        .limit(1);

      const { data: creator } = await supabase
        .from("profiles")
        .select("branchRole")
        .eq("id", ctx.user.id)
        .maybeSingle();

      const { data, error } = await supabase
        .from("tickets")
        .insert({
          ticketNumber,
          subject: input.subject,
          description: input.description,
          categoryId: input.categoryId ?? null,
          subcategoryId: input.subcategoryId ?? null,
          priorityId: input.priorityId ?? null,
          statusId: defaultStatuses?.[0]?.id ?? null,
          department: input.department ?? null,
          branchRole: creator?.branchRole ?? null,
          branchId: ctx.user.id,
          createdBy: ctx.user.id,
          customFields: input.customFields ?? {},
        })
        .select("id")
        .single();

      if (error) throw new Error(error.message);

      const ticketId = data.id;
      const actorName = getActorName(ctx);

      await createTimelineEntry({
        ticketId,
        action: "ticket_created",
        actorId: ctx.user.id,
        actorType: "branch",
        actorName,
        description: `Ticket ${ticketNumber} created`,
      });

      await createAuditLog({
        userId: ctx.user.id,
        userType: "branch",
        userName: actorName,
        action: "create_ticket",
        entityType: "ticket",
        entityId: ticketId,
        details: { ticketNumber, subject: input.subject },
      });

      await notifyAllAdmins({
        title: "New Ticket Created",
        message: `Ticket ${ticketNumber} - ${input.subject} was created by ${actorName}`,
        type: "ticket_created",
        ticketId,
      });

      // Send email from branch user to all admins
      try {
        const supabase = getSupabaseAdmin();
        const { data: admins } = await supabase
          .from("profiles")
          .select("email")
          .eq("role", "admin")
          .eq("isActive", true);
        const { data: sender } = await supabase
          .from("profiles")
          .select("branchName, email")
          .eq("id", ctx.user.id)
          .maybeSingle();
        if (admins?.length && sender?.email) {
          const branchLabel = sender.branchName || "Branch";
          for (const admin of admins) {
            if (admin.email) {
              await sendEmailFromUser(
                ctx.user.id,
                admin.email,
                `New Ticket: ${ticketNumber} - ${input.subject}`,
                `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                  <h2 style="color:#DC2626;">New Support Ticket</h2>
                  <table style="width:100%;border-collapse:collapse;">
                    <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Ticket #</td><td style="padding:8px;border-bottom:1px solid #eee;">${ticketNumber}</td></tr>
                    <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Subject</td><td style="padding:8px;border-bottom:1px solid #eee;">${input.subject}</td></tr>
                    <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Branch</td><td style="padding:8px;border-bottom:1px solid #eee;">${branchLabel}</td></tr>
                    <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Department</td><td style="padding:8px;border-bottom:1px solid #eee;">${input.department || "Not specified"}</td></tr>
                    <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Description</td><td style="padding:8px;border-bottom:1px solid #eee;">${input.description}</td></tr>
                  </table>
                  <p style="margin-top:16px;color:#666;">This ticket was raised from the Ramaiah Capital Ticket Management System.</p>
                </div>`
              );
            }
          }
        }
      } catch (e) { console.error("Ticket email failed:", e); }

      return { id: ticketId, ticketNumber };
    }),

  update: authedQuery
    .input(
      z.object({
        id: z.string(),
        subject: z.string().min(5).max(500).optional(),
        description: z.string().min(20).optional(),
        categoryId: z.string().optional(),
        subcategoryId: z.string().optional(),
        priorityId: z.string().optional(),
        department: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { id, ...updates } = input;

      const { data: ticket } = await supabase.from("tickets").select("*").eq("id", id).maybeSingle();
      if (!ticket) throw new Error("Ticket not found");
      if (ctx.user.type === "branch" && ticket.branchId !== ctx.user.id) {
        throw new Error("Access denied");
      }

      const set: Partial<TicketRow> = { updatedAt: new Date().toISOString() };
      if (updates.subject !== undefined) set.subject = updates.subject;
      if (updates.description !== undefined) set.description = updates.description;
      if (updates.categoryId !== undefined) set.categoryId = updates.categoryId;
      if (updates.subcategoryId !== undefined) set.subcategoryId = updates.subcategoryId;
      if (updates.priorityId !== undefined) set.priorityId = updates.priorityId;
      if (updates.department !== undefined) set.department = updates.department;

      const { error } = await supabase.from("tickets").update(set).eq("id", id);
      if (error) throw new Error(error.message);

      await createTimelineEntry({
        ticketId: id,
        action: "ticket_updated",
        actorId: ctx.user.id,
        actorType: ctx.user.type,
        actorName: getActorName(ctx),
        description: "Ticket details updated",
      });

      return { success: true };
    }),

  changeStatus: authedQuery
    .input(
      z.object({
        ticketId: z.string(),
        statusId: z.string(),
        comment: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();

      const { data: ticket } = await supabase.from("tickets").select("*").eq("id", input.ticketId).maybeSingle();
      if (!ticket) throw new Error("Ticket not found");
      if (ctx.user.type === "branch" && ticket.branchId !== ctx.user.id) {
        throw new Error("Access denied");
      }

      const { data: oldStatus } = await supabase
        .from("ticket_statuses")
        .select("*")
        .eq("id", ticket.statusId ?? "")
        .maybeSingle();
      const { data: newStatus } = await supabase
        .from("ticket_statuses")
        .select("*")
        .eq("id", input.statusId)
        .maybeSingle();

      const updateData: Partial<TicketRow> = {
        statusId: input.statusId,
        updatedAt: new Date().toISOString(),
      };

      if (newStatus && !newStatus.isOpen) {
        updateData.closedAt = new Date().toISOString();
        if (newStatus.name === "Solved") {
          updateData.solvedAt = new Date().toISOString();
        }
        // Auto-delete attachments when ticket is closed
        try {
          const { data: attachments } = await supabase
            .from("ticket_attachments")
            .select("filePath")
            .eq("ticketId", input.ticketId);
          if (attachments?.length) {
            const paths = attachments.map(a => a.filePath);
            await supabase.storage.from("ticket-attachments").remove(paths);
            await supabase.from("ticket_attachments").delete().eq("ticketId", input.ticketId);
          }
        } catch { /* cleanup non-critical */ }
      }

      const actorName = getActorName(ctx);

      const { error } = await supabase.from("tickets").update(updateData).eq("id", input.ticketId);
      if (error) throw new Error(error.message);

      await createTimelineEntry({
        ticketId: input.ticketId,
        action: "status_changed",
        actorId: ctx.user.id,
        actorType: ctx.user.type,
        actorName,
        previousValue: oldStatus?.name || "Unknown",
        newValue: newStatus?.name || "Unknown",
        description: input.comment || `Status changed to ${newStatus?.name}`,
      });

      if (ctx.user.type === "branch") {
        await notifyAllAdmins({
          title: "Ticket Status Updated",
          message: `Ticket ${ticket.ticketNumber} status changed to ${newStatus?.name} by ${actorName}`,
          type: "status_changed",
          ticketId: input.ticketId,
        });
      } else {
        await createNotification({
          recipientId: ticket.branchId,
          recipientType: "branch",
          title: "Ticket Status Updated",
          message: `Your ticket ${ticket.ticketNumber} is now ${newStatus?.name}`,
          type: "status_changed",
          ticketId: input.ticketId,
        });
      }

      return { success: true };
    }),

  assign: adminQuery
    .input(
      z.object({
        ticketId: z.string(),
        assignedTo: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();

      const { data: ticket } = await supabase.from("tickets").select("*").eq("id", input.ticketId).maybeSingle();
      if (!ticket) throw new Error("Ticket not found");

      const { data: oldAssignee } = ticket.assignedTo
        ? await supabase.from("profiles").select("*").eq("id", ticket.assignedTo).maybeSingle()
        : { data: null };
      const { data: newAssignee } = input.assignedTo
        ? await supabase.from("profiles").select("*").eq("id", input.assignedTo).maybeSingle()
        : { data: null };

      const { error } = await supabase
        .from("tickets")
        .update({ assignedTo: input.assignedTo || null, updatedAt: new Date().toISOString() })
        .eq("id", input.ticketId);
      if (error) throw new Error(error.message);

      await createTimelineEntry({
        ticketId: input.ticketId,
        action: "assigned",
        actorId: ctx.user.id,
        actorType: "admin",
        actorName: ctx.user.name || "Admin",
        previousValue: oldAssignee?.name || "Unassigned",
        newValue: newAssignee?.name || "Unassigned",
        description: `Ticket assigned to ${newAssignee?.name || "Unassigned"}`,
      });

      await createNotification({
        recipientId: ticket.branchId,
        recipientType: "branch",
        title: "Ticket Assigned",
        message: `Your ticket ${ticket.ticketNumber} has been assigned to ${newAssignee?.name || "staff"}`,
        type: "assigned",
        ticketId: input.ticketId,
      });

      return { success: true };
    }),

  delete: adminQuery
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase
        .from("tickets")
        .update({ isActive: false, updatedAt: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw new Error(error.message);

      await createAuditLog({
        userId: ctx.user.id,
        userType: "admin",
        action: "delete_ticket",
        entityType: "ticket",
        entityId: input.id,
      });

      return { success: true };
    }),

  bulkUpdateStatus: adminQuery
    .input(
      z.object({
        ticketIds: z.array(z.string()),
        statusId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();

      for (const ticketId of input.ticketIds) {
        const { error } = await supabase
          .from("tickets")
          .update({ statusId: input.statusId, updatedAt: new Date().toISOString() })
          .eq("id", ticketId);
        if (error) throw new Error(error.message);

        await createTimelineEntry({
          ticketId,
          action: "status_changed",
          actorId: ctx.user.id,
          actorType: "admin",
          actorName: ctx.user.name || "Admin",
          newValue: "Bulk status update",
        });
      }

      return { success: true, count: input.ticketIds.length };
    }),

  bulkAssign: adminQuery
    .input(
      z.object({
        ticketIds: z.array(z.string()),
        assignedTo: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();

      for (const ticketId of input.ticketIds) {
        const { error } = await supabase
          .from("tickets")
          .update({ assignedTo: input.assignedTo, updatedAt: new Date().toISOString() })
          .eq("id", ticketId);
        if (error) throw new Error(error.message);

        await createTimelineEntry({
          ticketId,
          action: "assigned",
          actorId: ctx.user.id,
          actorType: "admin",
          actorName: ctx.user.name || "Admin",
          newValue: "Bulk assignment",
        });
      }

      return { success: true, count: input.ticketIds.length };
    }),

  // ==================== Form Configuration ====================

  /** Get form config for a specific role (or all roles). */
  getFormConfig: authedQuery
    .input(z.object({ role: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const supabase = getSupabaseAdmin();
      let query = supabase.from("ticket_form_config").select("*").order("role");
      if (input?.role) query = query.eq("role", input.role as any);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data ?? [];
    }),

  /** Admin: upsert form config for a role. */
  upsertFormConfig: adminQuery
    .input(
      z.object({
        role: z.enum(["IT", "Branch Admin", "Manager"]),
        fields: z.array(
          z.object({
            id: z.string(),
            label: z.string().min(1),
            type: z.enum(["text", "textarea", "select", "radio", "checkbox"]),
            required: z.boolean().default(false),
            options: z.array(z.string()).optional(),
            placeholder: z.string().optional(),
            sortOrder: z.number().default(0),
          })
        ),
        filesEnabled: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from("ticket_form_config")
        .upsert(
          { role: input.role, fields: input.fields as any, filesEnabled: input.filesEnabled, updatedAt: new Date().toISOString() },
          { onConflict: "role" }
        )
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    }),

  // ==================== Portal Settings (via system_settings) ====================

  /** Get which roles have the ticket portal enabled. */
  getPortalEnabled: authedQuery.query(async () => {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from("system_settings").select("*").like("key", "ticket_portal_enabled_%");
    const map: Record<string, boolean> = {};
    for (const s of data ?? []) {
      const role = s.key.replace("ticket_portal_enabled_", "");
      map[role] = s.value === "true";
    }
    return map;
  }),

  /** Admin: set portal enabled for a role. */
  setPortalEnabled: adminQuery
    .input(z.object({ role: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const key = `ticket_portal_enabled_${input.role}`;
      const { error } = await supabase.from("system_settings").upsert(
        { key, value: input.enabled ? "true" : "false", updatedAt: new Date().toISOString(), updatedBy: ctx.user.id },
        { onConflict: "key" }
      );
      if (error) throw new Error(error.message);
      return { success: true };
    }),

  /** Record an uploaded file in ticket_attachments. */
  recordAttachment: authedQuery
    .input(
      z.object({
        ticketId: z.string(),
        fileName: z.string(),
        fileType: z.string(),
        fileSize: z.number(),
        filePath: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from("ticket_attachments")
        .insert({
          ticketId: input.ticketId,
          fileName: input.fileName,
          fileType: input.fileType,
          fileSize: input.fileSize,
          filePath: input.filePath,
          uploadedBy: ctx.user.id,
          uploadedByType: ctx.user.type === "admin" ? "admin" : "branch",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return data;
    }),

  /** Delete all attachments for a ticket (storage cleanup). */
  deleteTicketFiles: adminQuery
    .input(z.object({ ticketId: z.string() }))
    .mutation(async ({ input }) => {
      const supabase = getSupabaseAdmin();
      const { data: attachments } = await supabase
        .from("ticket_attachments")
        .select("filePath")
        .eq("ticketId", input.ticketId);
      if (attachments?.length) {
        await supabase.storage.from("ticket-attachments").remove(attachments.map(a => a.filePath));
        await supabase.from("ticket_attachments").delete().eq("ticketId", input.ticketId);
      }
      return { success: true };
    }),
});

async function enrichTicket(supabase: ReturnType<typeof getSupabaseAdmin>, ticket: TicketRow) {
  const { data: status } = await supabase.from("ticket_statuses").select("*").eq("id", ticket.statusId ?? "").maybeSingle();
  const { data: priority } = await supabase.from("ticket_priorities").select("*").eq("id", ticket.priorityId ?? "").maybeSingle();
  const { data: category } = await supabase.from("ticket_categories").select("*").eq("id", ticket.categoryId ?? "").maybeSingle();
  const { data: subcategory } = await supabase
    .from("ticket_subcategories")
    .select("*")
    .eq("id", ticket.subcategoryId ?? "")
    .maybeSingle();
  const { data: branch } = await supabase.from("profiles").select("*").eq("id", ticket.branchId).maybeSingle();
  const { data: assignee } = ticket.assignedTo
    ? await supabase.from("profiles").select("*").eq("id", ticket.assignedTo).maybeSingle()
    : { data: null };
  const { data: attachments } = await supabase
    .from("ticket_attachments")
    .select("*")
    .eq("ticketId", ticket.id)
    .order("createdAt", { ascending: true });

  return {
    ...ticket,
    status: status || null,
    priority: priority || null,
    category: category || null,
    subcategory: subcategory || null,
    branch: branch || null,
    assignee: assignee || null,
    attachments: attachments ?? [],
  };
}
