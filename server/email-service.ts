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
      const proto = forwardedProto || (forwardedHost.includes("localhost") ? "http" : "https");
      return `${proto}://${forwardedHost}${GOOGLE_CALLBACK_PATH}`;
    }
  }

  return `http://localhost:3000${GOOGLE_CALLBACK_PATH}`;
}

function createOAuth2Client(redirectUri?: string) {
  return new google.auth.OAuth2(
    env.googleClientId,
    env.googleClientSecret,
    redirectUri
  );
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

export async function sendEmailFromUserResult(
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

    if (!auth) return { ok: false, reason: "Google account not connected" };

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
    const gmail = google.gmail({ version: "v1", auth: gmailClient });
    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encodedMessage },
    });

    return { ok: true };
  } catch (err) {
    console.error("Failed to send email:", err);
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
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
}
