var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/lib/env.ts
import "../node_modules/dotenv/config.js";
function required(name) {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}
var env;
var init_env = __esm({
  "server/lib/env.ts"() {
    env = {
      isProduction: process.env.NODE_ENV === "production",
      supabaseUrl: required("SUPABASE_URL"),
      supabaseAnonKey: required("SUPABASE_ANON_KEY"),
      supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
      googleClientId: process.env.GOOGLE_CLIENT_ID || "",
      googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/google/callback"
    };
  }
});

// server/lib/supabase.ts
var supabase_exports = {};
__export(supabase_exports, {
  getSupabaseAdmin: () => getSupabaseAdmin,
  getSupabaseBrowser: () => getSupabaseBrowser
});
import { createClient } from "../node_modules/@supabase/supabase-js/dist/index.mjs";
function getSupabaseAdmin() {
  if (!adminClient) {
    adminClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
  return adminClient;
}
function getSupabaseBrowser() {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });
}
var adminClient;
var init_supabase = __esm({
  "server/lib/supabase.ts"() {
    init_env();
    adminClient = null;
  }
});

// server/email-service.ts
var email_service_exports = {};
__export(email_service_exports, {
  disconnectGoogle: () => disconnectGoogle,
  exchangeCodeForTokens: () => exchangeCodeForTokens,
  getGoogleAuthUrl: () => getGoogleAuthUrl,
  getGoogleEmail: () => getGoogleEmail,
  isUserConnected: () => isUserConnected,
  sendEmailFromUser: () => sendEmailFromUser
});
import { google } from "../node_modules/googleapis/build/src/index.js";
function getGoogleAuthUrl(userId) {
  return oAuth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/userinfo.email"
    ],
    state: userId
  });
}
async function exchangeCodeForTokens(code) {
  const { tokens } = await oAuth2Client.getToken(code);
  return tokens;
}
async function getGoogleEmail(accessToken) {
  const oauth2 = google.oauth2({ version: "v2", auth: accessToken });
  const { data } = await oauth2.userinfo.get();
  return data.email || "";
}
async function refreshIfNeeded(userId) {
  const supabase = getSupabaseAdmin();
  const { data: auth } = await supabase.from("google_auth").select("*").eq("userId", userId).maybeSingle();
  if (!auth) throw new Error("Google account not connected");
  const expiry = new Date(auth.tokenExpiry).getTime();
  if (Date.now() < expiry - 6e4) {
    return auth.accessToken;
  }
  oAuth2Client.setCredentials({ refresh_token: auth.refreshToken });
  const { credentials } = await oAuth2Client.refreshAccessToken();
  await supabase.from("google_auth").update({
    accessToken: credentials.access_token || auth.accessToken,
    tokenExpiry: new Date(credentials.expiry_date ?? Date.now() + 36e5).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  }).eq("userId", userId);
  return credentials.access_token || auth.accessToken;
}
async function sendEmailFromUser(userId, to, subject, htmlBody) {
  try {
    const accessToken = await refreshIfNeeded(userId);
    const supabase = getSupabaseAdmin();
    const { data: auth } = await supabase.from("google_auth").select("googleEmail").eq("userId", userId).maybeSingle();
    if (!auth) return false;
    const fromEmail = auth.googleEmail;
    const RFC2822Message = [
      `From: ${fromEmail}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      ``,
      htmlBody
    ].join("\r\n");
    const encodedMessage = Buffer.from(RFC2822Message).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const gmail = google.gmail({ version: "v1", auth: accessToken });
    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encodedMessage }
    });
    return true;
  } catch (err) {
    console.error("Failed to send email:", err);
    return false;
  }
}
async function isUserConnected(userId) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("google_auth").select("id").eq("userId", userId).maybeSingle();
  return !!data;
}
async function disconnectGoogle(userId) {
  const supabase = getSupabaseAdmin();
  await supabase.from("google_auth").delete().eq("userId", userId);
}
var oAuth2Client;
var init_email_service = __esm({
  "server/email-service.ts"() {
    init_supabase();
    init_env();
    oAuth2Client = new google.auth.OAuth2(
      env.googleClientId,
      env.googleClientSecret,
      env.googleRedirectUri
    );
  }
});

// server/vercel-handler.ts
import { Hono } from "../node_modules/hono/dist/index.js";
import { bodyLimit } from "../node_modules/hono/dist/middleware/body-limit/index.js";
import { fetchRequestHandler } from "../node_modules/@trpc/server/dist/adapters/fetch/index.mjs";

// contracts/constants.ts
var ErrorMessages = {
  unauthenticated: "Authentication required",
  insufficientRole: "Insufficient permissions"
};

// server/middleware.ts
import { initTRPC, TRPCError } from "../node_modules/@trpc/server/dist/index.mjs";
import superjson from "../node_modules/superjson/dist/index.js";
var t = initTRPC.context().create({
  transformer: superjson
});
var createRouter = t.router;
var publicQuery = t.procedure;
var requireAuth = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: ErrorMessages.unauthenticated
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
function requireRole(role) {
  return t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== role) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: ErrorMessages.insufficientRole
      });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}
var authedQuery = t.procedure.use(requireAuth);
var adminQuery = authedQuery.use(requireRole("admin"));
var clusterQuery = authedQuery.use(requireRole("cluster"));

// server/auth-router.ts
var authRouter = createRouter({
  me: authedQuery.query((opts) => {
    if (!opts.ctx.user) {
      throw new Error("Not authenticated");
    }
    return opts.ctx.user;
  }),
  logout: authedQuery.mutation(() => {
    return { success: true };
  })
});

// server/branch-user-router.ts
import { z } from "../node_modules/zod/index.js";
init_supabase();

// server/lib/utils.ts
init_supabase();
async function generateTicketNumber() {
  const supabase = getSupabaseAdmin();
  const { data: formatRows } = await supabase.from("system_settings").select("value").eq("key", "ticket_number_format").maybeSingle();
  const { data: counterRows } = await supabase.from("system_settings").select("value").eq("key", "ticket_number_counter").maybeSingle();
  const format = formatRows?.value || "RC-YYYY-XXXXXX";
  let counter = parseInt(counterRows?.value || "0", 10);
  counter++;
  const year = (/* @__PURE__ */ new Date()).getFullYear().toString();
  const ticketNumber = format.replace("YYYY", year).replace("XXXXXX", counter.toString().padStart(6, "0"));
  await supabase.from("system_settings").update({ value: counter.toString() }).eq("key", "ticket_number_counter");
  return ticketNumber;
}
async function createAuditLog(params) {
  const supabase = getSupabaseAdmin();
  const row = {
    userId: params.userId ?? null,
    userType: params.userType,
    userName: params.userName ?? null,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId ?? null,
    details: params.details ? JSON.stringify(params.details) : null,
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null
  };
  await supabase.from("audit_logs").insert(row);
}
async function createTimelineEntry(params) {
  const supabase = getSupabaseAdmin();
  const row = {
    ticketId: params.ticketId,
    action: params.action,
    actorId: params.actorId,
    actorType: params.actorType,
    actorName: params.actorName,
    previousValue: params.previousValue ?? null,
    newValue: params.newValue ?? null,
    description: params.description ?? null,
    metadata: null
  };
  await supabase.from("ticket_timeline").insert(row);
}
async function createNotification(params) {
  const supabase = getSupabaseAdmin();
  const row = {
    recipientId: params.recipientId,
    recipientType: params.recipientType,
    title: params.title,
    message: params.message,
    type: params.type,
    ticketId: params.ticketId ?? null
  };
  await supabase.from("notifications").insert(row);
}
async function notifyAllAdmins(params) {
  const supabase = getSupabaseAdmin();
  const { data: admins } = await supabase.from("profiles").select("*").eq("role", "admin");
  for (const admin of admins ?? []) {
    await createNotification({
      recipientId: admin.id,
      recipientType: "admin",
      title: params.title,
      message: params.message,
      type: params.type,
      ticketId: params.ticketId
    });
  }
}

// server/branch-user-router.ts
var branchUserRouter = createRouter({
  list: adminQuery.input(
    z.object({
      page: z.number().default(1),
      limit: z.number().default(10),
      search: z.string().optional(),
      status: z.enum(["all", "active", "inactive"]).default("all"),
      branchId: z.string().optional(),
      sortBy: z.string().default("createdAt"),
      sortOrder: z.enum(["asc", "desc"]).default("desc")
    }).optional()
  ).query(async ({ input }) => {
    const supabase = getSupabaseAdmin();
    const params = input || { page: 1, limit: 10, status: "all", sortBy: "createdAt", sortOrder: "desc" };
    const from = (params.page - 1) * params.limit;
    let query = supabase.from("profiles").select("*", { count: "exact" }).eq("role", "branch");
    if (params.search) {
      query = query.or(
        `branchName.ilike.%${params.search}%,branchCode.ilike.%${params.search}%,contactPerson.ilike.%${params.search}%,email.ilike.%${params.search}%,username.ilike.%${params.search}%`
      );
    }
    if (params.branchId) query = query.eq("branchId", params.branchId);
    if (params.status === "active") query = query.eq("isActive", true);
    else if (params.status === "inactive") query = query.eq("isActive", false);
    const { data, count, error } = await query.order(params.sortBy, { ascending: params.sortOrder === "asc" }).range(from, from + params.limit - 1);
    if (error) throw new Error(error.message);
    const items = (data ?? []).map((u) => ({
      id: u.id,
      username: u.username,
      branchName: u.branchName,
      branchCode: u.branchCode,
      branchId: u.branchId,
      contactPerson: u.contactPerson,
      branchRole: u.branchRole,
      email: u.email,
      mobile: u.mobile,
      address: u.address,
      isActive: u.isActive,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt
    }));
    const total = count ?? 0;
    return {
      items,
      total,
      page: params.page,
      limit: params.limit,
      totalPages: Math.ceil(total / params.limit)
    };
  }),
  byId: adminQuery.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from("profiles").select("*").eq("id", input.id).eq("role", "branch").maybeSingle();
    if (!data) return null;
    return {
      id: data.id,
      username: data.username,
      branchName: data.branchName,
      branchCode: data.branchCode,
      branchId: data.branchId,
      contactPerson: data.contactPerson,
      branchRole: data.branchRole,
      email: data.email,
      mobile: data.mobile,
      address: data.address,
      isActive: data.isActive,
      createdAt: data.createdAt,
      lastLoginAt: data.lastLoginAt
    };
  }),
  create: adminQuery.input(
    z.object({
      branchId: z.string().min(1),
      branchRole: z.enum(["IT", "Branch Admin", "Manager"]),
      contactPerson: z.string().min(1).max(255),
      email: z.string().email(),
      mobile: z.string().optional(),
      address: z.string().optional(),
      username: z.string().min(3).max(100),
      password: z.string().min(6),
      isActive: z.boolean().default(true)
    })
  ).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { data: branch, error: branchErr } = await supabase.from("branches").select("id, name, code").eq("id", input.branchId).maybeSingle();
    if (branchErr) throw new Error(branchErr.message);
    if (!branch) throw new Error("Selected branch not found");
    const { data: existingUsername } = await supabase.from("profiles").select("id").eq("username", input.username).maybeSingle();
    if (existingUsername) throw new Error("Username already exists");
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        role: "branch",
        branchName: branch.name,
        branchCode: branch.code,
        branchId: branch.id,
        contactPerson: input.contactPerson,
        branchRole: input.branchRole,
        name: input.contactPerson
      }
    });
    if (authError) throw new Error(authError.message);
    if (!authData.user) throw new Error("Failed to create auth user");
    const { data, error } = await supabase.from("profiles").upsert(
      {
        id: authData.user.id,
        email: input.email,
        username: input.username,
        role: "branch",
        branchName: branch.name,
        branchCode: branch.code,
        branchId: branch.id,
        contactPerson: input.contactPerson,
        branchRole: input.branchRole,
        mobile: input.mobile ?? null,
        address: input.address ?? null,
        isActive: input.isActive,
        createdBy: ctx.user.id,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      },
      { onConflict: "id" }
    ).select("id").single();
    if (error) throw new Error(error.message);
    await createAuditLog({
      userId: ctx.user.id,
      userType: "admin",
      userName: ctx.user.name || "Admin",
      action: "create_branch_user",
      entityType: "branchUser",
      entityId: data.id,
      details: { branchName: branch.name, branchCode: branch.code, branchRole: input.branchRole }
    });
    return {
      id: data.id,
      username: input.username,
      branchName: branch.name,
      branchCode: branch.code,
      contactPerson: input.contactPerson,
      email: input.email,
      isActive: input.isActive
    };
  }),
  update: adminQuery.input(
    z.object({
      id: z.string(),
      branchId: z.string().optional(),
      branchRole: z.enum(["IT", "Branch Admin", "Manager"]).optional(),
      contactPerson: z.string().min(1).max(255).optional(),
      email: z.string().email().optional(),
      mobile: z.string().optional(),
      address: z.string().optional(),
      isActive: z.boolean().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { id, ...updates } = input;
    if (Object.keys(updates).length === 0) throw new Error("No fields to update");
    const set = { updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    if (updates.branchId !== void 0) {
      const { data: b } = await supabase.from("branches").select("name, code").eq("id", updates.branchId).maybeSingle();
      if (b) {
        set.branchId = updates.branchId;
        set.branchName = b.name;
        set.branchCode = b.code;
      }
    }
    if (updates.contactPerson !== void 0) set.contactPerson = updates.contactPerson;
    if (updates.branchRole !== void 0) set.branchRole = updates.branchRole ?? null;
    if (updates.email !== void 0) set.email = updates.email;
    if (updates.mobile !== void 0) set.mobile = updates.mobile;
    if (updates.address !== void 0) set.address = updates.address;
    if (updates.isActive !== void 0) set.isActive = updates.isActive;
    const { error } = await supabase.from("profiles").update(set).eq("id", id);
    if (error) throw new Error(error.message);
    await createAuditLog({
      userId: ctx.user.id,
      userType: "admin",
      action: "update_branch_user",
      entityType: "branchUser",
      entityId: id
    });
    return { success: true };
  }),
  toggleStatus: adminQuery.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { data: user } = await supabase.from("profiles").select("*").eq("id", input.id).eq("role", "branch").maybeSingle();
    if (!user) throw new Error("Branch user not found");
    const newStatus = !user.isActive;
    const { error } = await supabase.from("profiles").update({ isActive: newStatus, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", input.id);
    if (error) throw new Error(error.message);
    await createAuditLog({
      userId: ctx.user.id,
      userType: "admin",
      action: newStatus ? "activate_branch_user" : "deactivate_branch_user",
      entityType: "branchUser",
      entityId: input.id,
      details: { branchName: user.branchName, newStatus }
    });
    return { isActive: newStatus };
  }),
  resetPassword: adminQuery.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { data: user } = await supabase.from("profiles").select("*").eq("id", input.id).eq("role", "branch").maybeSingle();
    if (!user) throw new Error("Branch user not found");
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let newPassword = "";
    for (let i = 0; i < 10; i++) {
      newPassword += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const { error } = await supabase.auth.admin.updateUserById(input.id, {
      password: newPassword
    });
    if (error) throw new Error(error.message);
    await createAuditLog({
      userId: ctx.user.id,
      userType: "admin",
      action: "reset_password",
      entityType: "branchUser",
      entityId: input.id,
      details: { branchName: user.branchName }
    });
    return { password: newPassword };
  }),
  delete: adminQuery.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { count } = await supabase.from("tickets").select("*", { count: "exact", head: true }).eq("branchId", input.id);
    if ((count ?? 0) > 0) {
      throw new Error("Cannot delete branch user with existing tickets. Deactivate instead.");
    }
    const { error } = await supabase.from("profiles").delete().eq("id", input.id).eq("role", "branch");
    if (error) throw new Error(error.message);
    await supabase.auth.admin.deleteUser(input.id);
    await createAuditLog({
      userId: ctx.user.id,
      userType: "admin",
      action: "delete_branch_user",
      entityType: "branchUser",
      entityId: input.id
    });
    return { success: true };
  }),
  checkUsername: adminQuery.input(z.object({ username: z.string() })).query(async ({ input }) => {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from("profiles").select("id").eq("username", input.username).maybeSingle();
    return { exists: !!data };
  }),
  checkBranchCode: adminQuery.input(z.object({ branchCode: z.string() })).query(async ({ input }) => {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from("profiles").select("id").eq("branchCode", input.branchCode).maybeSingle();
    return { exists: !!data };
  })
});

// server/branch-router.ts
import { z as z2 } from "../node_modules/zod/index.js";
init_supabase();
var branchRouter = createRouter({
  list: adminQuery.input(
    z2.object({
      page: z2.number().default(1),
      limit: z2.number().default(50),
      search: z2.string().optional(),
      status: z2.enum(["all", "active", "inactive"]).default("all")
    }).optional()
  ).query(async ({ input }) => {
    const supabase = getSupabaseAdmin();
    const params = input || { page: 1, limit: 50, status: "all" };
    const from = (params.page - 1) * params.limit;
    let query = supabase.from("branches").select("*", { count: "exact" });
    if (params.search) query = query.or(`name.ilike.%${params.search}%,code.ilike.%${params.search}%`);
    if (params.status === "active") query = query.eq("isActive", true);
    else if (params.status === "inactive") query = query.eq("isActive", false);
    const { data, count, error } = await query.order("name", { ascending: true }).range(from, from + params.limit - 1);
    if (error) throw new Error(error.message);
    const items = (data ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      code: b.code,
      contactPerson: b.contactPerson,
      address: b.address,
      isActive: b.isActive,
      createdAt: b.createdAt
    }));
    const total = count ?? 0;
    return { items, total, page: params.page, limit: params.limit, totalPages: Math.ceil(total / params.limit) };
  }),
  listAll: adminQuery.query(async () => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("branches").select("id, name, code").eq("isActive", true).order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((b) => ({ id: b.id, name: b.name, code: b.code }));
  }),
  byId: adminQuery.input(z2.object({ id: z2.string() })).query(async ({ input }) => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("branches").select("*").eq("id", input.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return { id: data.id, name: data.name, code: data.code, contactPerson: data.contactPerson, address: data.address, isActive: data.isActive };
  }),
  create: adminQuery.input(
    z2.object({
      name: z2.string().min(1),
      code: z2.string().min(1),
      contactPerson: z2.string().optional(),
      address: z2.string().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase.from("branches").select("id").eq("code", input.code).maybeSingle();
    if (existing) throw new Error("Branch code already exists");
    const { data, error } = await supabase.from("branches").insert({
      name: input.name,
      code: input.code,
      contactPerson: input.contactPerson ?? null,
      address: input.address ?? null,
      createdBy: ctx.user.id
    }).select("id").single();
    if (error) throw new Error(error.message);
    await createAuditLog({ userId: ctx.user.id, userType: "admin", action: "create_branch", entityType: "branch", entityId: data.id, details: { name: input.name, code: input.code } });
    return { id: data.id };
  }),
  update: adminQuery.input(
    z2.object({
      id: z2.string(),
      name: z2.string().min(1).optional(),
      code: z2.string().min(1).optional(),
      contactPerson: z2.string().optional(),
      address: z2.string().optional(),
      isActive: z2.boolean().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { id, ...rest } = input;
    const set = {};
    if (rest.name !== void 0) set.name = rest.name;
    if (rest.code !== void 0) set.code = rest.code;
    if (rest.contactPerson !== void 0) set.contactPerson = rest.contactPerson;
    if (rest.address !== void 0) set.address = rest.address;
    if (rest.isActive !== void 0) set.isActive = rest.isActive;
    const { error } = await supabase.from("branches").update(set).eq("id", id);
    if (error) throw new Error(error.message);
    await createAuditLog({ userId: ctx.user.id, userType: "admin", action: "update_branch", entityType: "branch", entityId: id });
    return { success: true };
  }),
  // Users belonging to a branch
  users: adminQuery.input(z2.object({ branchId: z2.string() })).query(async ({ input }) => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("profiles").select("id, username, contactPerson, email, branchRole, isActive").eq("branchId", input.branchId).eq("role", "branch").order("contactPerson", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((u) => ({
      id: u.id,
      username: u.username,
      contactPerson: u.contactPerson,
      email: u.email,
      branchRole: u.branchRole,
      isActive: u.isActive
    }));
  }),
  delete: adminQuery.input(z2.object({ id: z2.string() })).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { count } = await supabase.from("profiles").select("*", { count: "exact", head: true }).eq("branchId", input.id).eq("role", "branch");
    if ((count ?? 0) > 0) throw new Error("Cannot delete branch with linked users. Reassign or remove them first.");
    const { error } = await supabase.from("branches").delete().eq("id", input.id);
    if (error) throw new Error(error.message);
    await createAuditLog({ userId: ctx.user.id, userType: "admin", action: "delete_branch", entityType: "branch", entityId: input.id });
    return { success: true };
  }),
  // Which branch is the current user linked to (for the portal)
  myBranch: authedQuery.query(async ({ ctx }) => {
    const supabase = getSupabaseAdmin();
    const branchId = ctx.user.branchId;
    if (ctx.user.role !== "branch" || !branchId) return null;
    const { data, error } = await supabase.from("branches").select("id, name, code").eq("id", branchId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? { id: data.id, name: data.name, code: data.code } : null;
  })
});

// server/cluster-router.ts
import { z as z3 } from "../node_modules/zod/index.js";
init_supabase();
init_env();
init_email_service();
var clusterRouter = createRouter({
  // ---------------- Admin: cluster CRUD ----------------
  list: adminQuery.input(z3.object({ includeInactive: z3.boolean().default(false) }).optional()).query(async ({ input }) => {
    const supabase = getSupabaseAdmin();
    let query = supabase.from("clusters").select("*").order("name");
    if (!input?.includeInactive) query = query.eq("isActive", true);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
  }),
  create: adminQuery.input(z3.object({ name: z3.string().min(1), code: z3.string().min(1) })).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("clusters").insert({ name: input.name, code: input.code, createdBy: ctx.user.id }).select("id").single();
    if (error) throw new Error(error.message);
    await createAuditLog({ userId: ctx.user.id, userType: "admin", action: "create_cluster", entityType: "cluster", entityId: data.id, details: { name: input.name, code: input.code } });
    return data;
  }),
  update: adminQuery.input(z3.object({ id: z3.string(), name: z3.string().optional(), code: z3.string().optional(), isActive: z3.boolean().optional() })).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const set = { updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    if (input.name !== void 0) set.name = input.name;
    if (input.code !== void 0) set.code = input.code;
    if (input.isActive !== void 0) set.isActive = input.isActive;
    const { error } = await supabase.from("clusters").update(set).eq("id", input.id);
    if (error) throw new Error(error.message);
    await createAuditLog({ userId: ctx.user.id, userType: "admin", action: "update_cluster", entityType: "cluster", entityId: input.id });
    return { success: true };
  }),
  delete: adminQuery.input(z3.object({ id: z3.string() })).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { count } = await supabase.from("profiles").select("*", { count: "exact", head: true }).eq("clusterId", input.id).eq("role", "branch");
    if ((count ?? 0) > 0) throw new Error("Cannot delete cluster with assigned branches. Remove branch assignments first.");
    const { error } = await supabase.from("clusters").delete().eq("id", input.id);
    if (error) throw new Error(error.message);
    await createAuditLog({ userId: ctx.user.id, userType: "admin", action: "delete_cluster", entityType: "cluster", entityId: input.id });
    return { success: true };
  }),
  // ---------------- Admin: assign/unassign branches to cluster ----------------
  assignBranches: adminQuery.input(z3.object({ clusterId: z3.string(), branchIds: z3.array(z3.string()) })).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("profiles").update({ clusterId: input.clusterId }).in("id", input.branchIds).eq("role", "branch");
    if (error) throw new Error(error.message);
    await createAuditLog({ userId: ctx.user.id, userType: "admin", action: "assign_branches_cluster", entityType: "cluster", entityId: input.clusterId, details: { branchIds: input.branchIds } });
    return { success: true };
  }),
  unassignBranches: adminQuery.input(z3.object({ branchIds: z3.array(z3.string()) })).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("profiles").update({ clusterId: null }).in("id", input.branchIds).eq("role", "branch");
    if (error) throw new Error(error.message);
    await createAuditLog({ userId: ctx.user.id, userType: "admin", action: "unassign_branches_cluster", entityType: "cluster", details: { branchIds: input.branchIds } });
    return { success: true };
  }),
  // ---------------- Admin: list branches in a cluster ----------------
  branches: adminQuery.input(z3.object({ clusterId: z3.string() })).query(async ({ input }) => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("profiles").select("id, name, branchName, branchCode, branchRole, email, isActive, branchId").eq("clusterId", input.clusterId).eq("role", "branch").order("branchName");
    if (error) throw new Error(error.message);
    return data ?? [];
  }),
  // ---------------- Admin: list all branch users (with cluster info) ----------------
  allBranchUsers: adminQuery.input(z3.object({ clusterId: z3.string().optional(), search: z3.string().optional() }).optional()).query(async ({ input }) => {
    const supabase = getSupabaseAdmin();
    let query = supabase.from("profiles").select("id, name, branchName, branchCode, branchRole, email, isActive, branchId, clusterId").eq("role", "branch").order("branchName");
    if (input?.clusterId) query = query.eq("clusterId", input.clusterId);
    if (input?.search) query = query.or(`branchName.ilike.%${input.search}%,branchCode.ilike.%${input.search}%,name.ilike.%${input.search}%`);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const clusterIds = Array.from(new Set((data ?? []).map((u) => u.clusterId).filter(Boolean)));
    const { data: clusterMapData } = await supabase.from("clusters").select("id, name, code").in("id", clusterIds.length ? clusterIds : ["none"]);
    const clusterMap = new Map((clusterMapData ?? []).map((c) => [c.id, c]));
    return (data ?? []).map((u) => ({
      id: u.id,
      name: u.name,
      branchName: u.branchName,
      branchCode: u.branchCode,
      branchRole: u.branchRole,
      email: u.email,
      isActive: u.isActive,
      branchId: u.branchId,
      clusterId: u.clusterId,
      clusterName: clusterMap.get(u.clusterId)?.name ?? null,
      clusterCode: clusterMap.get(u.clusterId)?.code ?? null
    }));
  }),
  // ---------------- Admin: list branch users available for assignment ----------------
  availableBranchUsers: adminQuery.query(async () => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("profiles").select("id, name, branchName, branchCode, branchRole, email, isActive, clusterId").eq("role", "branch").is("clusterId", null).eq("isActive", true).order("branchName");
    if (error) throw new Error(error.message);
    return data ?? [];
  }),
  // ---------------- Admin: cluster user CRUD ----------------
  checkClusterUsername: adminQuery.input(z3.object({ username: z3.string() })).query(async ({ input }) => {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from("profiles").select("id").eq("username", input.username).eq("role", "cluster").maybeSingle();
    return { exists: !!data };
  }),
  listUsers: adminQuery.input(z3.object({ includeInactive: z3.boolean().default(false) }).optional()).query(async ({ input }) => {
    const supabase = getSupabaseAdmin();
    let query = supabase.from("profiles").select("id, username, name, email, isActive, clusterId, createdAt, lastLoginAt").eq("role", "cluster").order("createdAt", { ascending: false });
    if (!input?.includeInactive) query = query.eq("isActive", true);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const clusterIds = Array.from(new Set((data ?? []).map((u) => u.clusterId).filter(Boolean)));
    const { data: clusterMapData } = await supabase.from("clusters").select("id, name, code").in("id", clusterIds.length ? clusterIds : ["none"]);
    const clusterMap = new Map((clusterMapData ?? []).map((c) => [c.id, c]));
    const users = (data ?? []).map((u) => ({
      id: u.id,
      username: u.username,
      name: u.name,
      email: u.email,
      isActive: u.isActive,
      clusterId: u.clusterId,
      clusterName: clusterMap.get(u.clusterId)?.name ?? null,
      clusterCode: clusterMap.get(u.clusterId)?.code ?? null,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt
    }));
    return users;
  }),
  createUser: adminQuery.input(
    z3.object({
      username: z3.string().min(3).max(50),
      name: z3.string().min(1).max(255),
      email: z3.string().email(),
      clusterId: z3.string()
    })
  ).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const clusterCheck = await supabase.from("clusters").select("name, code").eq("id", input.clusterId).maybeSingle();
    if (clusterCheck.error) throw new Error("cluster_check:" + clusterCheck.error.message);
    if (!clusterCheck.data) throw new Error("Cluster not found");
    const cluster = clusterCheck.data;
    const existingCheck = await supabase.from("profiles").select("id").eq("username", input.username).maybeSingle();
    if (existingCheck.error) throw new Error("username_check:" + existingCheck.error.message);
    if (existingCheck.data) throw new Error("Username already exists");
    const password = "Clu" + Math.random().toString(36).slice(2, 10) + "1!";
    const authRes = await fetch(env.supabaseUrl + "/auth/v1/admin/users", {
      method: "POST",
      headers: {
        "apikey": env.supabaseServiceRoleKey,
        "Authorization": "Bearer " + env.supabaseServiceRoleKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: input.email,
        password,
        email_confirm: true,
        user_metadata: { role: "cluster" }
      })
    });
    if (!authRes.ok) {
      const authBody = await authRes.text();
      throw new Error("auth_api_error: status=" + authRes.status + " body=" + authBody);
    }
    const authData = await authRes.json();
    if (!authData?.id) throw new Error("No auth user returned. data:" + JSON.stringify(authData));
    const upsertResult = await supabase.from("profiles").upsert(
      {
        id: authData.id,
        email: input.email,
        username: input.username,
        name: input.name,
        role: "cluster",
        clusterId: input.clusterId,
        isActive: true,
        createdBy: ctx.user.id,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      },
      { onConflict: "id" }
    ).select("id").single();
    if (upsertResult.error) throw new Error("upsert_error:" + upsertResult.error.message);
    const data = upsertResult.data;
    await createAuditLog({
      userId: ctx.user.id,
      userType: "admin",
      userName: ctx.user.name || "Admin",
      action: "create_cluster_user",
      entityType: "clusterUser",
      entityId: data.id,
      details: { username: input.username, clusterId: input.clusterId, clusterName: cluster.name }
    });
    return { id: data.id, username: input.username, name: input.name, email: input.email, password };
  }),
  updateUser: adminQuery.input(
    z3.object({
      id: z3.string(),
      name: z3.string().min(1).max(255).optional(),
      email: z3.string().email().optional(),
      username: z3.string().min(3).max(50).optional(),
      clusterId: z3.string().optional(),
      isActive: z3.boolean().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { id, ...updates } = input;
    if (Object.keys(updates).length === 0) throw new Error("No fields to update");
    const set = { updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    if (updates.name !== void 0) set.name = updates.name;
    if (updates.email !== void 0) set.email = updates.email;
    if (updates.username !== void 0) {
      const { data: dup } = await supabase.from("profiles").select("id").eq("username", updates.username).neq("id", id).maybeSingle();
      if (dup) throw new Error("Username already taken");
      set.username = updates.username;
    }
    if (updates.clusterId !== void 0) set.clusterId = updates.clusterId;
    if (updates.isActive !== void 0) set.isActive = updates.isActive;
    const { error } = await supabase.from("profiles").update(set).eq("id", id).eq("role", "cluster");
    if (error) throw new Error(error.message);
    await createAuditLog({ userId: ctx.user.id, userType: "admin", action: "update_cluster_user", entityType: "clusterUser", entityId: id });
    return { success: true };
  }),
  resetPassword: adminQuery.input(z3.object({ id: z3.string() })).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { data: user } = await supabase.from("profiles").select("*").eq("id", input.id).eq("role", "cluster").maybeSingle();
    if (!user) throw new Error("Cluster user not found");
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let newPassword = "";
    for (let i = 0; i < 10; i++) {
      newPassword += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const { error } = await supabase.auth.admin.updateUserById(input.id, {
      password: newPassword
    });
    if (error) throw new Error(error.message);
    await createAuditLog({
      userId: ctx.user.id,
      userType: "admin",
      action: "reset_password",
      entityType: "clusterUser",
      entityId: input.id,
      details: { username: user.username }
    });
    return { password: newPassword };
  }),
  deleteUser: adminQuery.input(z3.object({ id: z3.string() })).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { error: deleteError } = await supabase.from("profiles").delete().eq("id", input.id).eq("role", "cluster");
    if (deleteError) throw new Error(deleteError.message);
    const { error: authError } = await supabase.auth.admin.deleteUser(input.id);
    if (authError) throw new Error(authError.message);
    await createAuditLog({ userId: ctx.user.id, userType: "admin", action: "delete_cluster_user", entityType: "clusterUser", entityId: input.id });
    return { success: true };
  }),
  // ---------------- Cluster admin: their cluster info ----------------
  myCluster: authedQuery.query(async ({ ctx }) => {
    const user = ctx.user;
    if (!user.clusterId) throw new Error("You are not assigned to any cluster");
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from("clusters").select("*").eq("id", user.clusterId).maybeSingle();
    return data ?? null;
  }),
  // ---------------- Cluster admin: list orders for branches in their cluster ----------------
  clusterOrders: authedQuery.input(z3.object({ clusterId: z3.string(), status: z3.string().optional(), month: z3.string().optional() }).optional()).query(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const user = ctx.user;
    const clusterId = input?.clusterId || user.clusterId;
    if (!clusterId) throw new Error("No cluster specified");
    const now = /* @__PURE__ */ new Date();
    const filterMonth = input?.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [y, m] = filterMonth.split("-").map(Number);
    const monthStart = `${filterMonth}-01`;
    const monthEnd = new Date(y, m, 1).toISOString().slice(0, 10);
    let query = supabase.from("stationary_orders").select("*, stationary_order_items(*, stationary_items(name, unit))").eq("clusterId", clusterId).gte("orderDate", monthStart).lt("orderDate", monthEnd).order("createdAt", { ascending: false });
    if (input?.status && input.status !== "all") query = query.eq("status", input.status);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const branchIds = Array.from(new Set((data ?? []).map((o) => o.branchId)));
    const fallbackIds = branchIds.length ? branchIds : ["00000000-0000-0000-0000-000000000000"];
    const [{ data: branchRows }, { data: profs }] = await Promise.all([
      supabase.from("branches").select("id, name, code").in("id", fallbackIds),
      supabase.from("profiles").select("id, branchName, branchCode, branchRole").in("id", fallbackIds)
    ]);
    const branchLookup = /* @__PURE__ */ new Map();
    for (const b of branchRows ?? []) branchLookup.set(b.id, { branchName: b.name, branchCode: b.code, branchRole: null });
    for (const p of profs ?? []) if (!branchLookup.has(p.id)) branchLookup.set(p.id, { branchName: p.branchName, branchCode: p.branchCode, branchRole: p.branchRole });
    const orders = (data ?? []).map((o) => ({
      id: o.id,
      branchId: o.branchId,
      branchName: branchLookup.get(o.branchId)?.branchName ?? "",
      branchCode: branchLookup.get(o.branchId)?.branchCode ?? "",
      branchRole: branchLookup.get(o.branchId)?.branchRole ?? null,
      status: o.status,
      clusterApprovedAt: o.clusterApprovedAt,
      orderDate: o.orderDate,
      createdAt: o.createdAt,
      total: (o.stationary_order_items ?? []).reduce((s, li) => s + Number(li.lineTotal ?? 0), 0),
      items: (o.stationary_order_items ?? []).map((li) => ({
        id: li.id,
        itemId: li.itemId,
        quantity: li.quantity,
        unitPrice: li.unitPrice ?? 0,
        lineTotal: li.lineTotal ?? 0,
        name: li.stationary_items?.name ?? "",
        unit: li.stationary_items?.unit ?? null
      }))
    }));
    const branchTotalsMap = /* @__PURE__ */ new Map();
    for (const o of orders) {
      const existing = branchTotalsMap.get(o.branchId);
      if (existing) {
        existing.total += o.total;
        existing.orderCount += 1;
      } else {
        branchTotalsMap.set(o.branchId, { branchName: o.branchName, branchCode: o.branchCode, total: o.total, orderCount: 1 });
      }
    }
    const branchTotals = Array.from(branchTotalsMap.values()).sort((a, b) => b.total - a.total);
    const grandTotal = orders.reduce((s, o) => s + o.total, 0);
    return { orders, branchTotals, grandTotal };
  }),
  // ---------------- Cluster admin: approve order (sends to admin) ----------------
  approveOrder: authedQuery.input(z3.object({ orderId: z3.string() })).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const user = ctx.user;
    const { error } = await supabase.from("stationary_orders").update({ clusterApprovedAt: (/* @__PURE__ */ new Date()).toISOString(), clusterApprovedBy: user.id }).eq("id", input.orderId).eq("clusterId", user.clusterId);
    if (error) throw new Error(error.message);
    await createAuditLog({ userId: user.id, userType: "cluster", userName: user.name || "Cluster Admin", action: "approve_cluster_order", entityType: "stationaryOrder", entityId: input.orderId });
    try {
      const { data: admins } = await supabase.from("profiles").select("email").eq("role", "admin").eq("isActive", true);
      const { data: order } = await supabase.from("stationary_orders").select("branchId").eq("id", input.orderId).maybeSingle();
      const { data: branch } = order?.branchId ? await supabase.from("branches").select("name").eq("id", order.branchId).maybeSingle() : { data: null };
      const { data: cluster } = user.clusterId ? await supabase.from("clusters").select("name").eq("id", user.clusterId).maybeSingle() : { data: null };
      if (admins?.length) {
        const clusterLabel = cluster?.name || "Cluster";
        const branchLabel = branch?.name || "Branch";
        for (const admin of admins) {
          if (admin.email) {
            await sendEmailFromUser(
              user.id,
              admin.email,
              `Stationary Order Approved by ${clusterLabel}`,
              `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                  <h2 style="color:#16A34A;">Order Approved</h2>
                  <table style="width:100%;border-collapse:collapse;">
                    <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Branch</td><td style="padding:8px;border-bottom:1px solid #eee;">${branchLabel}</td></tr>
                    <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Cluster</td><td style="padding:8px;border-bottom:1px solid #eee;">${clusterLabel}</td></tr>
                    <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Approved By</td><td style="padding:8px;border-bottom:1px solid #eee;">${user.name || "Cluster Admin"}</td></tr>
                    <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Approved At</td><td style="padding:8px;border-bottom:1px solid #eee;">${(/* @__PURE__ */ new Date()).toLocaleString()}</td></tr>
                  </table>
                  <p style="margin-top:16px;color:#666;">The stationary order has been approved by the cluster and is ready for processing.</p>
                </div>`
            );
          }
        }
      }
    } catch (e) {
      console.error("Cluster approve email failed:", e);
    }
    return { success: true };
  }),
  // ---------------- Cluster admin: reject order ----------------
  rejectOrder: authedQuery.input(z3.object({ orderId: z3.string() })).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const user = ctx.user;
    const { error } = await supabase.from("stationary_orders").update({ status: "cancelled", clusterApprovedBy: user.id }).eq("id", input.orderId).eq("clusterId", user.clusterId);
    if (error) throw new Error(error.message);
    await createAuditLog({ userId: user.id, userType: "cluster", userName: user.name || "Cluster Admin", action: "reject_cluster_order", entityType: "stationaryOrder", entityId: input.orderId });
    return { success: true };
  }),
  // ---------------- Cluster admin: edit order item qty ----------------
  updateOrderItemQty: authedQuery.input(z3.object({ orderItemId: z3.string(), quantity: z3.number().int().min(0) })).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const user = ctx.user;
    const { data: li, error } = await supabase.from("stationary_order_items").update({ quantity: input.quantity }).eq("id", input.orderItemId).select("orderId").single();
    if (error) throw new Error(error.message);
    await createAuditLog({ userId: user.id, userType: "cluster", userName: user.name || "Cluster Admin", action: "edit_cluster_order_qty", entityType: "stationaryOrder", entityId: li.orderId, details: { orderItemId: input.orderItemId, quantity: input.quantity } });
    return { success: true };
  })
});

// server/ticket-router.ts
import { z as z4 } from "../node_modules/zod/index.js";
init_supabase();
init_email_service();
function getActorName(ctx) {
  if (!ctx.user) return "Unknown";
  if (ctx.user.type === "branch") {
    return ctx.user.name || ctx.user.branchName || "Branch";
  }
  return ctx.user.name || "Admin";
}
var ticketRouter = createRouter({
  list: authedQuery.input(
    z4.object({
      page: z4.number().default(1),
      limit: z4.number().default(10),
      search: z4.string().optional(),
      statusId: z4.string().optional(),
      priorityId: z4.string().optional(),
      categoryId: z4.string().optional(),
      branchId: z4.string().optional(),
      branchRole: z4.enum(["IT", "Branch Admin", "Manager"]).optional(),
      assignedTo: z4.string().optional(),
      dateFrom: z4.string().optional(),
      dateTo: z4.string().optional(),
      sortBy: z4.string().default("createdAt"),
      sortOrder: z4.enum(["asc", "desc"]).default("desc")
    }).optional()
  ).query(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const params = input || { page: 1, limit: 10, sortBy: "createdAt", sortOrder: "desc" };
    const from = (params.page - 1) * params.limit;
    let query = supabase.from("tickets").select("*", { count: "exact" });
    if (ctx.user.type === "branch") {
      query = query.eq("branchId", ctx.user.id);
    } else if (params.branchId) {
      query = query.eq("branchId", params.branchId);
    }
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
    const { data: items, count, error } = await query.order(params.sortBy, { ascending: params.sortOrder === "asc" }).range(from, from + params.limit - 1);
    if (error) throw new Error(error.message);
    const { data: statuses } = await supabase.from("ticket_statuses").select("*");
    const { data: priorities } = await supabase.from("ticket_priorities").select("*");
    const { data: categories } = await supabase.from("ticket_categories").select("*");
    const { data: profiles } = await supabase.from("profiles").select("*");
    const statusMap = new Map((statuses ?? []).map((s) => [s.id, s]));
    const priorityMap = new Map((priorities ?? []).map((p) => [p.id, p]));
    const categoryMap = new Map((categories ?? []).map((c) => [c.id, c]));
    const profileMap = new Map((profiles ?? []).map((b) => [b.id, b]));
    const enrichedItems = (items ?? []).map((t2) => ({
      ...t2,
      status: statusMap.get(t2.statusId ?? "") || null,
      priority: priorityMap.get(t2.priorityId ?? "") || null,
      category: categoryMap.get(t2.categoryId ?? "") || null,
      branch: profileMap.get(t2.branchId ?? "") || null,
      assignee: profileMap.get(t2.assignedTo ?? "") || null
    }));
    const total = count ?? 0;
    return {
      items: enrichedItems,
      total,
      page: params.page,
      limit: params.limit,
      totalPages: Math.ceil(total / params.limit)
    };
  }),
  listExport: adminQuery.input(
    z4.object({
      search: z4.string().optional(),
      statusId: z4.string().optional(),
      branchId: z4.string().optional(),
      branchRole: z4.enum(["IT", "Branch Admin", "Manager"]).optional(),
      dateFrom: z4.string().optional(),
      dateTo: z4.string().optional()
    }).optional()
  ).query(async ({ input }) => {
    const supabase = getSupabaseAdmin();
    const params = input || {};
    let query = supabase.from("tickets").select("*", { count: "exact" });
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
    return (items ?? []).map((t2) => ({
      ticketNumber: t2.ticketNumber,
      subject: t2.subject,
      branch: branchMap.get(t2.branchId ?? "")?.name || profileMap.get(t2.branchId ?? "")?.branchName || "-",
      status: statusMap.get(t2.statusId ?? "")?.name || "-",
      branchRole: t2.branchRole || "-",
      createdAt: t2.createdAt
    }));
  }),
  byId: authedQuery.input(z4.object({ id: z4.string() })).query(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { data: ticket } = await supabase.from("tickets").select("*").eq("id", input.id).maybeSingle();
    if (!ticket) throw new Error("Ticket not found");
    if (ctx.user.type === "branch" && ticket.branchId !== ctx.user.id) {
      throw new Error("Access denied");
    }
    return await enrichTicket(supabase, ticket);
  }),
  byNumber: authedQuery.input(z4.object({ number: z4.string() })).query(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { data: ticket } = await supabase.from("tickets").select("*").eq("ticketNumber", input.number).maybeSingle();
    if (!ticket) throw new Error("Ticket not found");
    if (ctx.user.type === "branch" && ticket.branchId !== ctx.user.id) {
      throw new Error("Access denied");
    }
    return await enrichTicket(supabase, ticket);
  }),
  create: authedQuery.input(
    z4.object({
      subject: z4.string().min(5).max(500),
      description: z4.string().min(20),
      categoryId: z4.string().optional(),
      subcategoryId: z4.string().optional(),
      priorityId: z4.string().optional(),
      department: z4.string().optional(),
      customFields: z4.record(z4.string(), z4.any()).optional()
    })
  ).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    if (ctx.user.type !== "branch") {
      throw new Error("Only branch users can create tickets");
    }
    const ticketNumber = await generateTicketNumber();
    const { data: defaultStatuses } = await supabase.from("ticket_statuses").select("*").eq("isDefault", true).eq("isEnabled", true).order("sortOrder", { ascending: true }).limit(1);
    const { data: creator } = await supabase.from("profiles").select("branchRole").eq("id", ctx.user.id).maybeSingle();
    const { data, error } = await supabase.from("tickets").insert({
      ticketNumber,
      subject: input.subject,
      description: input.description,
      categoryId: input.categoryId ?? null,
      subcategoryId: input.subcategoryId ?? null,
      priorityId: input.priorityId ?? null,
      statusId: defaultStatuses?.[0]?.id ?? null,
      department: input.department ?? null,
      branchRole: creator?.branchRole ?? null,
      branchId: ctx.user.id,
      createdBy: ctx.user.id,
      customFields: input.customFields ?? {}
    }).select("id").single();
    if (error) throw new Error(error.message);
    const ticketId = data.id;
    const actorName = getActorName(ctx);
    await createTimelineEntry({
      ticketId,
      action: "ticket_created",
      actorId: ctx.user.id,
      actorType: "branch",
      actorName,
      description: `Ticket ${ticketNumber} created`
    });
    await createAuditLog({
      userId: ctx.user.id,
      userType: "branch",
      userName: actorName,
      action: "create_ticket",
      entityType: "ticket",
      entityId: ticketId,
      details: { ticketNumber, subject: input.subject }
    });
    await notifyAllAdmins({
      title: "New Ticket Created",
      message: `Ticket ${ticketNumber} - ${input.subject} was created by ${actorName}`,
      type: "ticket_created",
      ticketId
    });
    try {
      const supabase2 = getSupabaseAdmin();
      const { data: admins } = await supabase2.from("profiles").select("email").eq("role", "admin").eq("isActive", true);
      const { data: sender } = await supabase2.from("profiles").select("branchName, email").eq("id", ctx.user.id).maybeSingle();
      if (admins?.length && sender?.email) {
        const branchLabel = sender.branchName || "Branch";
        for (const admin of admins) {
          if (admin.email) {
            await sendEmailFromUser(
              ctx.user.id,
              admin.email,
              `New Ticket: ${ticketNumber} - ${input.subject}`,
              `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                  <h2 style="color:#DC2626;">New Support Ticket</h2>
                  <table style="width:100%;border-collapse:collapse;">
                    <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Ticket #</td><td style="padding:8px;border-bottom:1px solid #eee;">${ticketNumber}</td></tr>
                    <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Subject</td><td style="padding:8px;border-bottom:1px solid #eee;">${input.subject}</td></tr>
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
    } catch (e) {
      console.error("Ticket email failed:", e);
    }
    return { id: ticketId, ticketNumber };
  }),
  update: authedQuery.input(
    z4.object({
      id: z4.string(),
      subject: z4.string().min(5).max(500).optional(),
      description: z4.string().min(20).optional(),
      categoryId: z4.string().optional(),
      subcategoryId: z4.string().optional(),
      priorityId: z4.string().optional(),
      department: z4.string().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { id, ...updates } = input;
    const { data: ticket } = await supabase.from("tickets").select("*").eq("id", id).maybeSingle();
    if (!ticket) throw new Error("Ticket not found");
    if (ctx.user.type === "branch" && ticket.branchId !== ctx.user.id) {
      throw new Error("Access denied");
    }
    const set = { updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    if (updates.subject !== void 0) set.subject = updates.subject;
    if (updates.description !== void 0) set.description = updates.description;
    if (updates.categoryId !== void 0) set.categoryId = updates.categoryId;
    if (updates.subcategoryId !== void 0) set.subcategoryId = updates.subcategoryId;
    if (updates.priorityId !== void 0) set.priorityId = updates.priorityId;
    if (updates.department !== void 0) set.department = updates.department;
    const { error } = await supabase.from("tickets").update(set).eq("id", id);
    if (error) throw new Error(error.message);
    await createTimelineEntry({
      ticketId: id,
      action: "ticket_updated",
      actorId: ctx.user.id,
      actorType: ctx.user.type,
      actorName: getActorName(ctx),
      description: "Ticket details updated"
    });
    return { success: true };
  }),
  changeStatus: authedQuery.input(
    z4.object({
      ticketId: z4.string(),
      statusId: z4.string(),
      comment: z4.string().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { data: ticket } = await supabase.from("tickets").select("*").eq("id", input.ticketId).maybeSingle();
    if (!ticket) throw new Error("Ticket not found");
    if (ctx.user.type === "branch" && ticket.branchId !== ctx.user.id) {
      throw new Error("Access denied");
    }
    const { data: oldStatus } = await supabase.from("ticket_statuses").select("*").eq("id", ticket.statusId ?? "").maybeSingle();
    const { data: newStatus } = await supabase.from("ticket_statuses").select("*").eq("id", input.statusId).maybeSingle();
    const updateData = {
      statusId: input.statusId,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (newStatus && !newStatus.isOpen) {
      updateData.closedAt = (/* @__PURE__ */ new Date()).toISOString();
      if (newStatus.name === "Solved") {
        updateData.solvedAt = (/* @__PURE__ */ new Date()).toISOString();
      }
      try {
        const { data: attachments } = await supabase.from("ticket_attachments").select("filePath").eq("ticketId", input.ticketId);
        if (attachments?.length) {
          const paths = attachments.map((a) => a.filePath);
          await supabase.storage.from("ticket-attachments").remove(paths);
          await supabase.from("ticket_attachments").delete().eq("ticketId", input.ticketId);
        }
      } catch {
      }
    }
    const actorName = getActorName(ctx);
    const { error } = await supabase.from("tickets").update(updateData).eq("id", input.ticketId);
    if (error) throw new Error(error.message);
    await createTimelineEntry({
      ticketId: input.ticketId,
      action: "status_changed",
      actorId: ctx.user.id,
      actorType: ctx.user.type,
      actorName,
      previousValue: oldStatus?.name || "Unknown",
      newValue: newStatus?.name || "Unknown",
      description: input.comment || `Status changed to ${newStatus?.name}`
    });
    if (ctx.user.type === "branch") {
      await notifyAllAdmins({
        title: "Ticket Status Updated",
        message: `Ticket ${ticket.ticketNumber} status changed to ${newStatus?.name} by ${actorName}`,
        type: "status_changed",
        ticketId: input.ticketId
      });
    } else {
      await createNotification({
        recipientId: ticket.branchId,
        recipientType: "branch",
        title: "Ticket Status Updated",
        message: `Your ticket ${ticket.ticketNumber} is now ${newStatus?.name}`,
        type: "status_changed",
        ticketId: input.ticketId
      });
    }
    return { success: true };
  }),
  assign: adminQuery.input(
    z4.object({
      ticketId: z4.string(),
      assignedTo: z4.string().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { data: ticket } = await supabase.from("tickets").select("*").eq("id", input.ticketId).maybeSingle();
    if (!ticket) throw new Error("Ticket not found");
    const { data: oldAssignee } = ticket.assignedTo ? await supabase.from("profiles").select("*").eq("id", ticket.assignedTo).maybeSingle() : { data: null };
    const { data: newAssignee } = input.assignedTo ? await supabase.from("profiles").select("*").eq("id", input.assignedTo).maybeSingle() : { data: null };
    const { error } = await supabase.from("tickets").update({ assignedTo: input.assignedTo || null, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", input.ticketId);
    if (error) throw new Error(error.message);
    await createTimelineEntry({
      ticketId: input.ticketId,
      action: "assigned",
      actorId: ctx.user.id,
      actorType: "admin",
      actorName: ctx.user.name || "Admin",
      previousValue: oldAssignee?.name || "Unassigned",
      newValue: newAssignee?.name || "Unassigned",
      description: `Ticket assigned to ${newAssignee?.name || "Unassigned"}`
    });
    await createNotification({
      recipientId: ticket.branchId,
      recipientType: "branch",
      title: "Ticket Assigned",
      message: `Your ticket ${ticket.ticketNumber} has been assigned to ${newAssignee?.name || "staff"}`,
      type: "assigned",
      ticketId: input.ticketId
    });
    return { success: true };
  }),
  delete: adminQuery.input(z4.object({ id: z4.string() })).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("tickets").update({ isActive: false, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", input.id);
    if (error) throw new Error(error.message);
    await createAuditLog({
      userId: ctx.user.id,
      userType: "admin",
      action: "delete_ticket",
      entityType: "ticket",
      entityId: input.id
    });
    return { success: true };
  }),
  bulkUpdateStatus: adminQuery.input(
    z4.object({
      ticketIds: z4.array(z4.string()),
      statusId: z4.string()
    })
  ).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    for (const ticketId of input.ticketIds) {
      const { error } = await supabase.from("tickets").update({ statusId: input.statusId, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", ticketId);
      if (error) throw new Error(error.message);
      await createTimelineEntry({
        ticketId,
        action: "status_changed",
        actorId: ctx.user.id,
        actorType: "admin",
        actorName: ctx.user.name || "Admin",
        newValue: "Bulk status update"
      });
    }
    return { success: true, count: input.ticketIds.length };
  }),
  bulkAssign: adminQuery.input(
    z4.object({
      ticketIds: z4.array(z4.string()),
      assignedTo: z4.string()
    })
  ).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    for (const ticketId of input.ticketIds) {
      const { error } = await supabase.from("tickets").update({ assignedTo: input.assignedTo, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", ticketId);
      if (error) throw new Error(error.message);
      await createTimelineEntry({
        ticketId,
        action: "assigned",
        actorId: ctx.user.id,
        actorType: "admin",
        actorName: ctx.user.name || "Admin",
        newValue: "Bulk assignment"
      });
    }
    return { success: true, count: input.ticketIds.length };
  }),
  // ==================== Form Configuration ====================
  /** Get form config for a specific role (or all roles). */
  getFormConfig: authedQuery.input(z4.object({ role: z4.string().optional() }).optional()).query(async ({ input }) => {
    const supabase = getSupabaseAdmin();
    let query = supabase.from("ticket_form_config").select("*").order("role");
    if (input?.role) query = query.eq("role", input.role);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
  }),
  /** Admin: upsert form config for a role. */
  upsertFormConfig: adminQuery.input(
    z4.object({
      role: z4.enum(["IT", "Branch Admin", "Manager"]),
      fields: z4.array(
        z4.object({
          id: z4.string(),
          label: z4.string().min(1),
          type: z4.enum(["text", "textarea", "select", "radio", "checkbox"]),
          required: z4.boolean().default(false),
          options: z4.array(z4.string()).optional(),
          placeholder: z4.string().optional(),
          sortOrder: z4.number().default(0)
        })
      ),
      filesEnabled: z4.boolean().default(true)
    })
  ).mutation(async ({ input }) => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("ticket_form_config").upsert(
      { role: input.role, fields: input.fields, filesEnabled: input.filesEnabled, updatedAt: (/* @__PURE__ */ new Date()).toISOString() },
      { onConflict: "role" }
    ).select().single();
    if (error) throw new Error(error.message);
    return data;
  }),
  // ==================== Portal Settings (via system_settings) ====================
  /** Get which roles have the ticket portal enabled. */
  getPortalEnabled: authedQuery.query(async () => {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from("system_settings").select("*").like("key", "ticket_portal_enabled_%");
    const map = {};
    for (const s of data ?? []) {
      const role = s.key.replace("ticket_portal_enabled_", "");
      map[role] = s.value === "true";
    }
    return map;
  }),
  /** Admin: set portal enabled for a role. */
  setPortalEnabled: adminQuery.input(z4.object({ role: z4.string(), enabled: z4.boolean() })).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const key = `ticket_portal_enabled_${input.role}`;
    const { error } = await supabase.from("system_settings").upsert(
      { key, value: input.enabled ? "true" : "false", updatedAt: (/* @__PURE__ */ new Date()).toISOString(), updatedBy: ctx.user.id },
      { onConflict: "key" }
    );
    if (error) throw new Error(error.message);
    return { success: true };
  }),
  /** Record an uploaded file in ticket_attachments. */
  recordAttachment: authedQuery.input(
    z4.object({
      ticketId: z4.string(),
      fileName: z4.string(),
      fileType: z4.string(),
      fileSize: z4.number(),
      filePath: z4.string()
    })
  ).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("ticket_attachments").insert({
      ticketId: input.ticketId,
      fileName: input.fileName,
      fileType: input.fileType,
      fileSize: input.fileSize,
      filePath: input.filePath,
      uploadedBy: ctx.user.id,
      uploadedByType: ctx.user.type === "admin" ? "admin" : "branch"
    }).select("id").single();
    if (error) throw new Error(error.message);
    return data;
  }),
  /** Delete all attachments for a ticket (storage cleanup). */
  deleteTicketFiles: adminQuery.input(z4.object({ ticketId: z4.string() })).mutation(async ({ input }) => {
    const supabase = getSupabaseAdmin();
    const { data: attachments } = await supabase.from("ticket_attachments").select("filePath").eq("ticketId", input.ticketId);
    if (attachments?.length) {
      await supabase.storage.from("ticket-attachments").remove(attachments.map((a) => a.filePath));
      await supabase.from("ticket_attachments").delete().eq("ticketId", input.ticketId);
    }
    return { success: true };
  })
});
async function enrichTicket(supabase, ticket) {
  const { data: status } = await supabase.from("ticket_statuses").select("*").eq("id", ticket.statusId ?? "").maybeSingle();
  const { data: priority } = await supabase.from("ticket_priorities").select("*").eq("id", ticket.priorityId ?? "").maybeSingle();
  const { data: category } = await supabase.from("ticket_categories").select("*").eq("id", ticket.categoryId ?? "").maybeSingle();
  const { data: subcategory } = await supabase.from("ticket_subcategories").select("*").eq("id", ticket.subcategoryId ?? "").maybeSingle();
  const { data: branch } = await supabase.from("profiles").select("*").eq("id", ticket.branchId).maybeSingle();
  const { data: assignee } = ticket.assignedTo ? await supabase.from("profiles").select("*").eq("id", ticket.assignedTo).maybeSingle() : { data: null };
  const { data: attachments } = await supabase.from("ticket_attachments").select("*").eq("ticketId", ticket.id).order("createdAt", { ascending: true });
  return {
    ...ticket,
    status: status || null,
    priority: priority || null,
    category: category || null,
    subcategory: subcategory || null,
    branch: branch || null,
    assignee: assignee || null,
    attachments: attachments ?? []
  };
}

