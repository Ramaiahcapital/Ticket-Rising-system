import { z } from "zod";
import { createRouter, authedQuery, adminQuery, publicQuery } from "./middleware.js";
import { getSupabaseAdmin } from "./lib/supabase.js";
import type { TicketRow } from "./lib/db-types.js";
import {
  generateTicketNumber,
  createTimelineEntry,
  createNotification,
  createAuditLog,
  requireRoleExists,
  getTicketScopeFilter,
  canAdminAccessTicket,
  getRoleAdminRecipients,
  notifyRoleAdmins,
  hasTransferAccess,
  getUserEmail,
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
        branchRole: z.string().max(100).optional(),
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

      const scope = getTicketScopeFilter(ctx.user);
      if (scope) query = query.eq("branchRole", scope.branchRole);

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
      const { data: branchRows } = await supabase.from("branches").select("id, name");

      const statusMap = new Map((statuses ?? []).map((s) => [s.id, s]));
      const priorityMap = new Map((priorities ?? []).map((p) => [p.id, p]));
      const categoryMap = new Map((categories ?? []).map((c) => [c.id, c]));
      const profileMap = new Map((profiles ?? []).map((b) => [b.id, b]));
      const branchMap = new Map((branchRows ?? []).map((b) => [b.id, b.name]));

      const enrichedItems = (items ?? []).map((t) => {
        const profile = profileMap.get(t.branchId ?? "") || null;
        const branchName = profile?.branchName || branchMap.get(profile?.branchId ?? "") || null;
        return {
          ...t,
          status: statusMap.get(t.statusId ?? "") || null,
          priority: priorityMap.get(t.priorityId ?? "") || null,
          category: categoryMap.get(t.categoryId ?? "") || null,
          branch: profile ? { ...profile, branchName } : null,
          assignee: profileMap.get(t.assignedTo ?? "") || null,
        };
      });

      const total = count ?? 0;
      return {
        items: enrichedItems,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(total / params.limit),
      };
    }),

  departmentCounts: adminQuery.query(async ({ ctx }) => {
    const supabase = getSupabaseAdmin();
    const { data: openStatus } = await supabase
      .from("ticket_statuses")
      .select("id")
      .eq("name", "Open")
      .maybeSingle();

    let query = supabase.from("tickets").select("branchRole");
    if (openStatus) query = query.eq("statusId", openStatus.id);
    const scope = getTicketScopeFilter(ctx.user);
    if (scope) query = query.eq("branchRole", scope.branchRole);
    const { data: tickets } = await query;

    const { data: roles } = await supabase
      .from("branch_roles")
      .select("*")
      .order("sortOrder", { ascending: true });

    const counts: Record<string, number> = {};
    for (const r of roles ?? []) counts[r.name] = 0;
    for (const t of tickets ?? []) {
      const role = (t as any).branchRole as string | undefined;
      if (role && role in counts) counts[role]++;
    }
    let result = (roles ?? []).map((r) => ({
      name: r.name,
      count: counts[r.name] ?? 0,
      color: r.color,
    }));
    if (scope) {
      result = result.filter((r) => r.name === scope.branchRole);
    }
    return result;
  }),

  listExport: adminQuery
    .input(
      z.object({
        search: z.string().optional(),
        statusId: z.string().optional(),
        branchId: z.string().optional(),
        branchRole: z.string().max(100).optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const params = input || {};

      let query = supabase.from("tickets").select("*", { count: "exact" });

      const scope = getTicketScopeFilter(ctx.user);
      if (scope) query = query.eq("branchRole", scope.branchRole);

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

      let hasAccess = false;
      if (ctx.user.type === "branch" && ticket.branchId === ctx.user.id) hasAccess = true;
      else if (ctx.user.type === "admin" && canAdminAccessTicket(ctx.user, ticket.branchRole)) hasAccess = true;
      else if (ctx.user.type === "cluster") hasAccess = true;
      if (!hasAccess) {
        const email = await getUserEmail(ctx.user);
        if (await hasTransferAccess(ctx.user.id, email, input.id)) hasAccess = true;
      }
      if (!hasAccess) throw new Error("Access denied");
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
      if (ctx.user.type === "admin" && !canAdminAccessTicket(ctx.user, ticket.branchRole)) {
        throw new Error("Access denied");
      }
      return await enrichTicket(supabase, ticket);
    }),

  create: authedQuery
    .input(
      z.object({
        subject: z.string().trim().min(1).max(50),
        description: z.string().min(20),
        categoryId: z.string().optional(),
        subcategoryId: z.string().optional(),
        priorityId: z.string().optional(),
        department: z.string().optional(),
        branchRole: z.string().min(1).max(100).optional(),
        customFields: z.record(z.string(), z.any()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();

      if (ctx.user.type !== "branch") {
        throw new Error("Only branch users can create tickets");
      }

      if (input.branchRole) {
        await requireRoleExists(supabase, input.branchRole);
      }

      const ticketNumber = await generateTicketNumber();

      const subject = input.subject.trim();

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

      const ticketRole = input.branchRole ?? creator?.branchRole ?? null;

      const { data, error } = await supabase
        .from("tickets")
        .insert({
          ticketNumber,
          subject,
          description: input.description,
          categoryId: input.categoryId ?? null,
          subcategoryId: input.subcategoryId ?? null,
          priorityId: input.priorityId ?? null,
          statusId: defaultStatuses?.[0]?.id ?? null,
          department: input.department ?? null,
          branchRole: ticketRole,
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
        details: { ticketNumber, subject },
      });

      await notifyRoleAdmins(ticketRole, {
        title: "New Ticket Created",
        message: `Ticket ${ticketNumber} - ${subject} was created by ${actorName}`,
        type: "ticket_created",
        ticketId,
      });

      // Send email from branch user to the admins relevant to this ticket's department
      try {
        const supabase = getSupabaseAdmin();

        // Check if email notifications are enabled for this role
        let emailEnabled = true;
        if (ticketRole) {
          const { data: roleSetting } = await supabase
            .from("branch_roles")
            .select("emailNotifications")
            .eq("name", ticketRole)
            .maybeSingle();
          if (roleSetting?.emailNotifications === false) emailEnabled = false;
        }
        if (emailEnabled) {
          const admins = await getRoleAdminRecipients(ticketRole, { activeOnly: true });
          const { data: sender } = await supabase
            .from("profiles")
            .select("branchName, email")
            .eq("id", ctx.user.id)
            .maybeSingle();
          if (admins.length && sender?.email) {
            const branchLabel = sender.branchName || "Branch";
            for (const admin of admins) {
              if (admin.email) {
                await sendEmailFromUser(
                  ctx.user.id,
                  admin.email,
                  `New Ticket: ${ticketNumber} - ${subject}`,
                  `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                    <h2 style="color:#DC2626;">New Support Ticket</h2>
                    <table style="width:100%;border-collapse:collapse;">
                      <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Ticket #</td><td style="padding:8px;border-bottom:1px solid #eee;">${ticketNumber}</td></tr>
                      <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Subject</td><td style="padding:8px;border-bottom:1px solid #eee;">${subject}</td></tr>
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
      if (ctx.user.type === "admin" && !canAdminAccessTicket(ctx.user, ticket.branchRole)) {
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
      let hasAccess = false;
      if (ctx.user.type === "branch" && ticket.branchId === ctx.user.id) hasAccess = true;
      else if (ctx.user.type === "admin" && canAdminAccessTicket(ctx.user, ticket.branchRole)) hasAccess = true;
      else if (ctx.user.type === "cluster") hasAccess = true;
      if (!hasAccess) {
        const email = await getUserEmail(ctx.user);
        if (await hasTransferAccess(ctx.user.id, email, input.ticketId)) hasAccess = true;
      }
      if (!hasAccess) throw new Error("Access denied");

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
        statusChangedAt: new Date().toISOString(),
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

      // Try to persist statusChangedAt; fall back gracefully if the column doesn't exist yet
      let error: any = null;
      try {
        const res = await supabase.from("tickets").update(updateData).eq("id", input.ticketId);
        error = res.error;
      } catch (e) {
        error = e;
      }
      if (error && String(error.message).includes("statusChangedAt")) {
        const { statusChangedAt, ...safe } = updateData;
        const retry = await supabase.from("tickets").update(safe).eq("id", input.ticketId);
        error = retry.error;
      }
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
        await notifyRoleAdmins(ticket.branchRole, {
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
      if (!canAdminAccessTicket(ctx.user, ticket.branchRole)) {
        throw new Error("Access denied");
      }

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
      const { data: ticket } = await supabase.from("tickets").select("id, branchRole").eq("id", input.id).maybeSingle();
      if (ticket && !canAdminAccessTicket(ctx.user, ticket.branchRole)) {
        throw new Error("Access denied");
      }
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
        const { data: t } = await supabase.from("tickets").select("branchRole").eq("id", ticketId).maybeSingle();
        if (t && !canAdminAccessTicket(ctx.user, t.branchRole)) {
          throw new Error("Access denied");
        }
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
        const { data: t } = await supabase.from("tickets").select("branchRole").eq("id", ticketId).maybeSingle();
        if (t && !canAdminAccessTicket(ctx.user, t.branchRole)) {
          throw new Error("Access denied");
        }
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
        role: z.string().min(1).max(100),
        fields: z.array(
          z.object({
            id: z.string(),
            label: z.string().min(1),
            type: z.enum(["text", "textarea", "select", "radio", "checkbox"]),
            required: z.boolean().default(false),
            options: z.array(z.string()).optional(),
            placeholder: z.string().optional(),
            sortOrder: z.number().default(0),
            dependsOn: z.object({ fieldId: z.string(), value: z.string() }).optional(),
          })
        ),
        filesEnabled: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      const supabase = getSupabaseAdmin();
      await requireRoleExists(supabase, input.role);
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
        commentId: z.string().optional(),
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
          commentId: input.commentId || null,
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
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { data: t } = await supabase.from("tickets").select("branchRole").eq("id", input.ticketId).maybeSingle();
      if (t && !canAdminAccessTicket(ctx.user, t.branchRole)) {
        throw new Error("Access denied");
      }
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

  /** Manually notify the branch user via email about an admin reply. */
  notifyBranch: adminQuery
    .input(z.object({ ticketId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { data: ticket } = await supabase
        .from("tickets")
        .select("*")
        .eq("id", input.ticketId)
        .maybeSingle();
      if (!ticket) throw new Error("Ticket not found");
      if (!canAdminAccessTicket(ctx.user, ticket.branchRole)) {
        throw new Error("Access denied");
      }

      const { data: branchProfile } = await supabase
        .from("profiles")
        .select("email, branchName")
        .eq("id", ticket.branchId)
        .maybeSingle();
      if (!branchProfile?.email) throw new Error("Branch user email not found");

      const actorName = getActorName(ctx);
      const htmlBody = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#DC2626;">Update on your ticket ${ticket.ticketNumber}</h2>
        <p>A reply has been posted on your ticket <strong>${ticket.ticketNumber} — ${ticket.subject}</strong> by ${actorName}.</p>
        <p>Please log in to the Ticket Management System to view the latest reply.</p>
        <p style="margin-top:16px;color:#666;">Ramaiah Capital Ticket Management System</p>
      </div>`;

      try {
        await sendEmailFromUser(
          ctx.user.id,
          branchProfile.email,
          `Update on Ticket: ${ticket.ticketNumber} - ${ticket.subject}`,
          htmlBody
        );
      } catch (e) {
        console.error("Notify branch email failed:", e);
        throw new Error("Failed to send email. Make sure your Google account is connected in Email Settings.");
      }

      await createNotification({
        recipientId: ticket.branchId,
        recipientType: "branch",
        title: "Admin Reply",
        message: `Admin replied on your ticket ${ticket.ticketNumber}`,
        type: "comment_added",
        ticketId: input.ticketId,
      });

      return { success: true };
    }),

  /** Transfer a ticket to another user by email. */
  transfer: adminQuery
    .input(z.object({ ticketId: z.string(), toEmail: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const db = supabase as any;
      const { data: ticket } = await supabase
        .from("tickets")
        .select("*")
        .eq("id", input.ticketId)
        .maybeSingle();
      if (!ticket) throw new Error("Ticket not found");
      if (!canAdminAccessTicket(ctx.user, ticket.branchRole)) {
        throw new Error("Access denied");
      }

      const token = crypto.randomUUID().replace(/-/g, "") + Date.now().toString(36);
      const { error: insertError } = await db.from("ticket_transfers").insert({
        ticket_id: input.ticketId,
        from_user_id: ctx.user.id,
        to_email: input.toEmail.toLowerCase().trim(),
        token,
        status: "pending",
      });
      if (insertError) throw new Error(insertError.message);

      const actorName = getActorName(ctx);
      const portalUrl = `https://rcpl-ticket.vercel.app/#/transfer/${token}`;

      try {
        await sendEmailFromUser(
          ctx.user.id,
          input.toEmail.toLowerCase().trim(),
          `Ticket Transferred: ${ticket.ticketNumber} - ${ticket.subject}`,
          `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <h2 style="color:#DC2626;">Ticket Transferred to You</h2>
            <p><strong>${actorName}</strong> has transferred ticket <strong>${ticket.ticketNumber} — ${ticket.subject}</strong> to you.</p>
            <p>Click the link below to view and manage this ticket:</p>
            <a href="${portalUrl}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#DC2626;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">View Ticket</a>
            <p style="margin-top:16px;color:#666;font-size:12px;">If you don't have an account yet, please contact your administrator to create one with this email address.</p>
          </div>`
        );
      } catch (e) {
        console.error("Transfer email failed:", e);
        throw new Error("Transfer created but email failed. Make sure your Google account is connected in Email Settings.");
      }

      await createNotification({
        recipientId: ticket.branchId,
        recipientType: "branch",
        title: "Ticket Transferred",
        message: `Ticket ${ticket.ticketNumber} has been transferred to ${input.toEmail}`,
        type: "ticket_transferred",
        ticketId: input.ticketId,
      });

      return { success: true };
    }),

  /** List tickets transferred to the current user by email. */
  listTransferred: authedQuery
    .input(z.object({ page: z.number().default(1), limit: z.number().default(10) }).optional())
    .query(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const db = supabase as any;
      const params = input ?? { page: 1, limit: 10 };
      const user = ctx.user;
      if (!user) throw new Error("Not authenticated");

      let userEmail: string | null = null;
      if (user.type === "branch") userEmail = user.email;
      else if (user.type === "admin") {
        const { data: profile } = await supabase.from("profiles").select("email").eq("id", user.id).maybeSingle();
        userEmail = profile?.email ?? null;
      } else if (user.type === "cluster") {
        const { data: profile } = await supabase.from("profiles").select("email").eq("id", user.id).maybeSingle();
        userEmail = profile?.email ?? null;
      }
      if (!userEmail) return { items: [], total: 0, page: params.page, limit: params.limit, totalPages: 0 };

      const from = (params.page - 1) * params.limit;

      const { data: transfers, count } = await db
        .from("ticket_transfers")
        .select("ticket_id, id, from_user_id, to_email, status, created_at", { count: "exact" })
        .eq("to_email", userEmail.toLowerCase().trim())
        .eq("status", "accepted")
        .order("created_at", { ascending: false })
        .range(from, from + params.limit - 1);

      if (!transfers?.length) return { items: [], total: count ?? 0, page: params.page, limit: params.limit, totalPages: Math.ceil((count ?? 0) / params.limit) };

      const ticketIds = transfers.map((t: any) => t.ticket_id);
      const { data: tickets } = await supabase.from("tickets").select("*").in("id", ticketIds);
      const ticketMap = new Map((tickets ?? []).map((t: any) => [t.id, t]));

      const { data: statuses } = await supabase.from("ticket_statuses").select("*");
      const { data: priorities } = await supabase.from("ticket_priorities").select("*");
      const { data: profiles } = await supabase.from("profiles").select("*");

      const statusMap = new Map((statuses ?? []).map((s: any) => [s.id, s]));
      const priorityMap = new Map((priorities ?? []).map((p: any) => [p.id, p]));
      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

      const items = transfers
        .map((tr: any) => {
          const t = ticketMap.get(tr.ticket_id);
          if (!t) return null;
          return {
            ...t,
            status: statusMap.get(t.statusId ?? "") || null,
            priority: priorityMap.get(t.priorityId ?? "") || null,
            assignee: profileMap.get(t.assignedTo ?? "") || null,
            branch: profileMap.get(t.branchId) || null,
            transferId: tr.id,
            transferredAt: tr.created_at,
          };
        })
        .filter(Boolean);

      return {
        items,
        total: count ?? 0,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil((count ?? 0) / params.limit),
      };
    }),

  /** Accept a ticket transfer. */
  acceptTransfer: authedQuery
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const db = supabase as any;

      const { data: transfer } = await db
        .from("ticket_transfers")
        .select("*")
        .eq("token", input.token)
        .maybeSingle();
      if (!transfer) throw new Error("Invalid transfer link");
      if (transfer.status !== "pending") throw new Error("This transfer has already been processed");

      const user = ctx.user;
      if (!user) throw new Error("Not authenticated");

      let userEmail: string | null = null;
      if (user.type === "branch") userEmail = user.email;
      else {
        const { data: profile } = await supabase.from("profiles").select("email").eq("id", user.id).maybeSingle();
        userEmail = profile?.email ?? null;
      }

      if (!userEmail || userEmail.toLowerCase().trim() !== transfer.to_email.toLowerCase().trim()) {
        throw new Error("This transfer is intended for a different email address. Please log in with the correct account.");
      }

      const { error } = await db
        .from("ticket_transfers")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("id", transfer.id);
      if (error) throw new Error(error.message);

      return { ticketId: transfer.ticket_id, success: true };
    }),

  /** Get a ticket by transfer token (for invite link). */
  byTransferToken: publicQuery
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const supabase = getSupabaseAdmin();
      const db = supabase as any;

      const { data: transfer } = await db
        .from("ticket_transfers")
        .select("id, ticket_id, to_email, from_user_id, status")
        .eq("token", input.token)
        .maybeSingle();
      if (!transfer) throw new Error("Invalid transfer link");

      // If pending → show "Request Access" form
      if (transfer.status === "pending") {
        return { status: "pending" as const, transferId: transfer.id, toEmail: transfer.to_email };
      }

      // If requested → show "Waiting for approval" message
      if (transfer.status === "requested") {
        return { status: "requested" as const, transferId: transfer.id, toEmail: transfer.to_email };
      }

      // If accepted → return ticket data (but need to verify email)
      // For accepted, the user must be logged in so we can check their email
      return { status: "accepted" as const, transferId: transfer.id, toEmail: transfer.to_email, ticketId: transfer.ticket_id };
    }),

  /** Request access to a transferred ticket (recipient types email — no login needed). */
  requestTransferAccess: publicQuery
    .input(z.object({ token: z.string(), email: z.string().email() }))
    .mutation(async ({ input }) => {
      const supabase = getSupabaseAdmin();
      const db = supabase as any;

      const { data: transfer } = await db
        .from("ticket_transfers")
        .select("*")
        .eq("token", input.token)
        .maybeSingle();
      if (!transfer) throw new Error("Invalid transfer link");
      if (transfer.status !== "pending") throw new Error("This transfer has already been processed");

      // Email must match the transfer's target email
      if (input.email.toLowerCase().trim() !== transfer.to_email.toLowerCase().trim()) {
        throw new Error("This email does not match the transfer recipient. Please use the correct email.");
      }

      // Update status to requested
      const { error } = await db
        .from("ticket_transfers")
        .update({ status: "requested" })
        .eq("id", transfer.id);
      if (error) throw new Error(error.message);

      const { data: ticket } = await supabase.from("tickets").select("ticketNumber, subject").eq("id", transfer.ticket_id).maybeSingle();

      // Create in-app notification for the transferer
      await createNotification({
        recipientId: transfer.from_user_id,
        recipientType: "admin",
        title: "Transfer Access Requested",
        message: `${input.email} has requested access to ticket ${ticket?.ticketNumber || ""}`,
        type: "transfer_access_requested",
        ticketId: transfer.ticket_id,
      });

      // Send email to the transferer from their own connected Google account
      try {
        await sendEmailFromUser(
          transfer.from_user_id,
          transfer.to_email,
          `Access Requested: ${ticket?.ticketNumber || ""} - ${ticket?.subject || ""}`,
          `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <h2 style="color:#DC2626;">Transfer Access Requested</h2>
            <p><strong>${input.email}</strong> has requested access to ticket <strong>${ticket?.ticketNumber || ""} — ${ticket?.subject || ""}</strong>.</p>
            <p>Please log in to the Ticket Management System to grant access.</p>
            <p style="margin-top:16px;color:#666;">Ramaiah Capital Ticket Management System</p>
          </div>`
        );
      } catch (e) {
        console.error("Transfer request email failed:", e);
      }

      return { success: true };
    }),

  /** Grant access to a transferred ticket (transferer approves). */
  grantTransferAccess: adminQuery
    .input(z.object({ transferId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const db = supabase as any;

      const { data: transfer } = await db
        .from("ticket_transfers")
        .select("*")
        .eq("id", input.transferId)
        .maybeSingle();
      if (!transfer) throw new Error("Transfer not found");
      if (transfer.status !== "requested") throw new Error("This transfer is not pending approval");
      if (transfer.from_user_id !== ctx.user.id) throw new Error("Only the person who transferred this ticket can grant access");

      const { error } = await db
        .from("ticket_transfers")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("id", input.transferId);
      if (error) throw new Error(error.message);

      // Notify the recipient
      const { data: ticket } = await supabase.from("tickets").select("ticketNumber, subject").eq("id", transfer.ticket_id).maybeSingle();

      // Create in-app notification for the recipient (by email)
      const { data: recipientProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", transfer.to_email)
        .maybeSingle();
      if (recipientProfile) {
        await createNotification({
          recipientId: recipientProfile.id,
          recipientType: "admin",
          title: "Transfer Access Granted",
          message: `You have been granted access to ticket ${ticket?.ticketNumber || ""}`,
          type: "transfer_access_granted",
          ticketId: transfer.ticket_id,
        });
      }

      // Send email to recipient
      try {
        await sendEmailFromUser(
          ctx.user.id,
          transfer.to_email,
          `Access Granted: ${ticket?.ticketNumber || ""} - ${ticket?.subject || ""}`,
          `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <h2 style="color:#16A34A;">Transfer Access Granted</h2>
            <p>You have been granted access to ticket <strong>${ticket?.ticketNumber || ""} — ${ticket?.subject || ""}</strong>.</p>
            <p>Please log in to the Ticket Management System to view and manage this ticket.</p>
            <p style="margin-top:16px;color:#666;">Ramaiah Capital Ticket Management System</p>
          </div>`
        );
      } catch (e) {
        console.error("Grant access email failed:", e);
      }

      return { success: true };
    }),

  /** List pending transfer requests (for the transferer to approve). */
  listPendingTransferRequests: adminQuery
    .query(async ({ ctx }) => {
      const supabase = getSupabaseAdmin();
      const db = supabase as any;

      const { data: transfers } = await db
        .from("ticket_transfers")
        .select("id, ticket_id, to_email, status, created_at")
        .eq("from_user_id", ctx.user.id)
        .eq("status", "requested")
        .order("created_at", { ascending: false });
      if (!transfers?.length) return [];

      const ticketIds = transfers.map((t: any) => t.ticket_id);
      const { data: tickets } = await supabase.from("tickets").select("id, ticketNumber, subject").in("id", ticketIds);
      const ticketMap = new Map((tickets ?? []).map((t: any) => [t.id, t]));

      return transfers.map((tr: any) => ({
        id: tr.id,
        ticketId: tr.ticket_id,
        toEmail: tr.to_email,
        status: tr.status,
        createdAt: tr.created_at,
        ticket: ticketMap.get(tr.ticket_id) || null,
      }));
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
