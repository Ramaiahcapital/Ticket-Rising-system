import { z } from "zod";
import { createRouter, authedQuery, mainAdminQuery } from "./middleware.js";
import { getSupabaseAdmin } from "./lib/supabase.js";
import { createAuditLog } from "./lib/utils.js";
import {
  getGoogleAuthUrl,
  exchangeCodeForTokens,
  getGoogleEmail,
  disconnectGoogle,
  isUserConnected,
  isTokenHealthy,
  clearSystemSenderCache,
  resolveSystemSenderId,
} from "./email-service.js";

export const googleAuthRouter = createRouter({
  authUrl: authedQuery.query(async ({ ctx }) => {
    const url = getGoogleAuthUrl(ctx.user.id, ctx.req);
    return { url };
  }),

  callback: authedQuery
    .input(z.object({ code: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const tokens = await exchangeCodeForTokens(input.code, ctx.req);
      if (!tokens.access_token || !tokens.refresh_token) {
        throw new Error("Failed to get Google tokens");
      }

      const googleEmail = await getGoogleEmail(tokens.access_token);

      const tokenExpiry = tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : new Date(Date.now() + 3600000).toISOString();

      await supabase.from("google_auth").upsert(
        {
          userId: ctx.user.id,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiry,
          googleEmail,
          updatedAt: new Date().toISOString(),
        },
        { onConflict: "userId" }
      );

      const userType = ctx.user.role === "admin" ? "admin" : ctx.user.role === "branch" ? "branch" : "system";
      await createAuditLog({
        userId: ctx.user.id,
        userType,
        userName: ctx.user.name ?? undefined,
        action: "connect_email",
        entityType: "googleAuth",
        entityId: ctx.user.id,
        details: { email: googleEmail },
      });

      clearSystemSenderCache();

      return { success: true, email: googleEmail };
    }),

  status: authedQuery.query(async ({ ctx }) => {
    const connected = await isUserConnected(ctx.user.id);
    if (!connected) return { connected: false, healthy: false, email: null, reason: null, connectedAt: null };

    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("google_auth")
      .select("googleEmail, updatedAt")
      .eq("userId", ctx.user.id)
      .maybeSingle();

    const health = await isTokenHealthy(ctx.user.id);

    return {
      connected: true,
      healthy: health.healthy,
      reason: health.reason ?? null,
      email: data?.googleEmail || null,
      connectedAt: data?.updatedAt || null,
    };
  }),

  disconnect: authedQuery.mutation(async ({ ctx }) => {
    await disconnectGoogle(ctx.user.id);
    const userType = ctx.user.role === "admin" ? "admin" : ctx.user.role === "branch" ? "branch" : "system";
    await createAuditLog({
      userId: ctx.user.id,
      userType,
      userName: ctx.user.name ?? undefined,
      action: "disconnect_email",
      entityType: "googleAuth",
      entityId: ctx.user.id,
    });
    return { success: true };
  }),

  /**
   * Main-admin overview of every connected mailbox and whether it can still
   * send. Shows which mailbox is currently acting as the system fallback.
   */
  health: mainAdminQuery.query(async () => {
    const supabase = getSupabaseAdmin();
    const { data: auths } = await supabase
      .from("google_auth")
      .select("userId, googleEmail, updatedAt");

    const ids = (auths ?? []).map((a) => a.userId);
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id, name, email, role, adminRole").in("id", ids)
      : { data: [] as any[] };
    const byId = new Map((profiles ?? []).map((p) => [(p as any).id, p as any]));

    const accounts = [];
    for (const a of auths ?? []) {
      const p = byId.get(a.userId);
      const h = await isTokenHealthy(a.userId);
      accounts.push({
        userId: a.userId,
        email: a.googleEmail,
        name: p?.name ?? null,
        role: p?.role ?? null,
        adminRole: p?.adminRole ?? null,
        healthy: h.healthy,
        reason: h.reason ?? null,
        connectedAt: a.updatedAt ?? null,
      });
    }

    const sysId = await resolveSystemSenderId();
    const sys = accounts.find((x) => x.userId === sysId) ?? null;

    return {
      accounts,
      systemSender: sys ? { email: sys.email, name: sys.name } : null,
    };
  }),
});
