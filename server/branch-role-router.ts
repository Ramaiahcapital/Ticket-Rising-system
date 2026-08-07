import { z } from "zod";
import { createRouter, publicQuery, adminQuery } from "./middleware.js";
import { getSupabaseAdmin } from "./lib/supabase.js";
import { createAuditLog } from "./lib/utils.js";
import type { BranchRoleRow } from "./lib/db-types.js";

const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export const branchRoleRouter = createRouter({
  list: publicQuery.query(async () => {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("branch_roles")
      .select("*")
      .order("sortOrder", { ascending: true });
    return (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      sortOrder: r.sortOrder,
      isActive: r.isActive,
    }));
  }),

  create: adminQuery
    .input(
      z.object({
        name: z.string().min(1).max(100),
        color: z.string().regex(COLOR_RE).default("#6B7280"),
        sortOrder: z.number().default(0),
        isActive: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const name = input.name.trim();
      if (!name) throw new Error("Role name is required");

      const { data: existing } = await supabase
        .from("branch_roles")
        .select("id")
        .eq("name", name)
        .maybeSingle();
      if (existing) throw new Error(`A role named "${name}" already exists`);

      const { data, error } = await supabase
        .from("branch_roles")
        .insert({
          name,
          color: input.color,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
          updatedAt: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      await createAuditLog({
        userId: ctx.user.id,
        userType: "admin",
        userName: ctx.user.name || "Admin",
        action: "create_branch_role",
        entityType: "branchRole",
        entityId: data.id,
        details: { name, color: input.color },
      });

      return { id: data.id };
    }),

  update: adminQuery
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        color: z.string().regex(COLOR_RE).optional(),
        sortOrder: z.number().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { data: role } = await supabase
        .from("branch_roles")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();
      if (!role) throw new Error("Role not found");

      const updates: Partial<BranchRoleRow> = { updatedAt: new Date().toISOString() };
      let newName: string | undefined;
      if (input.name !== undefined) {
        newName = input.name.trim();
        if (!newName) throw new Error("Role name cannot be empty");
        if (newName !== role.name) {
          const { data: clash } = await supabase
            .from("branch_roles")
            .select("id")
            .eq("name", newName)
            .neq("id", input.id)
            .maybeSingle();
          if (clash) throw new Error(`A role named "${newName}" already exists`);
          updates.name = newName;
        }
      }
      if (input.color !== undefined) updates.color = input.color;
      if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
      if (input.isActive !== undefined) updates.isActive = input.isActive;

      const { error } = await supabase.from("branch_roles").update(updates).eq("id", input.id);
      if (error) throw new Error(error.message);

      // Propagate a rename to everywhere the role name is referenced
      if (updates.name && updates.name !== role.name) {
        await supabase.from("profiles").update({ branchRole: updates.name }).eq("branchRole", role.name);
        await supabase.from("tickets").update({ branchRole: updates.name }).eq("branchRole", role.name);
        await supabase.from("ticket_form_config").update({ role: updates.name }).eq("role", role.name);

        // Rename the portal-enabled setting key
        const oldKey = `ticket_portal_enabled_${role.name}`;
        const newKey = `ticket_portal_enabled_${updates.name}`;
        const { data: setting } = await supabase
          .from("system_settings")
          .select("id, value")
          .eq("key", oldKey)
          .maybeSingle();
        if (setting) {
          await supabase.from("system_settings").update({ key: newKey }).eq("id", setting.id);
        }

        // Rename inside the stationary portal allowed-roles array
        const { data: portal } = await supabase
          .from("stationary_portal_settings")
          .select("id, allowedRoles")
          .limit(1)
          .maybeSingle();
        if (portal && Array.isArray(portal.allowedRoles)) {
          const allowed = portal.allowedRoles.map((r) =>
            r === role.name ? updates.name ?? role.name : r
          );
          await supabase
            .from("stationary_portal_settings")
            .update({ allowedRoles: allowed, updatedAt: new Date().toISOString(), updatedBy: ctx.user.id })
            .eq("id", portal.id);
        }
      }

      await createAuditLog({
        userId: ctx.user.id,
        userType: "admin",
        userName: ctx.user.name || "Admin",
        action: "update_branch_role",
        entityType: "branchRole",
        entityId: input.id,
        details: {
          name: updates.name ?? role.name,
          color: updates.color ?? role.color,
          isActive: updates.isActive ?? role.isActive,
        },
      });

      return { success: true };
    }),

  delete: adminQuery
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { data: role } = await supabase
        .from("branch_roles")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();
      if (!role) throw new Error("Role not found");

      const { count: userCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("branchRole", role.name)
        .eq("role", "branch");
      const { count: ticketCount } = await supabase
        .from("tickets")
        .select("*", { count: "exact", head: true })
        .eq("branchRole", role.name);

      // Users and tickets cannot be reassigned automatically, so block deletion.
      // Form configs are admin drafts and are removed automatically.
      if ((userCount ?? 0) > 0 || (ticketCount ?? 0) > 0) {
        throw new Error(
          `Cannot delete role "${role.name}" — still used by ${userCount ?? 0} user(s) and ${ticketCount ?? 0} ticket(s). Deactivate it instead or reassign those first.`
        );
      }

      // Clean up everything that referenced the role (form config, portal toggle,
      // stationary allowed list) then remove the role itself.
      await supabase.from("ticket_form_config").delete().eq("role", role.name);
      await supabase
        .from("system_settings")
        .delete()
        .eq("key", `ticket_portal_enabled_${role.name}`);

      const { data: portal } = await supabase
        .from("stationary_portal_settings")
        .select("id, allowedRoles")
        .limit(1)
        .maybeSingle();
      if (portal && Array.isArray(portal.allowedRoles) && portal.allowedRoles.includes(role.name)) {
        await supabase
          .from("stationary_portal_settings")
          .update({
            allowedRoles: portal.allowedRoles.filter((r) => r !== role.name),
            updatedAt: new Date().toISOString(),
            updatedBy: ctx.user.id,
          })
          .eq("id", portal.id);
      }

      const { error } = await supabase.from("branch_roles").delete().eq("id", input.id);
      if (error) throw new Error(error.message);

      await createAuditLog({
        userId: ctx.user.id,
        userType: "admin",
        userName: ctx.user.name || "Admin",
        action: "delete_branch_role",
        entityType: "branchRole",
        entityId: input.id,
        details: { name: role.name },
      });

      return { success: true };
    }),
});