// server/ticket-comment-router.ts
import { z as z5 } from "../node_modules/zod/index.js";
init_supabase();
var ticketCommentRouter = createRouter({
  list: authedQuery.input(z5.object({ ticketId: z5.string() })).query(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { data: ticket } = await supabase.from("tickets").select("*").eq("id", input.ticketId).maybeSingle();
    if (!ticket) throw new Error("Ticket not found");
    if (ctx.user.type === "branch" && ticket.branchId !== ctx.user.id) {
      throw new Error("Access denied");
    }
    let query = supabase.from("ticket_comments").select("*").eq("ticketId", input.ticketId);
    if (ctx.user.type === "branch") {
      query = query.eq("isInternal", false);
    }
    const { data: comments } = await query.order("createdAt", { ascending: true });
    const commentIds = (comments ?? []).map((c) => c.id);
    const { data: attachments } = commentIds.length > 0 ? await supabase.from("ticket_attachments").select("*").in("commentId", commentIds) : { data: [] };
    return (comments ?? []).map((c) => ({
      ...c,
      attachments: (attachments ?? []).filter((a) => a.commentId === c.id)
    }));
  }),
  create: authedQuery.input(
    z5.object({
      ticketId: z5.string(),
      content: z5.string().min(1),
      isInternal: z5.boolean().default(false)
    })
  ).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { data: ticket } = await supabase.from("tickets").select("*").eq("id", input.ticketId).maybeSingle();
    if (!ticket) throw new Error("Ticket not found");
    if (ctx.user.type === "branch" && ticket.branchId !== ctx.user.id) {
      throw new Error("Access denied");
    }
    if (ctx.user.type === "branch" && input.isInternal) {
      throw new Error("Branch users cannot create internal notes");
    }
    const actorName = ctx.user.type === "admin" ? ctx.user.name || "Admin" : ctx.user.name || ctx.user.branchName || "Branch";
    const { data, error } = await supabase.from("ticket_comments").insert({
      ticketId: input.ticketId,
      content: input.content,
      authorId: ctx.user.id,
      authorType: ctx.user.type,
      authorName: actorName,
      isInternal: ctx.user.type === "admin" ? input.isInternal : false
    }).select("id").single();
    if (error) throw new Error(error.message);
    const commentId = data.id;
    await createTimelineEntry({
      ticketId: input.ticketId,
      action: "comment_added",
      actorId: ctx.user.id,
      actorType: ctx.user.type,
      actorName,
      description: `Comment added by ${actorName}`
    });
    if (ctx.user.type === "branch") {
      await notifyAllAdmins({
        title: "New Comment",
        message: `New comment on ticket ${ticket.ticketNumber} from ${actorName}`,
        type: "comment_added",
        ticketId: input.ticketId
      });
    } else {
      await createNotification({
        recipientId: ticket.branchId,
        recipientType: "branch",
        title: "New Comment",
        message: `New comment on your ticket ${ticket.ticketNumber}`,
        type: "comment_added",
        ticketId: input.ticketId
      });
    }
    return { id: commentId, content: input.content };
  }),
  delete: authedQuery.input(z5.object({ id: z5.string() })).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { data: comment } = await supabase.from("ticket_comments").select("*").eq("id", input.id).maybeSingle();
    if (!comment) throw new Error("Comment not found");
    if (ctx.user.type === "branch" && comment.authorId !== ctx.user.id) {
      throw new Error("Access denied");
    }
    const { error } = await supabase.from("ticket_comments").delete().eq("id", input.id);
    if (error) throw new Error(error.message);
    return { success: true };
  })
});

