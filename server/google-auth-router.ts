import { z } from "zod";
import { createRouter, authedQuery } from "./middleware.js";
import { getSupabaseAdmin } from "./lib/supabase.js";
import { createAuditLog } from "./lib/utils.js";
import {
  getGoogleAuthUrl,
  exchangeCodeForTokens,
  getGoogleEmail,
  disconnectGoogle,
  isUserConnected,
} from "./email-service.js";

export const googleAuthRouter = createRouter({
  authUrl: authedQuery.query(async ({ ctx }) => {
    const url = getGoogleAuthUrl(ctx.user.id);
    return { url };
  }),

  callback: authedQuery
    .input(z.object({ code: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const tokens = await exchangeCodeForTokens(input.code);
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

      return { success: true, email: googleEmail };
    }),

  status: authedQuery.query(async ({ ctx }) => {
    const connected = await isUserConnected(ctx.user.id);
    if (!connected) return { connected: false, email: null };

    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("google_auth")
      .select("googleEmail, updatedAt")
      .eq("userId", ctx.user.id)
      .maybeSingle();

    return {
      connected: true,
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
});
