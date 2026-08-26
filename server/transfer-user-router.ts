import { z } from "zod";
import { createRouter, mainAdminQuery, adminQuery } from "./middleware.js";
import { getSupabaseAdmin } from "./lib/supabase.js";
import type { Profile } from "./lib/db-types.js";
import { createAuditLog } from "./lib/utils.js";

export const transferUserRouter = createRouter({
  list: mainAdminQuery
    .input(
      z.object({
        page: z.number().default(1),
        limit: z.number().default(50),
        search: z.string().optional(),
        status: z.enum(["all", "active", "inactive"]).default("all"),
      }).optional()
    )
    .query(async ({ input }) => {
      const supabase = getSupabaseAdmin();
      const params = input || { page: 1, limit: 50, status: "all" };
      const from = (params.page - 1) * params.limit;

      let query = supabase
        .from("profiles")
        .select("*", { count: "exact" })
        .eq("role", "transfer");

      if (params.search) {
        query = query.or(
          `name.ilike.%${params.search}%,email.ilike.%${params.search}%`
        );
      }
      if (params.status === "active") query = query.eq("isActive", true);
      else if (params.status === "inactive") query = query.eq("isActive", false);

      const { data, count, error } = await query
        .order("createdAt", { ascending: false })
        .range(from, from + params.limit - 1);

      if (error) throw new Error(error.message);

      const items = (data ?? []).map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        isActive: u.isActive,
        stationaryAccess: !!u.stationaryAccess,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
      }));

      return {
        items,
        total: count ?? 0,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil((count ?? 0) / params.limit),
      };
    }),

  all: adminQuery.query(async () => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, email, isActive, stationaryAccess")
      .eq("role", "transfer")
      .eq("isActive", true)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  }),

  byId: mainAdminQuery
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", input.id)
        .eq("role", "transfer")
        .maybeSingle();
      if (!data) return null;
      return {
        id: data.id,
        name: data.name,
        email: data.email,
        isActive: data.isActive,
        stationaryAccess: !!data.stationaryAccess,
        createdAt: data.createdAt,
        lastLoginAt: data.lastLoginAt,
      };
    }),

  create: mainAdminQuery
    .input(
      z.object({
        name: z.string().min(1).max(255),
        email: z.string().email(),
        password: z.string().min(6),
        isActive: z.boolean().default(true),
        stationaryAccess: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();

      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: input.email,
        password: input.password,
        email_confirm: true,
        user_metadata: {
          role: "transfer",
          name: input.name,
        },
      });
      if (authError) throw new Error(authError.message);
      if (!authData.user) throw new Error("Failed to create auth user");

      const { data, error } = await supabase
        .from("profiles")
        .upsert(
          {
            id: authData.user.id,
            email: input.email,
            name: input.name,
            role: "transfer",
            isActive: input.isActive,
            stationaryAccess: input.stationaryAccess,
            createdBy: ctx.user.id,
            updatedAt: new Date().toISOString(),
          },
          { onConflict: "id" }
        )
        .select("id")
        .single();

      if (error) throw new Error(error.message);

      await createAuditLog({
        userId: ctx.user.id,
        userType: "admin",
        userName: ctx.user.name || "Admin",
        action: "create_transfer_user",
        entityType: "transferUser",
        entityId: data.id,
        details: { name: input.name, email: input.email, stationaryAccess: input.stationaryAccess },
      });

      return {
        id: data.id,
        name: input.name,
        email: input.email,
        isActive: input.isActive,
        stationaryAccess: input.stationaryAccess,
      };
    }),

  update: mainAdminQuery
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(255).optional(),
        email: z.string().email().optional(),
        isActive: z.boolean().optional(),
        stationaryAccess: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { id, ...updates } = input;

      if (Object.keys(updates).length === 0) throw new Error("No fields to update");

      const { data: user } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", id)
        .eq("role", "transfer")
        .maybeSingle();
      if (!user) throw new Error("Transfer user not found");

      const set: Partial<Profile> = { updatedAt: new Date().toISOString() };
      if (updates.email !== undefined) {
        const { error: authErr } = await supabase.auth.admin.updateUserById(id, {
          email: updates.email,
          email_confirm: true,
        });
        if (authErr) throw new Error(authErr.message);
        set.email = updates.email;
      }
      if (updates.name !== undefined) set.name = updates.name;
      if (updates.isActive !== undefined) set.isActive = updates.isActive;
      if (updates.stationaryAccess !== undefined) (set as any).stationaryAccess = updates.stationaryAccess;

      const { error } = await supabase.from("profiles").update(set).eq("id", id);
      if (error) throw new Error(error.message);

      await createAuditLog({
        userId: ctx.user.id,
        userType: "admin",
        userName: ctx.user.name || "Admin",
        action: "update_transfer_user",
        entityType: "transferUser",
        entityId: id,
        details: { name: set.name ?? user.name, email: set.email ?? user.email },
      });

      return { success: true };
    }),

  toggleStatus: mainAdminQuery
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { data: user } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", input.id)
        .eq("role", "transfer")
        .maybeSingle();
      if (!user) throw new Error("Transfer user not found");

      const newStatus = !user.isActive;
      const { error } = await supabase
        .from("profiles")
        .update({ isActive: newStatus, updatedAt: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw new Error(error.message);

      await createAuditLog({
        userId: ctx.user.id,
        userType: "admin",
        userName: ctx.user.name || "Admin",
        action: newStatus ? "activate_transfer_user" : "deactivate_transfer_user",
        entityType: "transferUser",
        entityId: input.id,
        details: { name: user.name, newStatus },
      });

      return { isActive: newStatus };
    }),

  toggleStationaryAccess: mainAdminQuery
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { data: user } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", input.id)
        .eq("role", "transfer")
        .maybeSingle();
      if (!user) throw new Error("Transfer user not found");

      const newValue = !user.stationaryAccess;
      const { error } = await supabase
        .from("profiles")
        .update({ stationaryAccess: newValue, updatedAt: new Date().toISOString() } as any)
        .eq("id", input.id);
      if (error) throw new Error(error.message);

      await createAuditLog({
        userId: ctx.user.id,
        userType: "admin",
        userName: ctx.user.name || "Admin",
        action: newValue ? "grant_stationary_access" : "revoke_stationary_access",
        entityType: "transferUser",
        entityId: input.id,
        details: { name: user.name, stationaryAccess: newValue },
      });

      return { stationaryAccess: newValue };
    }),

  resetPassword: mainAdminQuery
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { data: user } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", input.id)
        .eq("role", "transfer")
        .maybeSingle();
      if (!user) throw new Error("Transfer user not found");

      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
      let newPassword = "";
      for (let i = 0; i < 10; i++) {
        newPassword += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      const { error } = await supabase.auth.admin.updateUserById(input.id, {
        password: newPassword,
      });
      if (error) throw new Error(error.message);

      await createAuditLog({
        userId: ctx.user.id,
        userType: "admin",
        userName: ctx.user.name || "Admin",
        action: "reset_transfer_user_password",
        entityType: "transferUser",
        entityId: input.id,
        details: { name: user.name },
      });

      return { password: newPassword };
    }),

  delete: mainAdminQuery
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();

      const { data: user } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", input.id)
        .eq("role", "transfer")
        .maybeSingle();
      if (!user) throw new Error("Transfer user not found");

      const { error } = await supabase.from("profiles").delete().eq("id", input.id).eq("role", "transfer");
      if (error) throw new Error(error.message);

      await supabase.auth.admin.deleteUser(input.id);

      await createAuditLog({
        userId: ctx.user.id,
        userType: "admin",
        userName: ctx.user.name || "Admin",
        action: "delete_transfer_user",
        entityType: "transferUser",
        entityId: input.id,
        details: { name: user.name },
      });

      return { success: true };
    }),
});