// server/ticket-timeline-router.ts
import { z as z6 } from "../node_modules/zod/index.js";
init_supabase();
var ticketTimelineRouter = createRouter({
  list: authedQuery.input(z6.object({ ticketId: z6.string() })).query(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { data: ticket } = await supabase.from("tickets").select("*").eq("id", input.ticketId).maybeSingle();
    if (!ticket) throw new Error("Ticket not found");
    if (ctx.user.type === "branch" && ticket.branchId !== ctx.user.id) {
      throw new Error("Access denied");
    }
    const { data: entries } = await supabase.from("ticket_timeline").select("*").eq("ticketId", input.ticketId).order("createdAt", { ascending: false });
    return entries ?? [];
  })
});

// server/ticket-status-router.ts
import { z as z7 } from "../node_modules/zod/index.js";
init_supabase();
var ticketStatusRouter = createRouter({
  list: publicQuery.query(async () => {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from("ticket_statuses").select("*").order("sortOrder", { ascending: true });
    return data ?? [];
  }),
  listEnabled: publicQuery.query(async () => {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from("ticket_statuses").select("*").eq("isEnabled", true).order("sortOrder", { ascending: true });
    return data ?? [];
  }),
  create: adminQuery.input(
    z7.object({
      name: z7.string().min(1).max(100),
      color: z7.string().regex(/^#[0-9A-Fa-f]{6}$/),
      isOpen: z7.boolean().default(true),
      sortOrder: z7.number().default(0),
      description: z7.string().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("ticket_statuses").insert({
      name: input.name,
      color: input.color,
      isOpen: input.isOpen,
      sortOrder: input.sortOrder,
      description: input.description ?? null,
      isDefault: false,
      isEnabled: true
    }).select("id").single();
    if (error) throw new Error(error.message);
    await createAuditLog({
      userId: ctx.user.id,
      userType: "admin",
      action: "create_status",
      entityType: "ticketStatus",
      entityId: data.id,
      details: { name: input.name, color: input.color }
    });
    return { id: data.id };
  }),
  update: adminQuery.input(
    z7.object({
      id: z7.string(),
      name: z7.string().min(1).max(100).optional(),
      color: z7.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      isOpen: z7.boolean().optional(),
      isEnabled: z7.boolean().optional(),
      sortOrder: z7.number().optional(),
      description: z7.string().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { id, ...rest } = input;
    const updates = { updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    if (rest.name !== void 0) updates.name = rest.name;
    if (rest.color !== void 0) updates.color = rest.color;
    if (rest.isOpen !== void 0) updates.isOpen = rest.isOpen;
    if (rest.isEnabled !== void 0) updates.isEnabled = rest.isEnabled;
    if (rest.sortOrder !== void 0) updates.sortOrder = rest.sortOrder;
    if (rest.description !== void 0) updates.description = rest.description;
    const { error } = await supabase.from("ticket_statuses").update(updates).eq("id", id);
    if (error) throw new Error(error.message);
    await createAuditLog({
      userId: ctx.user.id,
      userType: "admin",
      action: "update_status",
      entityType: "ticketStatus",
      entityId: id,
      details: updates
    });
    return { success: true };
  }),
  reorder: adminQuery.input(
    z7.object({
      orders: z7.array(z7.object({ id: z7.string(), sortOrder: z7.number() }))
    })
  ).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    for (const item of input.orders) {
      await supabase.from("ticket_statuses").update({ sortOrder: item.sortOrder }).eq("id", item.id);
    }
    await createAuditLog({
      userId: ctx.user.id,
      userType: "admin",
      action: "reorder_statuses",
      entityType: "ticketStatus",
      details: { count: input.orders.length }
    });
    return { success: true };
  }),
  delete: adminQuery.input(z7.object({ id: z7.string() })).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { data: status } = await supabase.from("ticket_statuses").select("*").eq("id", input.id).maybeSingle();
    if (!status) throw new Error("Status not found");
    if (status.isDefault) throw new Error("Cannot delete default statuses");
    const { count } = await supabase.from("tickets").select("*", { count: "exact", head: true }).eq("statusId", input.id);
    if ((count ?? 0) > 0) {
      throw new Error("Cannot delete status that is in use by tickets");
    }
    const { error } = await supabase.from("ticket_statuses").delete().eq("id", input.id);
    if (error) throw new Error(error.message);
    await createAuditLog({
      userId: ctx.user.id,
      userType: "admin",
      action: "delete_status",
      entityType: "ticketStatus",
      entityId: input.id,
      details: { name: status.name }
    });
    return { success: true };
  })
});

