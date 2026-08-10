import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router.js";
import { createContext } from "./context.js";
import { env } from "./lib/env.js";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));

// Google OAuth callback — exchanges code for tokens and redirects back
app.get("/api/google/callback", async (c) => {
  const url = new URL(c.req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // userId

  if (!code || !state) {
    return c.redirect("/#/email-settings?google=error");
  }

  try {
    const { exchangeCodeForTokens, getGoogleEmail } = await import("./email-service.js");
    const { getSupabaseAdmin } = await import("./lib/supabase.js");

    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      return c.redirect("/#/email-settings?google=error");
    }

    const googleEmail = await getGoogleEmail(tokens.access_token);
    const supabase = getSupabaseAdmin();
    const tokenExpiry = tokens.expiry_date
      ? new Date(tokens.expiry_date).toISOString()
      : new Date(Date.now() + 3600000).toISOString();

    await supabase.from("google_auth").upsert(
      {
        userId: state,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry,
        googleEmail,
        updatedAt: new Date().toISOString(),
      },
      { onConflict: "userId" }
    );

    return c.redirect("/#/email-settings?google=connected");
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return c.redirect("/#/email-settings?google=error");
  }
});

app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
