import { z } from "zod";
import { createRouter, mainAdminQuery } from "./middleware.js";
import { getSupabaseAdmin } from "./lib/supabase.js";
import type { Profile } from "./lib/db-types.js";
import { createAuditLog } from "./lib/utils.js";

export const adminUserRouter = createRouter({
  list: mainAdminQuery
    .input(
      z.object({
        page: z.number().default(1),
        limit: z.number().default(10),
        search: z.string().optional(),
        status: z.enum(["all", "active", "inactive"]).default("all"),
        adminRole: z.string().optional(),
        sortBy: z.string().default("createdAt"),
        sortOrder: z.enum(["asc", "desc"]).default("desc"),
      }).optional()
    )
    .query(async ({ input }) => {
      const supabase = getSupabaseAdmin();
      const params = input || { page: 1, limit: 10, status: "all", sortBy: "createdAt", sortOrder: "desc" };
      const from = (params.page - 1) * params.limit;

      let query = supabase
        .from("profiles")
        .select("*", { count: "exact" })
        .eq("role", "admin")
        .not("adminRole", "is", null);

      if (params.search) {
        query = query.or(
          `name.ilike.%${params.search}%,email.ilike.%${params.search}%,username.ilike.%${params.search}%`
        );
      }
      if (params.adminRole) query = query.eq("adminRole", params.adminRole);
      if (params.status === "active") query = query.eq("isActive", true);
      else if (params.status === "inactive") query = query.eq("isActive", false);

      const { data, count, error } = await query
        .order(params.sortBy, { ascending: params.sortOrder === "asc" })
        .range(from, from + params.limit - 1);

      if (error) throw new Error(error.message);

      const items = (data ?? []).map((u) => ({
        id: u.id,
        username: u.username,
        name: u.name,
        email: u.email,
        adminRole: u.adminRole,
        isActive: u.isActive,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
      }));

      const total = count ?? 0;
      return {
        items,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(total / params.limit),
      };
    }),

  byId: mainAdminQuery
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", input.id)
        .eq("role", "admin")
        .not("adminRole", "is", null)
        .maybeSingle();
      if (!data) return null;
      return {
        id: data.id,
        username: data.username,
        name: data.name,
        email: data.email,
        adminRole: data.adminRole,
        isActive: data.isActive,
        createdAt: data.createdAt,
        lastLoginAt: data.lastLoginAt,
      };
    }),

  create: mainAdminQuery
    .input(
      z.object({
        name: z.string().min(1).max(255),
        email: z.string().email(),
        username: z.string().min(3).max(100),
        password: z.string().min(6),
        adminRole: z.string().min(1),
        isActive: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();

      const { data: existingUsername } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", input.username)
        .maybeSingle();
      if (existingUsername) throw new Error("Username already exists");

      const adminRole = input.adminRole;
      const { data: role } = await supabase
        .from("branch_roles")
        .select("id")
        .eq("name", adminRole)
        .eq("isActive", true)
        .maybeSingle();
      if (!role) throw new Error(`Branch role "${adminRole}" does not exist or is inactive`);

      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: input.email,
        password: input.password,
        email_confirm: true,
        user_metadata: {
          role: "admin",
          name: input.name,
          adminRole,
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
            username: input.username,
            name: input.name,
            role: "admin",
            adminRole,
            isActive: input.isActive,
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
        action: "create_admin_user",
        entityType: "adminUser",
        entityId: data.id,
        details: { name: input.name, adminRole },
      });

      return {
        id: data.id,
        username: input.username,
        name: input.name,
        email: input.email,
        adminRole,
        isActive: input.isActive,
      };
    }),

  update: mainAdminQuery
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(255).optional(),
        email: z.string().email().optional(),
        username: z.string().min(3).max(100).optional(),
        adminRole: z.string().optional(),
        isActive: z.boolean().optional(),
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
        .eq("role", "admin")
        .not("adminRole", "is", null)
        .maybeSingle();
      if (!user) throw new Error("Admin user not found");

      // Never let the acting admin change their own bucket (would lock them out of admin-only features).
      if (id === ctx.user.id && updates.adminRole !== undefined && updates.adminRole !== user.adminRole) {
        throw new Error("You cannot change your own admin role");
      }

      const set: Partial<Profile> = { updatedAt: new Date().toISOString() };
      if (updates.email !== undefined) {
        const { error: authErr } = await supabase.auth.admin.updateUserById(id, {
          email: updates.email,
          email_confirm: true,
        });
        if (authErr) throw new Error(authErr.message);
        set.email = updates.email;
      }
      if (updates.username !== undefined) set.username = updates.username;
      if (updates.name !== undefined) set.name = updates.name;
      if (updates.adminRole !== undefined) {
        if (!updates.adminRole) throw new Error("A role is required — sub-admins must keep a role");
        set.adminRole = updates.adminRole;
      }
      if (updates.isActive !== undefined) {
        if (id === ctx.user.id && !updates.isActive) {
          throw new Error("You cannot deactivate your own account");
        }
        set.isActive = updates.isActive;
      }

      const { error } = await supabase.from("profiles").update(set).eq("id", id);
      if (error) throw new Error(error.message);

      await createAuditLog({
        userId: ctx.user.id,
        userType: "admin",
        userName: ctx.user.name || "Admin",
        action: "update_admin_user",
        entityType: "adminUser",
        entityId: id,
        details: { name: set.name ?? user.name, adminRole: set.adminRole ?? user.adminRole },
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
        .eq("role", "admin")
        .not("adminRole", "is", null)
        .maybeSingle();
      if (!user) throw new Error("Admin user not found");
      if (input.id === ctx.user.id) throw new Error("You cannot deactivate your own account");

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
        action: newStatus ? "activate_admin_user" : "deactivate_admin_user",
        entityType: "adminUser",
        entityId: input.id,
        details: { name: user.name, newStatus },
      });

      return { isActive: newStatus };
    }),

  resetPassword: mainAdminQuery
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { data: user } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", input.id)
        .eq("role", "admin")
        .not("adminRole", "is", null)
        .maybeSingle();
      if (!user) throw new Error("Admin user not found");

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
        action: "reset_password",
        entityType: "adminUser",
        entityId: input.id,
        details: { name: user.name },
      });

      return { password: newPassword };
    }),

  delete: mainAdminQuery
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();

      if (input.id === ctx.user.id) throw new Error("You cannot delete your own account");

      const { data: user } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", input.id)
        .eq("role", "admin")
        .not("adminRole", "is", null)
        .maybeSingle();
      if (!user) throw new Error("Admin user not found");

      const { error } = await supabase.from("profiles").delete().eq("id", input.id).eq("role", "admin");
      if (error) throw new Error(error.message);

      await supabase.auth.admin.deleteUser(input.id);

      await createAuditLog({
        userId: ctx.user.id,
        userType: "admin",
        userName: ctx.user.name || "Admin",
        action: "delete_admin_user",
        entityType: "adminUser",
        entityId: input.id,
        details: { name: user.name },
      });

      return { success: true };
    }),

  checkUsername: mainAdminQuery
    .input(z.object({ username: z.string() }))
    .query(async ({ input }) => {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", input.username)
        .maybeSingle();
      return { exists: !!data };
    }),
});