// server/ticket-category-router.ts
import { z as z8 } from "../node_modules/zod/index.js";
init_supabase();
var ticketCategoryRouter = createRouter({
  list: publicQuery.query(async () => {
    const supabase = getSupabaseAdmin();
    const { data: categories } = await supabase.from("ticket_categories").select("*").eq("isActive", true);
    const { data: subcategories } = await supabase.from("ticket_subcategories").select("*").eq("isActive", true);
    return (categories ?? []).map((cat) => ({
      ...cat,
      subcategories: (subcategories ?? []).filter((sub) => sub.categoryId === cat.id)
    }));
  }),
  listAll: adminQuery.query(async () => {
    const supabase = getSupabaseAdmin();
    const { data: categories } = await supabase.from("ticket_categories").select("*");
    const { data: subcategories } = await supabase.from("ticket_subcategories").select("*");
    return (categories ?? []).map((cat) => ({
      ...cat,
      subcategories: (subcategories ?? []).filter((sub) => sub.categoryId === cat.id)
    }));
  }),
  create: adminQuery.input(
    z8.object({
      name: z8.string().min(1).max(255),
      description: z8.string().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("ticket_categories").insert({
      name: input.name,
      description: input.description ?? null,
      isActive: true
    }).select("id").single();
    if (error) throw new Error(error.message);
    await createAuditLog({
      userId: ctx.user.id,
      userType: "admin",
      action: "create_category",
      entityType: "ticketCategory",
      entityId: data.id
    });
    return { id: data.id };
  }),
  update: adminQuery.input(
    z8.object({
      id: z8.string(),
      name: z8.string().min(1).max(255).optional(),
      description: z8.string().optional(),
      isActive: z8.boolean().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { id, ...updates } = input;
    const { error } = await supabase.from("ticket_categories").update({ ...updates, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
    await createAuditLog({
      userId: ctx.user.id,
      userType: "admin",
      action: "update_category",
      entityType: "ticketCategory",
      entityId: id
    });
    return { success: true };
  }),
  delete: adminQuery.input(z8.object({ id: z8.string() })).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { count } = await supabase.from("tickets").select("*", { count: "exact", head: true }).eq("categoryId", input.id);
    if ((count ?? 0) > 0) {
      throw new Error("Cannot delete category that is in use");
    }
    const { error: delSubErr } = await supabase.from("ticket_subcategories").delete().eq("categoryId", input.id);
    if (delSubErr) throw new Error(delSubErr.message);
    const { error } = await supabase.from("ticket_categories").delete().eq("id", input.id);
    if (error) throw new Error(error.message);
    await createAuditLog({
      userId: ctx.user.id,
      userType: "admin",
      action: "delete_category",
      entityType: "ticketCategory",
      entityId: input.id
    });
    return { success: true };
  }),
  createSubcategory: adminQuery.input(
    z8.object({
      categoryId: z8.string(),
      name: z8.string().min(1).max(255),
      description: z8.string().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("ticket_subcategories").insert({
      categoryId: input.categoryId,
      name: input.name,
      description: input.description ?? null,
      isActive: true
    }).select("id").single();
    if (error) throw new Error(error.message);
    await createAuditLog({
      userId: ctx.user.id,
      userType: "admin",
      action: "create_subcategory",
      entityType: "ticketSubcategory",
      entityId: data.id
    });
    return { id: data.id };
  }),
  updateSubcategory: adminQuery.input(
    z8.object({
      id: z8.string(),
      name: z8.string().min(1).max(255).optional(),
      description: z8.string().optional(),
      isActive: z8.boolean().optional()
    })
  ).mutation(async ({ input }) => {
    const supabase = getSupabaseAdmin();
    const { id, ...updates } = input;
    const { error } = await supabase.from("ticket_subcategories").update(updates).eq("id", id);
    if (error) throw new Error(error.message);
    return { success: true };
  }),
  deleteSubcategory: adminQuery.input(z8.object({ id: z8.string() })).mutation(async ({ input }) => {
    const supabase = getSupabaseAdmin();
    const { count } = await supabase.from("tickets").select("*", { count: "exact", head: true }).eq("subcategoryId", input.id);
    if ((count ?? 0) > 0) {
      throw new Error("Cannot delete subcategory that is in use");
    }
    const { error } = await supabase.from("ticket_subcategories").delete().eq("id", input.id);
    if (error) throw new Error(error.message);
    return { success: true };
  })
});

// server/ticket-priority-router.ts
import { z as z9 } from "../node_modules/zod/index.js";
init_supabase();
var ticketPriorityRouter = createRouter({
  list: publicQuery.query(async () => {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from("ticket_priorities").select("*").order("sortOrder", { ascending: true });
    return data ?? [];
  }),
  create: adminQuery.input(
    z9.object({
      name: z9.string().min(1).max(50),
      color: z9.string().regex(/^#[0-9A-Fa-f]{6}$/),
      sortOrder: z9.number()
    })
  ).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("ticket_priorities").insert({
      name: input.name,
      color: input.color,
      sortOrder: input.sortOrder
    }).select("id").single();
    if (error) throw new Error(error.message);
    await createAuditLog({
      userId: ctx.user.id,
      userType: "admin",
      action: "create_priority",
      entityType: "ticketPriority",
      entityId: data.id
    });
    return { id: data.id };
  }),
  update: adminQuery.input(
    z9.object({
      id: z9.string(),
      name: z9.string().min(1).max(50).optional(),
      color: z9.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      sortOrder: z9.number().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { id, ...updates } = input;
    const { error } = await supabase.from("ticket_priorities").update(updates).eq("id", id);
    if (error) throw new Error(error.message);
    await createAuditLog({
      userId: ctx.user.id,
      userType: "admin",
      action: "update_priority",
      entityType: "ticketPriority",
      entityId: id
    });
    return { success: true };
  }),
  delete: adminQuery.input(z9.object({ id: z9.string() })).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { count } = await supabase.from("tickets").select("*", { count: "exact", head: true }).eq("priorityId", input.id);
    if ((count ?? 0) > 0) {
      throw new Error("Cannot delete priority that is in use");
    }
    const { error } = await supabase.from("ticket_priorities").delete().eq("id", input.id);
    if (error) throw new Error(error.message);
    await createAuditLog({
      userId: ctx.user.id,
      userType: "admin",
      action: "delete_priority",
      entityType: "ticketPriority",
      entityId: input.id
    });
    return { success: true };
  })
});

// server/notification-router.ts
import { z as z10 } from "../node_modules/zod/index.js";
init_supabase();
var notificationRouter = createRouter({
  list: authedQuery.input(
    z10.object({
      page: z10.number().default(1),
      limit: z10.number().default(20),
      unreadOnly: z10.boolean().default(false)
    }).optional()
  ).query(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const params = input || { page: 1, limit: 20, unreadOnly: false };
    const recipientId = ctx.user.id;
    const recipientType = ctx.user.type;
    let countQuery = supabase.from("notifications").select("*", { count: "exact", head: true }).eq("recipientId", recipientId).eq("recipientType", recipientType);
    if (params.unreadOnly) {
      countQuery = countQuery.eq("isRead", false);
    }
    const { count } = await countQuery;
    let itemsQuery = supabase.from("notifications").select("*").eq("recipientId", recipientId).eq("recipientType", recipientType);
    if (params.unreadOnly) {
      itemsQuery = itemsQuery.eq("isRead", false);
    }
    const { data: items } = await itemsQuery.order("createdAt", { ascending: false }).range((params.page - 1) * params.limit, params.page * params.limit - 1);
    return {
      items: items ?? [],
      total: count ?? 0
    };
  }),
  unreadCount: authedQuery.query(async ({ ctx }) => {
    const supabase = getSupabaseAdmin();
    const { count } = await supabase.from("notifications").select("*", { count: "exact", head: true }).eq("recipientId", ctx.user.id).eq("recipientType", ctx.user.type).eq("isRead", false);
    return { count: count ?? 0 };
  }),
  markAsRead: authedQuery.input(z10.object({ id: z10.string() })).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("notifications").update({ isRead: true }).eq("id", input.id).eq("recipientId", ctx.user.id).eq("recipientType", ctx.user.type);
    if (error) throw new Error(error.message);
    return { success: true };
  }),
  markAllAsRead: authedQuery.mutation(async ({ ctx }) => {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("notifications").update({ isRead: true }).eq("recipientId", ctx.user.id).eq("recipientType", ctx.user.type).eq("isRead", false);
    if (error) throw new Error(error.message);
    return { success: true };
  }),
  delete: authedQuery.input(z10.object({ id: z10.string() })).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("notifications").delete().eq("id", input.id).eq("recipientId", ctx.user.id).eq("recipientType", ctx.user.type);
    if (error) throw new Error(error.message);
    return { success: true };
  })
});

