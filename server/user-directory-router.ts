import { z } from "zod";
import { createRouter, mainAdminQuery } from "./middleware.js";
import { getSupabaseAdmin } from "./lib/supabase.js";
import type { Profile, BranchRoleRow, ClusterRow } from "./lib/db-types.js";
import { createAuditLog } from "./lib/utils.js";
import { generateTemporaryPassword } from "./lib/password.js";
import {
  defaultPermissions,
  getExplicitPermissionsFor,
  isPermissionKey,
  mergePermissions,
  PERMISSION_KEYS,
  type PermissionMap,
} from "./lib/permissions.js";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  branch: "Branch",
  cluster: "Cluster",
  transfer: "Transfer",
};

const ACCESS_KEYS = [...PERMISSION_KEYS] as [string, ...string[]];

function displayName(p: Profile): string {
  return (
    p.name ||
    p.contactPerson ||
    p.branchName ||
    p.username ||
    p.email ||
    "Unnamed user"
  );
}

function departmentOf(p: Profile): string | null {
  if (p.role === "admin") return p.adminRole ?? null;
  if (p.role === "branch") return p.branchRole ?? null;
  if (p.role === "transfer") return p.monitorRole ?? null;
  return null;
}

export const userDirectoryRouter = createRouter({
  /**
   * Every account in the system: main admins, sub-admins, branch users,
   * cluster users and transfer users. Each row includes the *effective*
   * permissions so the Super Admin can see exactly what a user can do.
   */
  list: mainAdminQuery
    .input(
      z
        .object({
          page: z.number().min(1).default(1),
          limit: z.number().min(1).max(200).default(25),
          search: z.string().optional(),
          role: z.enum(["all", "admin", "branch", "cluster", "transfer"]).default("all"),
          department: z.string().optional(),
          access: z.enum(["all", ...ACCESS_KEYS] as [string, ...string[]]).default("all"),
          status: z.enum(["all", "active", "inactive"]).default("all"),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const params = input ?? {
        page: 1,
        limit: 25,
        role: "all" as const,
        access: "all",
        status: "all" as const,
      };

      const supabase = getSupabaseAdmin();
      const [{ data: profileRows }, { data: roleRows }, { data: clusterRows }] =
        await Promise.all([
          supabase.from("profiles").select("*"),
          supabase.from("branch_roles").select("*").order("sortOrder", { ascending: true }),
          supabase.from("clusters").select("*"),
        ]);

      const profiles = (profileRows ?? []) as Profile[];
      const roles = (roleRows ?? []) as BranchRoleRow[];
      const clusters = (clusterRows ?? []) as ClusterRow[];
      const clusterMap = new Map(clusters.map((c) => [c.id, c.name]));

      const overrides = await getExplicitPermissionsFor(profiles.map((p) => p.id));

      let items = profiles.map((p) => {
        const override = overrides.get(p.id) ?? {};
        const defaults = defaultPermissions(p);
        const permissions = mergePermissions(defaults, override);
        return {
          id: p.id,
          name: displayName(p),
          email: p.email,
          username: p.username,
          role: p.role,
          accountType: ROLE_LABEL[p.role] ?? p.role,
          department: departmentOf(p),
          adminRole: p.adminRole,
          branchRole: p.branchRole,
          monitorRole: p.monitorRole,
          branchName: p.branchName,
          branchCode: p.branchCode,
          clusterId: p.clusterId,
          clusterName: p.clusterId ? clusterMap.get(p.clusterId) ?? null : null,
          isMainAdmin: p.role === "admin" && !p.adminRole,
          isActive: p.isActive !== false,
          canRaiseTicket: permissions.raise_ticket,
          stationaryAccess: permissions.stationary_order,
          permissions,
          defaults,
          overrides: override,
          createdAt: p.createdAt,
          lastLoginAt: p.lastLoginAt,
        };
      });

      const stats = {
        total: items.length,
        active: items.filter((i) => i.isActive).length,
        admins: items.filter((i) => i.role === "admin").length,
        mainAdmins: items.filter((i) => i.isMainAdmin).length,
        branch: items.filter((i) => i.role === "branch").length,
        cluster: items.filter((i) => i.role === "cluster").length,
        transfer: items.filter((i) => i.role === "transfer").length,
        raiseTicket: items.filter((i) => i.permissions.raise_ticket).length,
        stationaryOrder: items.filter((i) => i.permissions.stationary_order).length,
        stationaryAdmin: items.filter((i) => i.permissions.stationary_admin).length,
        emailNotifications: items.filter((i) => i.permissions.email_notifications).length,
      };

      const search = params.search?.trim().toLowerCase();
      if (search) {
        items = items.filter((i) =>
          [
            i.name,
            i.email,
            i.username,
            i.branchName,
            i.branchCode,
            i.department,
            i.clusterName,
            i.accountType,
          ]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(search))
        );
      }
      if (params.role !== "all") items = items.filter((i) => i.role === params.role);
      if (params.department && params.department !== "all") {
        items = items.filter((i) => i.department === params.department);
      }
      if (params.access !== "all" && isPermissionKey(params.access)) {
        items = items.filter((i) => i.permissions[params.access as keyof PermissionMap]);
      }
      if (params.status === "active") items = items.filter((i) => i.isActive);
      else if (params.status === "inactive") items = items.filter((i) => !i.isActive);

      items.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

      const total = items.length;
      const from = (params.page - 1) * params.limit;
      const paged = items.slice(from, from + params.limit);

      return {
        items: paged,
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
        stats,
        departments: roles
          .filter((r) => r.isActive)
          .map((r) => ({ name: r.name, color: r.color })),
      };
    }),

  get: mainAdminQuery
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();
      if (!data) return null;

      const profile = data as Profile;
      const overrides = await getExplicitPermissionsFor([profile.id]);
      const override = overrides.get(profile.id) ?? {};
      const defaults = defaultPermissions(profile);
      const permissions = mergePermissions(defaults, override);

      return {
        id: profile.id,
        name: displayName(profile),
        email: profile.email,
        username: profile.username,
        role: profile.role,
        accountType: ROLE_LABEL[profile.role] ?? profile.role,
        department: departmentOf(profile),
        adminRole: profile.adminRole,
        branchRole: profile.branchRole,
        monitorRole: profile.monitorRole,
        branchName: profile.branchName,
        branchCode: profile.branchCode,
        clusterId: profile.clusterId,
        isMainAdmin: profile.role === "admin" && !profile.adminRole,
        isActive: profile.isActive !== false,
        permissions,
        defaults,
        overrides: override,
      };
    }),

  /**
   * Assign the department / role bucket for any account:
   *   admin    -> adminRole (null = main admin, all departments)
   *   branch   -> branchRole
   *   transfer -> monitorRole
   */
  assignDepartment: mainAdminQuery
    .input(
      z.object({
        id: z.string(),
        department: z.string().max(100).nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { data: target } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();
      if (!target) throw new Error("User not found");

      const profile = target as Profile;
      const department = input.department?.trim() || null;

      if (department) {
        const { data: role } = await supabase
          .from("branch_roles")
          .select("id, isActive")
          .eq("name", department)
          .maybeSingle();
        if (!role) throw new Error(`Department "${department}" does not exist`);
        if (role.isActive === false) throw new Error(`Department "${department}" is inactive`);
      }

      const set: Partial<Profile> = { updatedAt: new Date().toISOString() };

      if (profile.role === "admin") {
        if (input.id === ctx.user.id && department !== profile.adminRole) {
          throw new Error("You cannot change your own admin role");
        }
        set.adminRole = department;
      } else if (profile.role === "branch") {
        set.branchRole = department;
      } else if (profile.role === "transfer") {
        set.monitorRole = department;
      } else {
        throw new Error(
          "Cluster users are scoped to a cluster. Assign them from Cluster Management."
        );
      }

      const { error } = await supabase.from("profiles").update(set).eq("id", input.id);
      if (error) throw new Error(error.message);

      await createAuditLog({
        userId: ctx.user.id,
        userType: "admin",
        userName: ctx.user.name || "Admin",
        action: "assign_user_department",
        entityType: "profile",
        entityId: input.id,
        details: {
          target: displayName(profile),
          role: profile.role,
          previous: departmentOf(profile),
          department,
        },
      });

      return { success: true, department };
    }),

  /**
   * Set explicit permission overrides for one user.
   * `true` = grant, `false` = revoke, `null` = remove the override (back to
   * the role default).
   */
  setPermissions: mainAdminQuery
    .input(
      z.object({
        id: z.string(),
        permissions: z.record(z.string(), z.boolean().nullable()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { data: target } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();
      if (!target) throw new Error("User not found");

      const profile = target as Profile;
      const entries = Object.entries(input.permissions).filter(([key]) =>
        isPermissionKey(key)
      );
      if (!entries.length) throw new Error("No permissions to update");

      if (input.id === ctx.user.id && input.permissions.manage_users === false) {
        throw new Error("You cannot remove your own user-management access");
      }

      const now = new Date().toISOString();
      const upserts = entries
        .filter(([, value]) => value !== null)
        .map(([permission, granted]) => ({
          userId: input.id,
          permission,
          granted: !!granted,
          updatedAt: now,
          updatedBy: ctx.user.id,
        }));

      if (upserts.length) {
        const { error } = await supabase
          .from("user_permissions")
          .upsert(upserts, { onConflict: "userId,permission" });
        if (error) throw new Error(error.message);
      }

      const removals = entries
        .filter(([, value]) => value === null)
        .map(([permission]) => permission);
      if (removals.length) {
        const { error } = await supabase
          .from("user_permissions")
          .delete()
          .eq("userId", input.id)
          .in("permission", removals);
        if (error) throw new Error(error.message);
      }

      await createAuditLog({
        userId: ctx.user.id,
        userType: "admin",
        userName: ctx.user.name || "Admin",
        action: "update_user_permissions",
        entityType: "profile",
        entityId: input.id,
        details: {
          target: displayName(profile),
          changes: Object.fromEntries(entries),
        },
      });

      return { success: true };
    }),

  /** Remove every override and fall back to the role defaults. */
  resetPermissions: mainAdminQuery
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      if (input.id === ctx.user.id) {
        throw new Error("You cannot reset your own permissions");
      }

      const { error } = await supabase
        .from("user_permissions")
        .delete()
        .eq("userId", input.id);
      if (error) throw new Error(error.message);

      await createAuditLog({
        userId: ctx.user.id,
        userType: "admin",
        userName: ctx.user.name || "Admin",
        action: "reset_user_permissions",
        entityType: "profile",
        entityId: input.id,
      });

      return { success: true };
    }),

  toggleActive: mainAdminQuery
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      if (input.id === ctx.user.id) throw new Error("You cannot deactivate your own account");

      const { data: target } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();
      if (!target) throw new Error("User not found");

      const next = target.isActive === false;
      const { error } = await supabase
        .from("profiles")
        .update({ isActive: next, updatedAt: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw new Error(error.message);

      await createAuditLog({
        userId: ctx.user.id,
        userType: "admin",
        userName: ctx.user.name || "Admin",
        action: next ? "activate_user" : "deactivate_user",
        entityType: "profile",
        entityId: input.id,
        details: { target: displayName(target as Profile) },
      });

      return { isActive: next };
    }),

  resetPassword: mainAdminQuery
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { data: target } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();
      if (!target) throw new Error("User not found");

      const newPassword = generateTemporaryPassword();

      const { error } = await supabase.auth.admin.updateUserById(input.id, {
        password: newPassword,
      });
      if (error) throw new Error(error.message);

      await createAuditLog({
        userId: ctx.user.id,
        userType: "admin",
        userName: ctx.user.name || "Admin",
        action: "reset_password",
        entityType: "profile",
        entityId: input.id,
        details: { target: displayName(target as Profile) },
      });

      return { password: newPassword };
    }),

  deleteUser: mainAdminQuery
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      if (input.id === ctx.user.id) throw new Error("You cannot delete your own account");

      const { data: target } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();
      if (!target) throw new Error("User not found");

      const profile = target as Profile;
      if (profile.role === "admin" && !profile.adminRole) {
        throw new Error("Main admin accounts cannot be deleted from here.");
      }

      const { count } = await supabase
        .from("tickets")
        .select("*", { count: "exact", head: true })
        .or(`branchId.eq.${input.id},createdBy.eq.${input.id}`);
      if ((count ?? 0) > 0) {
        throw new Error("This user has existing tickets. Deactivate the account instead.");
      }

      const { error } = await supabase.from("profiles").delete().eq("id", input.id);
      if (error) throw new Error(error.message);

      await supabase.auth.admin.deleteUser(input.id);

      await createAuditLog({
        userId: ctx.user.id,
        userType: "admin",
        userName: ctx.user.name || "Admin",
        action: "delete_user",
        entityType: "profile",
        entityId: input.id,
        details: { target: displayName(profile), role: profile.role },
      });

      return { success: true };
    }),
});
