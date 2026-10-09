import { google } from "googleapis";
import { getSupabaseAdmin } from "./lib/supabase.js";
import { env } from "./lib/env.js";

const GOOGLE_CALLBACK_PATH = "/api/google/callback";

/**
 * Work out the OAuth redirect URI for the current request.
 *
 * Google requires the redirect_uri used at the token exchange to match the one
 * used at the authorization request exactly. Deriving it from the incoming
 * request host keeps that true on localhost, on the Vercel deployment and on
 * any other host, without needing GOOGLE_REDIRECT_URI to be edited per deploy.
 * An explicit env var always wins so it can be pinned if needed.
 */
export function resolveGoogleRedirectUri(req?: Request | null): string {
  if (env.googleRedirectUri) return env.googleRedirectUri;

  if (req) {
    const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    if (forwardedHost) {
      const proto = forwardedProto || (forwardedHost.startsWith("localhost") ? "http" : "https");
      return `${proto}://${forwardedHost}${GOOGLE_CALLBACK_PATH}`;
    }
  }

  return `http://localhost:3000${GOOGLE_CALLBACK_PATH}`;
}

function createOAuth2Client(redirectUri?: string) {
  const oAuth2Client = new google.auth.OAuth2(
    env.googleClientId,
    env.googleClientSecret,
    redirectUri
  );
  return oAuth2Client;
}

export function getGoogleAuthUrl(userId: string, req?: Request | null): string {
  const oAuth2Client = createOAuth2Client(resolveGoogleRedirectUri(req));
  return oAuth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    state: userId,
  });
}

export async function exchangeCodeForTokens(code: string, req?: Request | null) {
  const oAuth2Client = createOAuth2Client(resolveGoogleRedirectUri(req));
  const { tokens } = await oAuth2Client.getToken(code);
  return tokens;
}

export async function getGoogleEmail(accessToken: string): Promise<string> {
  const client = new google.auth.OAuth2();
  client.setCredentials({ access_token: accessToken });
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data } = await oauth2.userinfo.get();
  return data.email || "";
}

async function refreshIfNeeded(userId: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data: auth } = await supabase
    .from("google_auth")
    .select("*")
    .eq("userId", userId)
    .maybeSingle();

  if (!auth) throw new Error("Google account not connected");

  const expiry = new Date(auth.tokenExpiry).getTime();
  if (Date.now() < expiry - 60000) {
    return auth.accessToken;
  }

  const oAuth2Client = createOAuth2Client();
  oAuth2Client.setCredentials({ refresh_token: auth.refreshToken });
  const { credentials } = await oAuth2Client.refreshAccessToken();

  const updatePayload: Partial<{ accessToken: string; refreshToken: string; tokenExpiry: string; updatedAt: string }> = {
    accessToken: credentials.access_token || auth.accessToken,
    tokenExpiry: new Date(credentials.expiry_date ?? Date.now() + 3600000).toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (credentials.refresh_token) {
    updatePayload.refreshToken = credentials.refresh_token;
  }

  await supabase
    .from("google_auth")
    .update(updatePayload)
    .eq("userId", userId);

  return credentials.access_token || auth.accessToken;
}

