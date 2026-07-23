import type { IncomingMessage, ServerResponse } from "http";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../server/router.js";
import { createContext } from "../server/context.js";

const app = new Hono();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));

// Google OAuth callback
app.get("/api/google/callback", async (c) => {
  const url = new URL(c.req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return c.redirect("/#/settings?google=error");
  }

  try {
    const { exchangeCodeForTokens, getGoogleEmail } = await import("./email-service.js");
    const { getSupabaseAdmin } = await import("./lib/supabase.js");

    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      return c.redirect("/#/settings?google=error");
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

    return c.redirect("/#/settings?google=connected");
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return c.redirect("/#/settings?google=error");
  }
});

// Supabase keep-alive — Vercel cron pings this daily to prevent free-tier pause
app.get("/api/health", async (c) => {
  const { getSupabaseAdmin } = await import("./lib/supabase.js");
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("profiles").select("id").limit(1);
  if (error) return c.json({ status: "error", message: error.message }, 500);
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});

app.all("*", (c) => c.json({ error: "Not Found" }, 404));

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const protocol = "https";
  const host = req.headers.host || "localhost";
  const url = `${protocol}://${host}${req.url || "/"}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) {
      headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }
  }

  let body: string | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks).toString()));
      req.on("error", reject);
    });
  }

  const request = new Request(url, {
    method: req.method || "GET",
    headers,
    body: body || undefined,
  });

  const response = await app.fetch(request);

  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  const responseBody = await response.text();
  res.end(responseBody);
}