// server/audit-log-router.ts
import { z as z11 } from "../node_modules/zod/index.js";
init_supabase();
var auditLogRouter = createRouter({
  list: adminQuery.input(
    z11.object({
      page: z11.number().default(1),
      limit: z11.number().default(25),
      action: z11.string().optional(),
      entityType: z11.string().optional(),
      userId: z11.string().optional(),
      dateFrom: z11.string().optional(),
      dateTo: z11.string().optional()
    }).optional()
  ).query(async ({ input }) => {
    const supabase = getSupabaseAdmin();
    const params = input || { page: 1, limit: 25 };
    const applyFilters = (q) => {
      if (params.action) q = q.ilike("action", `%${params.action}%`);
      if (params.entityType) q = q.eq("entityType", params.entityType);
      if (params.userId) q = q.eq("userId", params.userId);
      if (params.dateFrom) q = q.gte("createdAt", params.dateFrom);
      if (params.dateTo) q = q.lte("createdAt", params.dateTo);
      return q;
    };
    const countQuery = applyFilters(
      supabase.from("audit_logs").select("*", { count: "exact", head: true })
    );
    const { count } = await countQuery;
    const itemsQuery = applyFilters(
      supabase.from("audit_logs").select("*")
    );
    const { data: items } = await itemsQuery.order("createdAt", { ascending: false }).range((params.page - 1) * params.limit, params.page * params.limit - 1);
    const total = count ?? 0;
    return {
      items: items ?? [],
      total,
      page: params.page,
      limit: params.limit,
      totalPages: Math.ceil(total / params.limit)
    };
  })
});

