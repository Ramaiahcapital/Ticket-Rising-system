import { z } from "zod";
import { createRouter, authedQuery } from "./middleware.js";
import { getSupabaseAdmin } from "./lib/supabase.js";
import { createTimelineEntry, createNotification, canAdminAccessTicket, getRoleAdminRecipients, notifyRoleAdmins } from "./lib/utils.js";
import { sendEmailFromUser } from "./email-service.js";

function sanitizeHtml(html: string): string {
  return html
    .replace(/<\s*(script|iframe|object|embed|form)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|iframe|object|embed|form)[^>]*\/?\s*>/gi, "")
    .replace(/\s(on\w+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<meta[^>]*>/gi, "");
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote|pre)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const ticketCommentRouter = createRouter({
  list: authedQuery
    .input(z.object({ ticketId: z.string() }))
    .query(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();

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

      let query = supabase
        .from("ticket_comments")
        .select("*")
        .eq("ticketId", input.ticketId);
      if (ctx.user.type === "branch") {
        query = query.eq("isInternal", false);
      }

      const { data: comments } = await query.order("createdAt", { ascending: true });

      const commentIds = (comments ?? []).map(c => c.id);
      const { data: attachments } =
        commentIds.length > 0
          ? await supabase
              .from("ticket_attachments")
              .select("*")
              .in("commentId", commentIds)
          : { data: [] as any[] };

      return (comments ?? []).map(c => ({
        ...c,
        attachments: (attachments ?? []).filter(a => a.commentId === c.id),
      }));
    }),

  create: authedQuery
    .input(
      z.object({
        ticketId: z.string(),
        content: z.string().min(1),
        contentHtml: z.string().optional(),
        isInternal: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();

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

      if (ctx.user.type === "branch" && input.isInternal) {
        throw new Error("Branch users cannot create internal notes");
      }

      const actorName = ctx.user.type === "admin"
        ? (ctx.user.name || "Admin")
        : (ctx.user.name || (ctx.user as { branchName?: string | null }).branchName || "Branch");

      const { data, error } = await supabase
        .from("ticket_comments")
        .insert({
          ticketId: input.ticketId,
          content: input.contentHtml ? htmlToPlainText(input.contentHtml) || input.content : input.content,
          contentHtml: input.contentHtml ? sanitizeHtml(input.contentHtml) : null,
          authorId: ctx.user.id,
          authorType: ctx.user.type,
          authorName: actorName,
          isInternal: ctx.user.type === "admin" ? input.isInternal : false,
        })
        .select("id")
        .single();

      if (error) throw new Error(error.message);

      const commentId = data.id;

      await createTimelineEntry({
        ticketId: input.ticketId,
        action: "comment_added",
        actorId: ctx.user.id,
        actorType: ctx.user.type,
        actorName,
        description: `Comment added by ${actorName}`,
      });

      const plainText = htmlToPlainText(input.contentHtml ?? input.content) || input.content;
      const emailBody = (from: string) =>
        `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#DC2626;">New reply on ticket ${ticket.ticketNumber}</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Ticket</td><td style="padding:8px;border-bottom:1px solid #eee;">${ticket.ticketNumber} — ${ticket.subject}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">From</td><td style="padding:8px;border-bottom:1px solid #eee;">${from}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Reply</td><td style="padding:8px;border-bottom:1px solid #eee;">${plainText.replace(/\n/g, "<br/>")}</td></tr>
          </table>
          <p style="margin-top:16px;color:#666;">Ramaiah Capital Ticket Management System</p>
        </div>`;

      if (ctx.user.type === "branch") {
        await notifyRoleAdmins(ticket.branchRole, {
          title: "New Comment",
          message: `New comment on ticket ${ticket.ticketNumber} from ${actorName}`,
          type: "comment_added",
          ticketId: input.ticketId,
        });
      } else {
        await createNotification({
          recipientId: ticket.branchId,
          recipientType: "branch",
          title: "New Comment",
          message: `New comment on your ticket ${ticket.ticketNumber}`,
          type: "comment_added",
          ticketId: input.ticketId,
        });
        await notifyRoleAdmins(ticket.branchRole, {
          title: "New Comment",
          message: `New comment on ticket ${ticket.ticketNumber} from ${actorName}`,
          type: "comment_added",
          ticketId: input.ticketId,
          excludeId: ctx.user.id,
        });

        // Email the branch user and the other admins in the matching bucket
        try {
          const { data: branchProfile } = await supabase
            .from("profiles")
            .select("email, branchName")
            .eq("id", ticket.branchId)
            .maybeSingle();
          if (branchProfile?.email) {
            await sendEmailFromUser(
              ctx.user.id,
              branchProfile.email,
              `Re: ${ticket.ticketNumber} - ${ticket.subject}`,
              emailBody(actorName)
            );
          }
          const admins = await getRoleAdminRecipients(ticket.branchRole, { activeOnly: true, excludeId: ctx.user.id });
          for (const admin of admins) {
            if (admin.email) {
              await sendEmailFromUser(
                ctx.user.id,
                admin.email,
                `Re: ${ticket.ticketNumber} - ${ticket.subject}`,
                emailBody(actorName)
              );
            }
          }
        } catch (e) { console.error("Reply email failed:", e); }
      }

      return { id: commentId, content: input.content, contentHtml: input.contentHtml ?? null };
    }),

  delete: authedQuery
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();

      const { data: comment } = await supabase
        .from("ticket_comments")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();
      if (!comment) throw new Error("Comment not found");

      if (ctx.user.type === "branch" && comment.authorId !== ctx.user.id) {
        throw new Error("Access denied");
      }

      const { error } = await supabase.from("ticket_comments").delete().eq("id", input.id);
      if (error) throw new Error(error.message);
      return { success: true };
    }),
});