/** Whether a connected account's refresh token still works. */
export async function isTokenHealthy(userId: string): Promise<{ healthy: boolean; reason?: string }> {
  const supabase = getSupabaseAdmin();
  const { data: auth } = await supabase
    .from("google_auth")
    .select("refreshToken")
    .eq("userId", userId)
    .maybeSingle();
  if (!auth?.refreshToken) return { healthy: false, reason: "Google account not connected" };
  try {
    const oAuth2Client = createOAuth2Client();
    oAuth2Client.setCredentials({ refresh_token: auth.refreshToken });
    await oAuth2Client.refreshAccessToken();
    return { healthy: true };
  } catch (e) {
    return { healthy: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

let systemSenderCache: { id: string | null; expires: number } = { id: null, expires: 0 };
const SYSTEM_SENDER_TTL = 5 * 60 * 1000;

function roleRank(p: { role?: string | null; adminRole?: string | null }): number {
  if (p.role === "admin") return p.adminRole ? 1 : 0;
  if (p.role === "cluster") return 2;
  if (p.role === "branch") return 3;
  return 4;
}

/**
 * Pick a mailbox that can actually send, used when the acting user's own Gmail
 * is missing or its refresh token has been revoked. Prefers an explicit
 * SYSTEM_EMAIL_USER_ID, then the connected main admin, then any connected
 * account. The result is cached briefly to avoid probing on every email.
 */
export async function resolveSystemSenderId(excludeId?: string): Promise<string | null> {
  if (
    Date.now() < systemSenderCache.expires &&
    systemSenderCache.id &&
    systemSenderCache.id !== excludeId
  ) {
    return systemSenderCache.id;
  }

  if (env.systemEmailUserId && env.systemEmailUserId !== excludeId) {
    const { healthy } = await isTokenHealthy(env.systemEmailUserId);
    if (healthy) {
      systemSenderCache = { id: env.systemEmailUserId, expires: Date.now() + SYSTEM_SENDER_TTL };
      return env.systemEmailUserId;
    }
  }

  const supabase = getSupabaseAdmin();
  const { data: auths } = await supabase.from("google_auth").select("userId");
  const connected = new Set((auths ?? []).map((a) => a.userId));

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, role, adminRole, isActive");
  const candidates = (profiles ?? [])
    .filter((p) => connected.has(p.id) && p.id !== excludeId && p.isActive !== false)
    .sort((a, b) => roleRank(a as any) - roleRank(b as any));

  for (const c of candidates) {
    const { healthy } = await isTokenHealthy((c as any).id);
    if (healthy) {
      systemSenderCache = { id: (c as any).id, expires: Date.now() + SYSTEM_SENDER_TTL };
      return (c as any).id;
    }
  }

  systemSenderCache = { id: null, expires: Date.now() + SYSTEM_SENDER_TTL };
  return null;
}

/** Force the next fallback lookup to re-probe (e.g. after a reconnect). */
export function clearSystemSenderCache(): void {
  systemSenderCache = { id: null, expires: 0 };
}

async function trySendFromUser(
  userId: string,
  to: string,
  subject: string,
  htmlBody: string
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const accessToken = await refreshIfNeeded(userId);
    const supabase = getSupabaseAdmin();
    const { data: auth } = await supabase
      .from("google_auth")
      .select("googleEmail")
      .eq("userId", userId)
      .maybeSingle();

    if (!auth?.googleEmail) return { ok: false, reason: "Google account not connected" };

    const fromEmail = auth.googleEmail;
    const RFC2822Message = [
      `From: ${fromEmail}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      ``,
      htmlBody,
    ].join("\r\n");

    const encodedMessage = Buffer.from(RFC2822Message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const gmailClient = createOAuth2Client();
    gmailClient.setCredentials({ access_token: accessToken });

    await google.gmail({ version: "v1", auth: gmailClient }).users.messages.send({
      userId: "me",
      requestBody: { raw: encodedMessage },
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

export async function sendEmailFromUser(
  userId: string,
  to: string,
  subject: string,
  htmlBody: string
): Promise<boolean> {
  const res = await sendEmailFromUserResult(userId, to, subject, htmlBody);
  if (!res.ok) throw new Error(res.reason || "Email sending failed");
  return res.ok;
}

/**
 * Send an email from the given user's Gmail. If that account is not connected
 * or its token has been revoked, automatically retry from a healthy system
 * mailbox so notifications are never silently dropped.
 */
export async function sendEmailFromUserResult(
  userId: string,
  to: string,
  subject: string,
  htmlBody: string,
  opts?: { allowFallback?: boolean }
): Promise<{ ok: boolean; reason?: string; fallback?: boolean }> {
  const primary = await trySendFromUser(userId, to, subject, htmlBody);
  if (primary.ok) return primary;
  if (opts?.allowFallback === false) return primary;

  const fallbackId = await resolveSystemSenderId(userId);
  if (!fallbackId) return primary;

  const fallback = await trySendFromUser(fallbackId, to, subject, htmlBody);
  if (fallback.ok) {
    return {
      ok: true,
      fallback: true,
      reason: `Sent via the system mailbox because the sender's Gmail failed (${primary.reason})`,
    };
  }
  return { ok: false, reason: `${primary.reason}; system mailbox also failed: ${fallback.reason}` };
}

export async function isUserConnected(userId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("google_auth")
    .select("id")
    .eq("userId", userId)
    .maybeSingle();
  return !!data;
}

export async function disconnectGoogle(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase.from("google_auth").delete().eq("userId", userId);
  clearSystemSenderCache();
}
