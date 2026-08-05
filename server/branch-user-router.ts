import { z } from "zod";
import { createRouter, adminQuery } from "./middleware.js";
import { getSupabaseAdmin } from "./lib/supabase.js";
import type { Profile } from "./lib/db-types.js";
import { createAuditLog, requireRoleExists } from "./lib/utils.js";

export const branchUserRouter = createRouter({
  list: adminQuery
    .input(
      z.object({
        page: z.number().default(1),
        limit: z.number().default(10),
        search: z.string().optional(),
        status: z.enum(["all", "active", "inactive"]).default("all"),
        branchId: z.string().optional(),
        sortBy: z.string().default("createdAt"),
        sortOrder: z.enum(["asc", "desc"]).default("desc"),
      }).optional()
    )
    .query(async ({ input }) => {
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

      const { data, count, error } = await query
        .order(params.sortBy, { ascending: params.sortOrder === "asc" })
        .range(from, from + params.limit - 1);

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

  byId: adminQuery
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", input.id)
        .eq("role", "branch")
        .maybeSingle();
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
        lastLoginAt: data.lastLoginAt,
      };
    }),

  create: adminQuery
    .input(
      z.object({
        branchId: z.string().min(1),
        branchRole: z.string().min(1).max(100),
        contactPerson: z.string().min(1).max(255),
        email: z.string().email(),
        mobile: z.string().optional(),
        address: z.string().optional(),
        username: z.string().min(3).max(100),
        password: z.string().min(6),
        isActive: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();

      const { data: branch, error: branchErr } = await supabase
        .from("branches")
        .select("id, name, code")
        .eq("id", input.branchId)
        .maybeSingle();
      if (branchErr) throw new Error(branchErr.message);
      if (!branch) throw new Error("Selected branch not found");

      await requireRoleExists(supabase, input.branchRole);

      // Check uniqueness
      const { data: existingUsername } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", input.username)
        .maybeSingle();
      if (existingUsername) throw new Error("Username already exists");

      // Create the Supabase Auth user
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
          name: input.contactPerson,
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
        action: "create_branch_user",
        entityType: "branchUser",
        entityId: data.id,
        details: { branchName: branch.name, branchCode: branch.code, branchRole: input.branchRole },
      });

      return {
        id: data.id,
        username: input.username,
        branchName: branch.name,
        branchCode: branch.code,
        contactPerson: input.contactPerson,
        email: input.email,
        isActive: input.isActive,
      };
    }),

  update: adminQuery
    .input(
      z.object({
        id: z.string(),
        branchId: z.string().optional(),
        branchRole: z.string().min(1).max(100).optional(),
        contactPerson: z.string().min(1).max(255).optional(),
        email: z.string().email().optional(),
        mobile: z.string().optional(),
        address: z.string().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { id, ...updates } = input;

      if (Object.keys(updates).length === 0) throw new Error("No fields to update");

      if (updates.branchRole !== undefined) {
        await requireRoleExists(supabase, updates.branchRole);
      }

      const set: Partial<Profile> = { updatedAt: new Date().toISOString() };
      if (updates.branchId !== undefined) {
        const { data: b } = await supabase.from("branches").select("name, code").eq("id", updates.branchId).maybeSingle();
        if (b) { set.branchId = updates.branchId; set.branchName = b.name; set.branchCode = b.code; }
      }
      if (updates.contactPerson !== undefined) set.contactPerson = updates.contactPerson;
      if (updates.branchRole !== undefined) set.branchRole = updates.branchRole ?? null;
      if (updates.email !== undefined) set.email = updates.email;
      if (updates.mobile !== undefined) set.mobile = updates.mobile;
      if (updates.address !== undefined) set.address = updates.address;
      if (updates.isActive !== undefined) set.isActive = updates.isActive;

      const { error } = await supabase.from("profiles").update(set).eq("id", id);
      if (error) throw new Error(error.message);

      await createAuditLog({
        userId: ctx.user.id,
        userType: "admin",
        action: "update_branch_user",
        entityType: "branchUser",
        entityId: id,
      });

      return { success: true };
    }),

  toggleStatus: adminQuery
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { data: user } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", input.id)
        .eq("role", "branch")
        .maybeSingle();
      if (!user) throw new Error("Branch user not found");

      const newStatus = !user.isActive;
      const { error } = await supabase
        .from("profiles")
        .update({ isActive: newStatus, updatedAt: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw new Error(error.message);

      await createAuditLog({
        userId: ctx.user.id,
        userType: "admin",
        action: newStatus ? "activate_branch_user" : "deactivate_branch_user",
        entityType: "branchUser",
        entityId: input.id,
        details: { branchName: user.branchName, newStatus },
      });

      return { isActive: newStatus };
    }),

  resetPassword: adminQuery
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { data: user } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", input.id)
        .eq("role", "branch")
        .maybeSingle();
      if (!user) throw new Error("Branch user not found");

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
        action: "reset_password",
        entityType: "branchUser",
        entityId: input.id,
        details: { branchName: user.branchName },
      });

      return { password: newPassword };
    }),

  delete: adminQuery
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();

      const { count } = await supabase
        .from("tickets")
        .select("*", { count: "exact", head: true })
        .eq("branchId", input.id);

      if ((count ?? 0) > 0) {
        throw new Error("Cannot delete branch user with existing tickets. Deactivate instead.");
      }

      const { error } = await supabase.from("profiles").delete().eq("id", input.id).eq("role", "branch");
      if (error) throw new Error(error.message);

      // Remove the auth user as well
      await supabase.auth.admin.deleteUser(input.id);

      await createAuditLog({
        userId: ctx.user.id,
        userType: "admin",
        action: "delete_branch_user",
        entityType: "branchUser",
        entityId: input.id,
      });

      return { success: true };
    }),

  checkUsername: adminQuery
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

  checkBranchCode: adminQuery
    .input(z.object({ branchCode: z.string() }))
    .query(async ({ input }) => {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("branchCode", input.branchCode)
        .maybeSingle();
      return { exists: !!data };
    }),
});