// server/settings-router.ts
import { z as z12 } from "../node_modules/zod/index.js";
init_supabase();
var settingsRouter = createRouter({
  list: publicQuery.query(async () => {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from("system_settings").select("*");
    const settingsMap = {};
    for (const s of data ?? []) {
      settingsMap[s.key] = s.value;
    }
    return settingsMap;
  }),
  get: publicQuery.input(z12.object({ key: z12.string() })).query(async ({ input }) => {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from("system_settings").select("value").eq("key", input.key).maybeSingle();
    return data?.value || null;
  }),
  update: adminQuery.input(z12.object({ settings: z12.record(z12.string(), z12.string()) })).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const rows = Object.entries(input.settings).map(([key, value]) => ({
      key,
      value,
      updatedAt: now,
      updatedBy: ctx.user.id
    }));
    await supabase.from("system_settings").upsert(rows, { onConflict: "key" });
    await createAuditLog({
      userId: ctx.user.id,
      userType: "admin",
      action: "update_settings",
      entityType: "systemSettings",
      details: { keys: Object.keys(input.settings) }
    });
    return { success: true };
  }),
  previewTicketNumber: adminQuery.query(async () => {
    const supabase = getSupabaseAdmin();
    const { data: formatRows } = await supabase.from("system_settings").select("value").eq("key", "ticket_number_format").maybeSingle();
    const { data: counterRows } = await supabase.from("system_settings").select("value").eq("key", "ticket_number_counter").maybeSingle();
    const format = formatRows?.value || "RC-YYYY-XXXXXX";
    const counter = parseInt(counterRows?.value || "0", 10) + 1;
    const year = (/* @__PURE__ */ new Date()).getFullYear().toString();
    const preview = format.replace("YYYY", year).replace("XXXXXX", counter.toString().padStart(6, "0"));
    return { preview, format };
  })
});

// server/dashboard-router.ts
init_supabase();
var dashboardRouter = createRouter({
  adminStats: adminQuery.query(async () => {
    const supabase = getSupabaseAdmin();
    const { count: totalTickets } = await supabase.from("tickets").select("*", { count: "exact", head: true });
    const { count: totalBranches } = await supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "branch");
    const { count: activeBranches } = await supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "branch").eq("isActive", true);
    const { data: statuses } = await supabase.from("ticket_statuses").select("*").order("sortOrder", { ascending: true });
    const { data: allTickets } = await supabase.from("tickets").select("*");
    const statusCountMap = /* @__PURE__ */ new Map();
    for (const t2 of allTickets ?? []) {
      if (t2.statusId) {
        statusCountMap.set(t2.statusId, (statusCountMap.get(t2.statusId) || 0) + 1);
      }
    }
    const { data: priorities } = await supabase.from("ticket_priorities").select("*").order("sortOrder", { ascending: true });
    const priorityCountMap = /* @__PURE__ */ new Map();
    for (const t2 of allTickets ?? []) {
      if (t2.priorityId) {
        priorityCountMap.set(t2.priorityId, (priorityCountMap.get(t2.priorityId) || 0) + 1);
      }
    }
    const branchCountMap = /* @__PURE__ */ new Map();
    for (const t2 of allTickets ?? []) {
      if (t2.branchId) {
        branchCountMap.set(t2.branchId, (branchCountMap.get(t2.branchId) || 0) + 1);
      }
    }
    const { data: allBranches } = await supabase.from("profiles").select("*").eq("role", "branch");
    const branchMap = /* @__PURE__ */ new Map();
    for (const b of allBranches ?? []) {
      branchMap.set(b.id, b.branchName || `Branch ${b.id}`);
    }
    const branchPerf = Array.from(branchCountMap.entries()).map(([branchId, count]) => ({
      branchName: branchMap.get(branchId) || `Branch ${branchId}`,
      count
    })).sort((a, b) => b.count - a.count).slice(0, 10);
    const deptCounts = { IT: 0, "Branch Admin": 0, Manager: 0 };
    for (const t2 of allTickets ?? []) {
      const role = t2.branchRole;
      if (role && role in deptCounts) {
        deptCounts[role]++;
      }
    }
    const departmentCounts = [
      { name: "IT", count: deptCounts.IT, color: "#3B82F6" },
      { name: "Branch Admin", count: deptCounts["Branch Admin"], color: "#8B5CF6" },
      { name: "Manager", count: deptCounts.Manager, color: "#F59E0B" }
    ];
    const { data: recentTickets } = await supabase.from("tickets").select("*").order("createdAt", { ascending: false }).limit(10);
    const { data: branchList } = await supabase.from("branches").select("id, name");
    const { data: orderItems } = await supabase.from("stationary_order_items").select("quantity, unitPrice, lineTotal, orderId");
    const { data: orders } = await supabase.from("stationary_orders").select("id, branchId");
    const orderBranchMap = new Map((orders ?? []).map((o) => [o.id, o.branchId]));
    const branchBudgetMap = /* @__PURE__ */ new Map();
    for (const item of orderItems ?? []) {
      const branchId = orderBranchMap.get(item.orderId);
      if (branchId) {
        const total = item.lineTotal ?? item.quantity * (item.unitPrice ?? 0);
        branchBudgetMap.set(branchId, (branchBudgetMap.get(branchId) || 0) + total);
      }
    }
    const branchNameMap = new Map((branchList ?? []).map((b) => [b.id, b.name]));
    const stationaryBudget = Array.from(branchBudgetMap.entries()).map(([branchId, total]) => ({
      branchName: branchNameMap.get(branchId) || `Branch ${branchId}`,
      total: Math.round(total * 100) / 100
    })).sort((a, b) => b.total - a.total);
    return {
      totalTickets: Number(totalTickets || 0),
      totalBranches: Number(totalBranches || 0),
      activeBranches: Number(activeBranches || 0),
      statusDistribution: (statuses ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        count: Number(statusCountMap.get(s.id) || 0)
      })),
      priorityDistribution: (priorities ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        count: Number(priorityCountMap.get(p.id) || 0)
      })),
      departmentCounts,
      branchPerformance: branchPerf,
      stationaryBudget,
      recentTickets: recentTickets ?? []
    };
  }),
  branchStats: authedQuery.query(async ({ ctx }) => {
    const supabase = getSupabaseAdmin();
    if (ctx.user.type !== "branch") {
      throw new Error("Branch stats only available for branch users");
    }
    const branchId = ctx.user.id;
    const { count: totalTickets } = await supabase.from("tickets").select("*", { count: "exact", head: true }).eq("branchId", branchId);
    const { data: statuses } = await supabase.from("ticket_statuses").select("*").order("sortOrder", { ascending: true });
    const { data: branchTickets } = await supabase.from("tickets").select("*").eq("branchId", branchId);
    const statusCountMap = /* @__PURE__ */ new Map();
    for (const t2 of branchTickets ?? []) {
      if (t2.statusId) {
        statusCountMap.set(t2.statusId, (statusCountMap.get(t2.statusId) || 0) + 1);
      }
    }
    const ticketIds = (branchTickets ?? []).map((t2) => t2.id);
    let recentActivity = [];
    if (ticketIds.length > 0) {
      const { data: timeline } = await supabase.from("ticket_timeline").select("*").in("ticketId", ticketIds).order("createdAt", { ascending: false }).limit(10);
      recentActivity = timeline ?? [];
    }
    const { data: recentTickets } = await supabase.from("tickets").select("*").eq("branchId", branchId).order("createdAt", { ascending: false }).limit(5);
    return {
      totalTickets: Number(totalTickets || 0),
      statusBreakdown: (statuses ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        isOpen: s.isOpen,
        count: Number(statusCountMap.get(s.id) || 0)
      })),
      recentActivity,
      recentTickets: recentTickets ?? []
    };
  })
});

// server/report-router.ts
import { z as z13 } from "../node_modules/zod/index.js";
init_supabase();
var reportRouter = createRouter({
  generate: adminQuery.input(
    z13.object({
      dateFrom: z13.string(),
      dateTo: z13.string(),
      branchIds: z13.array(z13.string()).optional(),
      categoryIds: z13.array(z13.string()).optional(),
      priorityIds: z13.array(z13.string()).optional(),
      statusIds: z13.array(z13.string()).optional()
    })
  ).query(async ({ input }) => {
    const supabase = getSupabaseAdmin();
    let query = supabase.from("tickets").select("*").gte("createdAt", input.dateFrom).lte("createdAt", input.dateTo);
    if (input.branchIds && input.branchIds.length > 0) {
      query = query.in("branchId", input.branchIds);
    }
    if (input.categoryIds && input.categoryIds.length > 0) {
      query = query.in("categoryId", input.categoryIds);
    }
    if (input.priorityIds && input.priorityIds.length > 0) {
      query = query.in("priorityId", input.priorityIds);
    }
    if (input.statusIds && input.statusIds.length > 0) {
      query = query.in("statusId", input.statusIds);
    }
    const { data: ticketList } = await query.order("createdAt", { ascending: false });
    const tickets = ticketList ?? [];
    const { data: allStatuses } = await supabase.from("ticket_statuses").select("*");
    const { data: allPriorities } = await supabase.from("ticket_priorities").select("*");
    const { data: allCategories } = await supabase.from("ticket_categories").select("*");
    const { data: allBranches } = await supabase.from("profiles").select("*").eq("role", "branch");
    const statusRows = allStatuses ?? [];
    const priorityRows = allPriorities ?? [];
    const categoryRows = allCategories ?? [];
    const branchRows = allBranches ?? [];
    const statusName = (id) => statusRows.find((s) => s.id === id)?.name || "Unknown";
    const statusColor = (id) => statusRows.find((s) => s.id === id)?.color || "#ccc";
    const priorityName = (id) => priorityRows.find((p) => p.id === id)?.name || "Unknown";
    const priorityColor = (id) => priorityRows.find((p) => p.id === id)?.color || "#ccc";
    const categoryName = (id) => categoryRows.find((c) => c.id === id)?.name || "Unknown";
    const branchName = (id) => branchRows.find((b) => b.id === id)?.branchName || `Branch ${id}`;
    const groupCount = (key) => {
      const map = /* @__PURE__ */ new Map();
      for (const t2 of tickets) {
        const v = t2[key];
        if (v) map.set(v, (map.get(v) || 0) + 1);
      }
      return map;
    };
    const statusCountMap = groupCount("statusId");
    const priorityCountMap = groupCount("priorityId");
    const branchCountMap = groupCount("branchId");
    const categoryCountMap = groupCount("categoryId");
    return {
      summary: {
        totalTickets: tickets.length,
        dateRange: { from: input.dateFrom, to: input.dateTo }
      },
      byStatus: Array.from(statusCountMap.entries()).map(([statusId, count]) => ({
        status: statusName(statusId),
        color: statusColor(statusId),
        count
      })),
      byPriority: Array.from(priorityCountMap.entries()).map(([priorityId, count]) => ({
        priority: priorityName(priorityId),
        color: priorityColor(priorityId),
        count
      })),
      byBranch: Array.from(branchCountMap.entries()).map(([branchId, count]) => ({
        branch: branchName(branchId),
        count
      })),
      byCategory: Array.from(categoryCountMap.entries()).map(([categoryId, count]) => ({
        category: categoryName(categoryId),
        count
      })),
      tickets
    };
  })
});

