import { google } from "googleapis";
import { getSupabaseAdmin } from "./lib/supabase.js";
import { env } from "./lib/env.js";

const oAuth2Client = new google.auth.OAuth2(
  env.googleClientId,
  env.googleClientSecret,
  env.googleRedirectUri
);

export function getGoogleAuthUrl(userId: string): string {
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

export async function exchangeCodeForTokens(code: string) {
  const { tokens } = await oAuth2Client.getToken(code);
  return tokens;
}

export async function getGoogleEmail(accessToken: string): Promise<string> {
  const oauth2 = google.oauth2({ version: "v2", auth: accessToken });
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

  oAuth2Client.setCredentials({ refresh_token: auth.refreshToken });
  const { credentials } = await oAuth2Client.refreshAccessToken();

  await supabase
    .from("google_auth")
    .update({
      accessToken: credentials.access_token || auth.accessToken,
      tokenExpiry: new Date(credentials.expiry_date ?? Date.now() + 3600000).toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .eq("userId", userId);

  return credentials.access_token || auth.accessToken;
}

export async function sendEmailFromUser(
  userId: string,
  to: string,
  subject: string,
  htmlBody: string
): Promise<boolean> {
  try {
    const accessToken = await refreshIfNeeded(userId);
    const supabase = getSupabaseAdmin();
    const { data: auth } = await supabase
      .from("google_auth")
      .select("googleEmail")
      .eq("userId", userId)
      .maybeSingle();

    if (!auth) return false;

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

    const gmail = google.gmail({ version: "v1", auth: accessToken });
    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encodedMessage },
    });

    return true;
  } catch (err) {
    console.error("Failed to send email:", err);
    return false;
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
