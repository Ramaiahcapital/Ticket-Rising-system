import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

export const env = {
  isProduction: process.env.NODE_ENV === "production",
  supabaseUrl: required("SUPABASE_URL"),
  supabaseAnonKey: required("SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  // Optional. When empty the OAuth redirect URI is derived from the request
  // host, so the same build works on localhost and on the deployed domain.
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || "",
  // Optional. Profile id of the mailbox to fall back to when the acting user
  // has no working Google connection. When empty, a working admin mailbox is
  // auto-detected.
  systemEmailUserId: process.env.SYSTEM_EMAIL_USER_ID || "",
};