// server/stationary-router.ts
import { z as z14 } from "../node_modules/zod/index.js";
init_supabase();

// server/lib/db-types.ts
function mapProfileToUnifiedUser(p) {
  if (p.role === "admin") {
    return {
      type: "admin",
      id: p.id,
      name: p.name,
      email: p.email,
      role: "admin",
      avatar: p.avatar
    };
  }
  if (p.role === "cluster") {
    return {
      type: "cluster",
      id: p.id,
      name: p.name,
      email: p.email,
      role: "cluster",
      clusterId: p.clusterId,
      clusterName: p.name
    };
  }
  return {
    type: "branch",
    id: p.id,
    name: p.contactPerson || p.branchName || "",
    branchName: p.branchName || "",
    branchCode: p.branchCode || "",
    role: "branch",
    branchRole: p.branchRole,
    branchId: p.branchId,
    clusterId: p.clusterId,
    email: p.email || "",
    username: p.email || p.branchCode || ""
  };
}

// server/stationary-router.ts
init_email_service();
var PORTAL_SETTINGS_ID = "00000000-0000-0000-0000-000000000000";
async function getPortalSettings(supabase) {
  const { data } = await supabase.from("stationary_portal_settings").select("*").eq("id", PORTAL_SETTINGS_ID).maybeSingle();
  return data;
}
function nowWindowOpen(settings) {
  if (!settings) return false;
  const now = Date.now();
  const open = settings.windowOpenAt ? new Date(settings.windowOpenAt).getTime() : null;
  const close = settings.windowCloseAt ? new Date(settings.windowCloseAt).getTime() : null;
  if (open !== null && now < open) return false;
  if (close !== null && now > close) return false;
  return true;
}
function getActingBranchId(ctx) {
  const id = ctx.user.branchId;
  if (!id) throw new Error("Your account is not linked to a branch");
  return id;
}
var stationaryRouter = createRouter({
  // ---------------- Admin: items ----------------
  listItems: adminQuery.input(z14.object({ includeInactive: z14.boolean().default(false) }).optional()).query(async ({ input }) => {
    const supabase = getSupabaseAdmin();
    let query = supabase.from("stationary_items").select("*").order("name", { ascending: true });
    if (!input?.includeInactive) query = query.eq("isActive", true);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map((i) => ({
      id: i.id,
      name: i.name,
      description: i.description,
      unit: i.unit,
      price: i.price ?? 0,
      threshold: i.threshold ?? 0,
      isActive: i.isActive,
      createdAt: i.createdAt
    }));
  }),
  createItem: adminQuery.input(
    z14.object({
      name: z14.string().min(1),
      description: z14.string().optional(),
      unit: z14.string().optional(),
      price: z14.number().min(0).default(0),
      threshold: z14.number().int().min(0).default(0)
    })
  ).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("stationary_items").insert({
      name: input.name,
      description: input.description ?? null,
      unit: input.unit ?? null,
      price: input.price,
      threshold: input.threshold
    }).select("id").single();
    if (error) throw new Error(error.message);
    await createAuditLog({ userId: ctx.user.id, userType: "admin", action: "create_stationary_item", entityType: "stationaryItem", entityId: data.id, details: { name: input.name } });
    return { id: data.id };
  }),
  updateItem: adminQuery.input(
    z14.object({
      id: z14.string(),
      name: z14.string().min(1).optional(),
      description: z14.string().optional(),
      unit: z14.string().optional(),
      price: z14.number().min(0).optional(),
      threshold: z14.number().int().min(0).optional(),
      isActive: z14.boolean().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { id, ...rest } = input;
    const set = {};
    if (rest.name !== void 0) set.name = rest.name;
    if (rest.description !== void 0) set.description = rest.description;
    if (rest.unit !== void 0) set.unit = rest.unit;
    if (rest.price !== void 0) set.price = rest.price;
    if (rest.threshold !== void 0) set.threshold = rest.threshold;
    if (rest.isActive !== void 0) set.isActive = rest.isActive;
    const { error } = await supabase.from("stationary_items").update(set).eq("id", id);
    if (error) throw new Error(error.message);
    await createAuditLog({ userId: ctx.user.id, userType: "admin", action: "update_stationary_item", entityType: "stationaryItem", entityId: id });
    return { success: true };
  }),
  deleteItem: adminQuery.input(z14.object({ id: z14.string() })).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { count } = await supabase.from("stationary_order_items").select("*", { count: "exact", head: true }).eq("itemId", input.id);
    if ((count ?? 0) > 0) throw new Error("Cannot delete item that has been ordered. Deactivate it instead.");
    const { error } = await supabase.from("stationary_items").delete().eq("id", input.id);
    if (error) throw new Error(error.message);
    await createAuditLog({ userId: ctx.user.id, userType: "admin", action: "delete_stationary_item", entityType: "stationaryItem", entityId: input.id });
    return { success: true };
  }),
  // ---------------- Admin: portal settings ----------------
  getPortalSettings: adminQuery.query(async () => {
    const supabase = getSupabaseAdmin();
    const data = await getPortalSettings(supabase);
    return {
      enabled: data?.enabled ?? false,
      windowOpenAt: data?.windowOpenAt ?? null,
      windowCloseAt: data?.windowCloseAt ?? null,
      allowedRoles: data?.allowedRoles ?? []
    };
  }),
  updatePortalSettings: adminQuery.input(
    z14.object({
      enabled: z14.boolean().optional(),
      windowOpenAt: z14.string().nullable().optional(),
      windowCloseAt: z14.string().nullable().optional(),
      allowedRoles: z14.array(z14.enum(["IT", "Branch Admin", "Manager"])).optional()
    })
  ).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const set = { updatedAt: (/* @__PURE__ */ new Date()).toISOString(), updatedBy: ctx.user.id };
    if (input.enabled !== void 0) set.enabled = input.enabled;
    if (input.windowOpenAt !== void 0) set.windowOpenAt = input.windowOpenAt;
    if (input.windowCloseAt !== void 0) set.windowCloseAt = input.windowCloseAt;
    if (input.allowedRoles !== void 0) set.allowedRoles = input.allowedRoles;
    const { error } = await supabase.from("stationary_portal_settings").update(set).eq("id", PORTAL_SETTINGS_ID);
    if (error) throw new Error(error.message);
    await createAuditLog({ userId: ctx.user.id, userType: "admin", action: "update_stationary_portal", entityType: "stationaryPortal", details: { ...input } });
    return { success: true };
  }),
  // ---------------- Branch: portal access check ----------------
  // Returns whether the current branch user can currently order + the active window.
  getPortalStatus: authedQuery.query(async ({ ctx }) => {
    const supabase = getSupabaseAdmin();
    const settings = await getPortalSettings(supabase);
    const enabled = settings?.enabled ?? false;
    const inWindow = nowWindowOpen(settings);
    const allowedRoles = settings?.allowedRoles ?? [];
    const userRole = ctx.user.branchRole;
    const roleAllowed = ctx.user.role === "admin" ? true : !!userRole && allowedRoles.includes(userRole);
    const canOrder = enabled && inWindow && roleAllowed;
    return {
      enabled,
      inWindow,
      roleAllowed,
      canOrder,
      windowOpenAt: settings?.windowOpenAt ?? null,
      windowCloseAt: settings?.windowCloseAt ?? null,
      allowedRoles
    };
  }),
  // ---------------- Branch: items available to order (with remaining quota) ----------------
  getOrderableItems: authedQuery.query(async ({ ctx }) => {
    const supabase = getSupabaseAdmin();
    if (ctx.user.role !== "branch") throw new Error("Only branch users can order stationary");
    const branchId = getActingBranchId(ctx);
    const { data: items, error } = await supabase.from("stationary_items").select("*").eq("isActive", true).order("name", { ascending: true });
    if (error) throw new Error(error.message);
    const settings = await getPortalSettings(supabase);
    let orderedSince = null;
    if (settings?.windowOpenAt) {
      orderedSince = settings.windowOpenAt;
    }
    const { data: myOrders } = await supabase.from("stationary_orders").select("id").eq("branchId", branchId).neq("status", "cancelled").gte("createdAt", orderedSince ?? "1970-01-01");
    const orderIds = (myOrders ?? []).map((o) => o.id);
    let orderedItems = {};
    if (orderIds.length > 0) {
      const { data: lineItems } = await supabase.from("stationary_order_items").select("itemId, quantity").in("orderId", orderIds);
      for (const li of lineItems ?? []) {
        orderedItems[li.itemId] = (orderedItems[li.itemId] ?? 0) + li.quantity;
      }
    }
    return (items ?? []).map((i) => {
      const ordered = orderedItems[i.id] ?? 0;
      const threshold = i.threshold ?? 0;
      const remaining = Math.max(0, threshold - ordered);
      return {
        id: i.id,
        name: i.name,
        description: i.description,
        unit: i.unit,
        price: i.price ?? 0,
        threshold,
        ordered,
        remaining
      };
    });
  }),
  // ---------------- Branch: place an order ----------------
  placeOrder: authedQuery.input(
    z14.object({
      items: z14.array(z14.object({ itemId: z14.string(), quantity: z14.number().int().min(1) })).min(1),
      orderDate: z14.string().optional()
    })
  ).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    if (ctx.user.role !== "branch") throw new Error("Only branch users can order stationary");
    const branchId = getActingBranchId(ctx);
    const settings = await getPortalSettings(supabase);
    if (!(settings?.enabled ?? false)) throw new Error("Stationary portal is disabled");
    if (!nowWindowOpen(settings)) throw new Error("Stationary portal ordering window is closed");
    const allowedRoles = settings?.allowedRoles ?? [];
    const userRole = ctx.user.branchRole;
    if (!userRole || !allowedRoles.includes(userRole)) throw new Error("Your role is not allowed to order stationary");
    const { data: items, error } = await supabase.from("stationary_items").select("*").in("id", input.items.map((it) => it.itemId));
    if (error) throw new Error(error.message);
    const itemMap = new Map(items?.map((i) => [i.id, i]) ?? []);
    for (const it of input.items) {
      const item = itemMap.get(it.itemId);
      if (!item) throw new Error("Unknown item");
      if (!(item.isActive ?? true)) throw new Error(`Item ${item.name} is not active`);
    }
    const { data: branchProfile } = await supabase.from("profiles").select("clusterId").eq("id", ctx.user.id).maybeSingle();
    const clusterId = branchProfile?.clusterId ?? null;
    const orderedSince = settings?.windowOpenAt ?? "1970-01-01";
    const { data: existingOrders } = await supabase.from("stationary_orders").select("id").eq("branchId", branchId).eq("status", "pending").gte("createdAt", orderedSince).order("createdAt", { ascending: false }).limit(1);
    const orderId = existingOrders?.[0]?.id ?? (await supabase.from("stationary_orders").insert({ branchId, createdBy: ctx.user.id, clusterId, orderDate: input.orderDate ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) }).select("id").single()).data?.id;
    if (!orderId) throw new Error("Failed to create order");
    const { data: existingLines } = await supabase.from("stationary_order_items").select("itemId, quantity").eq("orderId", orderId);
    const already = {};
    for (const li of existingLines ?? []) already[li.itemId] = (already[li.itemId] ?? 0) + li.quantity;
    const lineInserts = [];
    for (const it of input.items) {
      const item = itemMap.get(it.itemId);
      const threshold = item.threshold ?? 0;
      const used = already[it.itemId] ?? 0;
      if (threshold > 0 && used + it.quantity > threshold) {
        throw new Error(`Order exceeds the per-branch limit for ${item.name} (max ${threshold}, already ordered ${used})`);
      }
      const unitPrice = Number(item.price ?? 0);
      lineInserts.push({ orderId, itemId: it.itemId, quantity: it.quantity, unitPrice, lineTotal: unitPrice * it.quantity });
    }
    const { error: lineErr } = await supabase.from("stationary_order_items").insert(lineInserts);
    if (lineErr) throw new Error(lineErr.message);
    await createAuditLog({ userId: ctx.user.id, userType: "branch", userName: ctx.user.name, action: "place_stationary_order", entityType: "stationaryOrder", entityId: orderId });
    try {
      if (clusterId) {
        const { data: clusterUsers } = await supabase.from("profiles").select("id, email").eq("clusterId", clusterId).eq("role", "cluster").eq("isActive", true);
        const { data: sender } = await supabase.from("profiles").select("branchName, email").eq("id", ctx.user.id).maybeSingle();
        const { data: clusterInfo } = await supabase.from("clusters").select("name").eq("id", clusterId).maybeSingle();
        if (clusterUsers?.length && sender?.email) {
          const branchLabel = sender.branchName || "Branch";
          const clusterLabel = clusterInfo?.name || "Cluster";
          const itemList = input.items.map((it) => {
            const item = itemMap.get(it.itemId);
            return `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">${item?.name || it.itemId}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">${it.quantity}</td></tr>`;
          }).join("");
          for (const cu of clusterUsers) {
            if (cu.email) {
              await sendEmailFromUser(
                ctx.user.id,
                cu.email,
                `New Stationary Order from ${branchLabel}`,
                `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                    <h2 style="color:#DC2626;">New Stationary Order</h2>
                    <table style="width:100%;border-collapse:collapse;">
                      <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Branch</td><td style="padding:8px;border-bottom:1px solid #eee;">${branchLabel}</td></tr>
                      <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Cluster</td><td style="padding:8px;border-bottom:1px solid #eee;">${clusterLabel}</td></tr>
                      <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Order Date</td><td style="padding:8px;border-bottom:1px solid #eee;">${input.orderDate || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}</td></tr>
                    </table>
                    <h3 style="margin-top:16px;">Items Ordered</h3>
                    <table style="width:100%;border-collapse:collapse;border:1px solid #eee;">
                      <thead><tr style="background:#f9fafb;"><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #ddd;">Item</th><th style="padding:6px 8px;text-align:center;border-bottom:2px solid #ddd;">Qty</th></tr></thead>
                      <tbody>${itemList}</tbody>
                    </table>
                    <p style="margin-top:16px;color:#666;">Please review and approve this order in the Ramaiah Capital Stationary Portal.</p>
                  </div>`
              );
            }
          }
        }
      }
    } catch (e) {
      console.error("Stationary email failed:", e);
    }
    return { id: orderId };
  }),
  // ---------------- Branch: my orders ----------------
  myOrders: authedQuery.query(async ({ ctx }) => {
    const supabase = getSupabaseAdmin();
    if (ctx.user.role !== "branch") throw new Error("Only branch users can view their orders");
    const branchId = getActingBranchId(ctx);
    const { data, error } = await supabase.from("stationary_orders").select("*, stationary_order_items(*, stationary_items(name, unit))").eq("branchId", branchId).order("createdAt", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((o) => ({
      id: o.id,
      status: o.status,
      orderDate: o.orderDate,
      createdAt: o.createdAt,
      total: (o.stationary_order_items ?? []).reduce((s, li) => s + Number(li.lineTotal ?? 0), 0),
      items: (o.stationary_order_items ?? []).map((li) => ({
        id: li.id,
        itemId: li.itemId,
        quantity: li.quantity,
        unitPrice: li.unitPrice ?? 0,
        lineTotal: li.lineTotal ?? 0,
        name: li.stationary_items?.name ?? "",
        unit: li.stationary_items?.unit ?? null
      }))
    }));
  }),
  // ---------------- Admin: reports ----------------
  reports: adminQuery.input(
    z14.object({
      from: z14.string().optional(),
      to: z14.string().optional(),
      branchId: z14.string().optional(),
      month: z14.string().optional()
    }).optional()
  ).query(async ({ input }) => {
    const supabase = getSupabaseAdmin();
    let query = supabase.from("stationary_orders").select("*, stationary_order_items(*, stationary_items(name, unit))").or("clusterApprovedAt.not.is.null,clusterId.is.null").neq("status", "cancelled").order("createdAt", { ascending: false });
    if (input?.branchId) query = query.eq("branchId", input.branchId);
    let from = input?.from;
    let to = input?.to;
    if (input?.month) {
      const [y, m] = input.month.split("-");
      const start = new Date(Number(y), Number(m) - 1, 1);
      const end = new Date(Number(y), Number(m), 0, 23, 59, 59);
      from = start.toISOString();
      to = end.toISOString();
    }
    if (from) query = query.gte("createdAt", from);
    if (to) query = query.lte("createdAt", to);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const branchIds = Array.from(new Set((data ?? []).map((o) => o.branchId)));
    const fallbackIds = branchIds.length ? branchIds : ["00000000-0000-0000-0000-000000000000"];
    const [{ data: branches }, { data: profs }] = await Promise.all([
      supabase.from("branches").select("id, name, code").in("id", fallbackIds),
      supabase.from("profiles").select("id, branchName, branchCode, branchRole").in("id", fallbackIds)
    ]);
    const branchLookup = /* @__PURE__ */ new Map();
    for (const b of branches ?? []) branchLookup.set(b.id, { name: b.name, code: b.code, branchRole: null });
    for (const p of profs ?? []) if (!branchLookup.has(p.id)) branchLookup.set(p.id, { name: p.branchName, code: p.branchCode, branchRole: p.branchRole });
    const orders = (data ?? []).map((o) => ({
      id: o.id,
      branchId: o.branchId,
      branchName: branchLookup.get(o.branchId)?.name ?? "",
      branchCode: branchLookup.get(o.branchId)?.code ?? "",
      branchRole: branchLookup.get(o.branchId)?.branchRole ?? null,
      status: o.status,
      orderDate: o.orderDate,
      createdAt: o.createdAt,
      items: (o.stationary_order_items ?? []).map((li) => ({
        id: li.id,
        itemId: li.itemId,
        quantity: li.quantity,
        unitPrice: li.unitPrice ?? 0,
        lineTotal: li.lineTotal ?? 0,
        name: li.stationary_items?.name ?? "",
        unit: li.stationary_items?.unit ?? null
      }))
    }));
    const { data: allItems } = await supabase.from("stationary_items").select("id, name, unit, threshold, price");
    const thresholdMap = new Map((allItems ?? []).map((it) => [it.id, { unit: it.unit, threshold: it.threshold ?? 0, price: Number(it.price ?? 0) }]));
    const aggBranchMap = /* @__PURE__ */ new Map();
    const itemMap = /* @__PURE__ */ new Map();
    let grandTotal = 0;
    for (const o of orders) {
      const bKey = o.branchId;
      if (!aggBranchMap.has(bKey)) {
        aggBranchMap.set(bKey, { branchId: o.branchId, branchName: o.branchName, branchCode: o.branchCode, branchRole: o.branchRole, total: 0, items: {} });
      }
      const b = aggBranchMap.get(bKey);
      for (const li of o.items) {
        b.total += Number(li.lineTotal ?? 0);
        grandTotal += Number(li.lineTotal ?? 0);
        const meta = thresholdMap.get(li.itemId) ?? { unit: "", threshold: 0, price: 0 };
        const itemPrice = Number(li.unitPrice ?? meta.price);
        b.items[li.itemId] = b.items[li.itemId] ?? { name: li.name, qty: 0, price: itemPrice };
        b.items[li.itemId].qty += li.quantity;
        const im = itemMap.get(li.itemId) ?? { name: li.name, unit: meta.unit, threshold: meta.threshold, price: itemPrice, qty: 0, total: 0 };
        im.qty += li.quantity;
        im.total += Number(li.lineTotal ?? 0);
        itemMap.set(li.itemId, im);
      }
    }
    const byBranch = Array.from(aggBranchMap.values()).map((b) => ({
      branchId: b.branchId,
      branchName: b.branchName,
      branchCode: b.branchCode,
      branchRole: b.branchRole,
      total: b.total,
      items: Object.entries(b.items).map(([itemId, v]) => ({ itemId, name: v.name, qty: v.qty, price: v.price }))
    }));
    const byItem = Array.from(itemMap.entries()).map(([itemId, v]) => ({ itemId, name: v.name, unit: v.unit, threshold: v.threshold, price: v.price, qty: v.qty, total: v.total }));
    return { orders, byBranch, byItem, grandTotal };
  }),
  // ---------------- Admin: all orders (for editing branch order qty) ----------------
  listOrders: adminQuery.input(z14.object({ branchId: z14.string().optional(), status: z14.enum(["all", "pending", "fulfilled", "cancelled"]).default("all"), month: z14.string().optional() }).optional()).query(async ({ input }) => {
    const supabase = getSupabaseAdmin();
    const now = /* @__PURE__ */ new Date();
    const filterMonth = input?.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthStart = `${filterMonth}-01`;
    const [y, m] = filterMonth.split("-").map(Number);
    const monthEnd = new Date(y, m, 1).toISOString().slice(0, 10);
    let query = supabase.from("stationary_orders").select("*, stationary_order_items(*, stationary_items(name, unit))").gte("orderDate", monthStart).lt("orderDate", monthEnd).or("clusterApprovedAt.not.is.null,clusterId.is.null").order("createdAt", { ascending: false });
    if (input?.branchId) query = query.eq("branchId", input.branchId);
    if (input?.status && input.status !== "all") query = query.eq("status", input.status);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const branchIds = Array.from(new Set((data ?? []).map((o) => o.branchId)));
    const fallbackIds = branchIds.length ? branchIds : ["00000000-0000-0000-0000-000000000000"];
    const [{ data: branches }, { data: profs }] = await Promise.all([
      supabase.from("branches").select("id, name, code").in("id", fallbackIds),
      supabase.from("profiles").select("id, branchName, branchCode, branchRole").in("id", fallbackIds)
    ]);
    const branchLookup = /* @__PURE__ */ new Map();
    for (const b of branches ?? []) branchLookup.set(b.id, { name: b.name, code: b.code, branchRole: null });
    for (const p of profs ?? []) if (!branchLookup.has(p.id)) branchLookup.set(p.id, { name: p.branchName, code: p.branchCode, branchRole: p.branchRole });
    const mapped = (data ?? []).map((o) => ({
      id: o.id,
      branchId: o.branchId,
      branchName: branchLookup.get(o.branchId)?.name ?? "",
      branchCode: branchLookup.get(o.branchId)?.code ?? "",
      branchRole: branchLookup.get(o.branchId)?.branchRole ?? null,
      status: o.status,
      orderDate: o.orderDate,
      createdAt: o.createdAt,
      total: (o.stationary_order_items ?? []).reduce((s, li) => s + Number(li.lineTotal ?? 0), 0),
      items: (o.stationary_order_items ?? []).map((li) => ({
        id: li.id,
        itemId: li.itemId,
        quantity: li.quantity,
        unitPrice: li.unitPrice ?? 0,
        lineTotal: li.lineTotal ?? 0,
        name: li.stationary_items?.name ?? "",
        unit: li.stationary_items?.unit ?? null
      }))
    }));
    const branchTotalsMap = /* @__PURE__ */ new Map();
    for (const o of mapped) {
      const existing = branchTotalsMap.get(o.branchId);
      if (existing) {
        existing.total += o.total;
        existing.orderCount += 1;
      } else {
        branchTotalsMap.set(o.branchId, { branchName: o.branchName, branchCode: o.branchCode, total: o.total, orderCount: 1 });
      }
    }
    const branchTotals = Array.from(branchTotalsMap.values()).sort((a, b) => b.total - a.total);
    const grandTotal = mapped.reduce((s, o) => s + o.total, 0);
    return { orders: mapped, branchTotals, grandTotal };
  }),
  updateOrderItemQty: adminQuery.input(z14.object({ orderItemId: z14.string(), quantity: z14.number().int().min(0) })).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { data: li, error } = await supabase.from("stationary_order_items").update({ quantity: input.quantity }).eq("id", input.orderItemId).select("orderId").single();
    if (error) throw new Error(error.message);
    await createAuditLog({ userId: ctx.user.id, userType: "admin", action: "edit_stationary_order_qty", entityType: "stationaryOrder", entityId: li.orderId, details: { orderItemId: input.orderItemId, quantity: input.quantity } });
    return { success: true };
  }),
  setOrderStatus: adminQuery.input(z14.object({ orderId: z14.string(), status: z14.enum(["pending", "fulfilled", "cancelled"]) })).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("stationary_orders").update({ status: input.status }).eq("id", input.orderId);
    if (error) throw new Error(error.message);
    await createAuditLog({ userId: ctx.user.id, userType: "admin", action: "set_stationary_order_status", entityType: "stationaryOrder", entityId: input.orderId, details: { status: input.status } });
    return { success: true };
  }),
  listBranches: adminQuery.query(async () => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("branches").select("id, name, code").eq("isActive", true).order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((b) => ({ id: b.id, branchName: b.name, branchCode: b.code }));
  })
});

// server/google-auth-router.ts
import { z as z15 } from "../node_modules/zod/index.js";
init_supabase();
init_email_service();
var googleAuthRouter = createRouter({
  authUrl: authedQuery.query(async ({ ctx }) => {
    const url = getGoogleAuthUrl(ctx.user.id);
    return { url };
  }),
  callback: authedQuery.input(z15.object({ code: z15.string() })).mutation(async ({ ctx, input }) => {
    const supabase = getSupabaseAdmin();
    const tokens = await exchangeCodeForTokens(input.code);
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error("Failed to get Google tokens");
    }
    const googleEmail = await getGoogleEmail(tokens.access_token);
    const tokenExpiry = tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : new Date(Date.now() + 36e5).toISOString();
    await supabase.from("google_auth").upsert(
      {
        userId: ctx.user.id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry,
        googleEmail,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      },
      { onConflict: "userId" }
    );
    return { success: true, email: googleEmail };
  }),
  status: authedQuery.query(async ({ ctx }) => {
    const connected = await isUserConnected(ctx.user.id);
    if (!connected) return { connected: false, email: null };
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from("google_auth").select("googleEmail, updatedAt").eq("userId", ctx.user.id).maybeSingle();
    return {
      connected: true,
      email: data?.googleEmail || null,
      connectedAt: data?.updatedAt || null
    };
  }),
  disconnect: authedQuery.mutation(async ({ ctx }) => {
    await disconnectGoogle(ctx.user.id);
    return { success: true };
  })
});

// server/router.ts
var appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  branchUser: branchUserRouter,
  branch: branchRouter,
  cluster: clusterRouter,
  ticket: ticketRouter,
  ticketComment: ticketCommentRouter,
  ticketTimeline: ticketTimelineRouter,
  ticketStatus: ticketStatusRouter,
  ticketCategory: ticketCategoryRouter,
  ticketPriority: ticketPriorityRouter,
  notification: notificationRouter,
  auditLog: auditLogRouter,
  settings: settingsRouter,
  dashboard: dashboardRouter,
  report: reportRouter,
  stationary: stationaryRouter,
  googleAuth: googleAuthRouter
});

// server/context.ts
init_supabase();
async function loadProfileByAuthId(authId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("profiles").select("*").eq("id", authId).maybeSingle();
  if (error || !data) return null;
  return mapProfileToUnifiedUser(data);
}
async function createContext(opts) {
  const ctx = { req: opts.req, resHeaders: opts.resHeaders };
  const authHeader = opts.req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) {
    try {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase.auth.getUser(token);
      if (data.user) {
        const user = await loadProfileByAuthId(data.user.id);
        if (user) ctx.user = user;
      }
    } catch {
    }
  }
  return ctx;
}

// server/vercel-handler.ts
var app = new Hono();
app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.get("/api/google/callback", async (c) => {
  const url = new URL(c.req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return c.redirect("/#/settings?google=error");
  }
  try {
    const { exchangeCodeForTokens: exchangeCodeForTokens2, getGoogleEmail: getGoogleEmail2 } = await Promise.resolve().then(() => (init_email_service(), email_service_exports));
    const { getSupabaseAdmin: getSupabaseAdmin2 } = await Promise.resolve().then(() => (init_supabase(), supabase_exports));
    const tokens = await exchangeCodeForTokens2(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      return c.redirect("/#/settings?google=error");
    }
    const googleEmail = await getGoogleEmail2(tokens.access_token);
    const supabase = getSupabaseAdmin2();
    const tokenExpiry = tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : new Date(Date.now() + 36e5).toISOString();
    await supabase.from("google_auth").upsert(
      {
        userId: state,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry,
        googleEmail,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      },
      { onConflict: "userId" }
    );
    return c.redirect("/#/settings?google=connected");
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return c.redirect("/#/settings?google=error");
  }
});
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext
  });
});
app.all("*", (c) => c.json({ error: "Not Found" }, 404));
async function handler(req, res) {
  const protocol = "https";
  const host = req.headers.host || "localhost";
  const url = `${protocol}://${host}${req.url || "/"}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== void 0) {
      headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }
  }
  let body;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks).toString()));
      req.on("error", reject);
    });
  }
  const request = new Request(url, {
    method: req.method || "GET",
    headers,
    body: body || void 0
  });
  const response = await app.fetch(request);
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  const responseBody = await response.text();
  res.end(responseBody);
}
export {
  handler as default
};
