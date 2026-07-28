import { z } from "zod";
import { createRouter, adminQuery, authedQuery } from "./middleware.js";
import { getSupabaseAdmin } from "./lib/supabase.js";
import { createAuditLog } from "./lib/utils.js";
import { env } from "./lib/env.js";
import { sendEmailFromUser } from "./email-service.js";

export const clusterRouter = createRouter({
  // ---------------- Admin: cluster CRUD ----------------
  list: adminQuery
    .input(z.object({ includeInactive: z.boolean().default(false) }).optional())
    .query(async ({ input }) => {
      const supabase = getSupabaseAdmin();
      let query = supabase.from("clusters").select("*").order("name");
      if (!input?.includeInactive) query = query.eq("isActive", true);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data ?? [];
    }),

  create: adminQuery
    .input(z.object({ name: z.string().min(1), code: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from("clusters")
        .insert({ name: input.name, code: input.code, createdBy: ctx.user.id })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      await createAuditLog({ userId: ctx.user.id, userType: "admin", action: "create_cluster", entityType: "cluster", entityId: data.id, details: { name: input.name, code: input.code } });
      return data;
    }),

  update: adminQuery
    .input(z.object({ id: z.string(), name: z.string().optional(), code: z.string().optional(), isActive: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (input.name !== undefined) set.name = input.name;
      if (input.code !== undefined) set.code = input.code;
      if (input.isActive !== undefined) set.isActive = input.isActive;
      const { error } = await supabase.from("clusters").update(set).eq("id", input.id);
      if (error) throw new Error(error.message);
      await createAuditLog({ userId: ctx.user.id, userType: "admin", action: "update_cluster", entityType: "cluster", entityId: input.id });
      return { success: true };
    }),

  delete: adminQuery
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { count } = await supabase.from("profiles").select("*", { count: "exact", head: true }).eq("clusterId", input.id).eq("role", "branch");
      if ((count ?? 0) > 0) throw new Error("Cannot delete cluster with assigned branches. Remove branch assignments first.");
      const { error } = await supabase.from("clusters").delete().eq("id", input.id);
      if (error) throw new Error(error.message);
      await createAuditLog({ userId: ctx.user.id, userType: "admin", action: "delete_cluster", entityType: "cluster", entityId: input.id });
      return { success: true };
    }),

  // ---------------- Admin: assign/unassign branches to cluster ----------------
  assignBranches: adminQuery
    .input(z.object({ clusterId: z.string(), branchIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase
        .from("profiles")
        .update({ clusterId: input.clusterId })
        .in("id", input.branchIds)
        .eq("role", "branch");
      if (error) throw new Error(error.message);
      await createAuditLog({ userId: ctx.user.id, userType: "admin", action: "assign_branches_cluster", entityType: "cluster", entityId: input.clusterId, details: { branchIds: input.branchIds } });
      return { success: true };
    }),

  unassignBranches: adminQuery
    .input(z.object({ branchIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase
        .from("profiles")
        .update({ clusterId: null })
        .in("id", input.branchIds)
        .eq("role", "branch");
      if (error) throw new Error(error.message);
      await createAuditLog({ userId: ctx.user.id, userType: "admin", action: "unassign_branches_cluster", entityType: "cluster", details: { branchIds: input.branchIds } });
      return { success: true };
    }),

  // ---------------- Admin: list branches in a cluster ----------------
  branches: adminQuery
    .input(z.object({ clusterId: z.string() }))
    .query(async ({ input }) => {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, branchName, branchCode, branchRole, email, isActive, branchId")
        .eq("clusterId", input.clusterId)
        .eq("role", "branch")
        .order("branchName");
      if (error) throw new Error(error.message);
      return data ?? [];
    }),

  // ---------------- Admin: list all branch users (with cluster info) ----------------
  allBranchUsers: adminQuery
    .input(z.object({ clusterId: z.string().optional(), search: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const supabase = getSupabaseAdmin();
      let query = supabase
        .from("profiles")
        .select("id, name, branchName, branchCode, branchRole, email, isActive, branchId, clusterId")
        .eq("role", "branch")
        .order("branchName");
      if (input?.clusterId) query = query.eq("clusterId", input.clusterId);
      if (input?.search) query = query.or(`branchName.ilike.%${input.search}%,branchCode.ilike.%${input.search}%,name.ilike.%${input.search}%`);
      const { data, error } = await query;
      if (error) throw new Error(error.message);

      const clusterIds = Array.from(new Set((data ?? []).map((u: any) => u.clusterId).filter(Boolean)));
      const { data: clusterMapData } = await supabase
        .from("clusters")
        .select("id, name, code")
        .in("id", clusterIds.length ? clusterIds : ["none"]);
      const clusterMap = new Map((clusterMapData ?? []).map((c: any) => [c.id, c]));

      return (data ?? []).map((u: any) => ({
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
        clusterCode: clusterMap.get(u.clusterId)?.code ?? null,
      }));
    }),

  // ---------------- Admin: list branch users available for assignment ----------------
  availableBranchUsers: adminQuery.query(async () => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, branchName, branchCode, branchRole, email, isActive, clusterId")
      .eq("role", "branch")
      .is("clusterId", null)
      .eq("isActive", true)
      .order("branchName");
    if (error) throw new Error(error.message);
    return data ?? [];
  }),

  // ---------------- Admin: cluster user CRUD ----------------
  checkClusterUsername: adminQuery
    .input(z.object({ username: z.string() }))
    .query(async ({ input }) => {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase.from("profiles").select("id").eq("username", input.username).eq("role", "cluster").maybeSingle();
      return { exists: !!data };
    }),

  listUsers: adminQuery
    .input(z.object({ includeInactive: z.boolean().default(false) }).optional())
    .query(async ({ input }) => {
      const supabase = getSupabaseAdmin();
      let query = supabase
        .from("profiles")
        .select("id, username, name, email, isActive, clusterId, createdAt, lastLoginAt")
        .eq("role", "cluster")
        .order("createdAt", { ascending: false });
      if (!input?.includeInactive) query = query.eq("isActive", true);
      const { data, error } = await query;
      if (error) throw new Error(error.message);

      const clusterIds = Array.from(new Set((data ?? []).map((u: any) => u.clusterId).filter(Boolean)));
      const { data: clusterMapData } = await supabase
        .from("clusters")
        .select("id, name, code")
        .in("id", clusterIds.length ? clusterIds : ["none"]);
      const clusterMap = new Map((clusterMapData ?? []).map((c: any) => [c.id, c]));

      const users = (data ?? []).map((u: any) => ({
        id: u.id,
        username: u.username,
        name: u.name,
        email: u.email,
        isActive: u.isActive,
        clusterId: u.clusterId,
        clusterName: clusterMap.get(u.clusterId)?.name ?? null,
        clusterCode: clusterMap.get(u.clusterId)?.code ?? null,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
      }));
      return users;
    }),

  createUser: adminQuery
    .input(
      z.object({
        username: z.string().min(3).max(50),
        name: z.string().min(1).max(255),
        email: z.string().email(),
        clusterId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
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
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: input.email,
          password,
          email_confirm: true,
          user_metadata: { role: "cluster" },
        }),
      });
      if (!authRes.ok) {
        const authBody = await authRes.text();
        throw new Error("auth_api_error: status=" + authRes.status + " body=" + authBody);
      }
      const authData = await authRes.json();
      if (!authData?.id) throw new Error("No auth user returned. data:" + JSON.stringify(authData));

      const upsertResult = await supabase
        .from("profiles")
        .upsert(
          {
            id: authData.id,
            email: input.email,
            username: input.username,
            name: input.name,
            role: "cluster",
            clusterId: input.clusterId,
            isActive: true,
            createdBy: ctx.user.id,
            updatedAt: new Date().toISOString(),
          },
          { onConflict: "id" }
        )
        .select("id")
        .single();
      if (upsertResult.error) throw new Error("upsert_error:" + upsertResult.error.message);
      const data = upsertResult.data;

      await createAuditLog({
        userId: ctx.user.id,
        userType: "admin",
        userName: ctx.user.name || "Admin",
        action: "create_cluster_user",
        entityType: "clusterUser",
        entityId: data.id,
        details: { username: input.username, clusterId: input.clusterId, clusterName: cluster.name },
      });

      return { id: data.id, username: input.username, name: input.name, email: input.email, password };
    }),

  updateUser: adminQuery
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(255).optional(),
        email: z.string().email().optional(),
        username: z.string().min(3).max(50).optional(),
        clusterId: z.string().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { id, ...updates } = input;
      if (Object.keys(updates).length === 0) throw new Error("No fields to update");
      const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (updates.name !== undefined) set.name = updates.name;
      if (updates.email !== undefined) set.email = updates.email;
      if (updates.username !== undefined) {
        const { data: dup } = await supabase.from("profiles").select("id").eq("username", updates.username).neq("id", id).maybeSingle();
        if (dup) throw new Error("Username already taken");
        set.username = updates.username;
      }
      if (updates.clusterId !== undefined) set.clusterId = updates.clusterId;
      if (updates.isActive !== undefined) set.isActive = updates.isActive;
      const { error } = await supabase.from("profiles").update(set).eq("id", id).eq("role", "cluster");
      if (error) throw new Error(error.message);
      await createAuditLog({ userId: ctx.user.id, userType: "admin", action: "update_cluster_user", entityType: "clusterUser", entityId: id });
      return { success: true };
    }),

  resetPassword: adminQuery
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { data: user } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", input.id)
        .eq("role", "cluster")
        .maybeSingle();
      if (!user) throw new Error("Cluster user not found");

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
        entityType: "clusterUser",
        entityId: input.id,
        details: { username: user.username },
      });

      return { password: newPassword };
    }),

  deleteUser: adminQuery
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
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
    const user = ctx.user as { type: string; clusterId?: string | null };
    if (!user.clusterId) throw new Error("You are not assigned to any cluster");
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from("clusters").select("*").eq("id", user.clusterId).maybeSingle();
    return data ?? null;
  }),

  // ---------------- Cluster user: list branches in own cluster ----------------
  clusterBranches: authedQuery.query(async ({ ctx }) => {
    const user = ctx.user as { type: string; clusterId?: string | null };
    if (!user.clusterId) return [];
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, branchName, branchCode, branchRole, email, isActive")
      .eq("clusterId", user.clusterId)
      .eq("role", "branch")
      .order("branchName");
    if (error) throw new Error(error.message);
    return (data ?? []).map((u: any) => ({
      id: u.id,
      name: u.branchName,
      branch_code: u.branchCode,
      branch_role: u.branchRole,
      email: u.email,
      is_active: u.isActive,
    }));
  }),

  // ---------------- Cluster admin: list orders for branches in their cluster ----------------
  clusterOrders: authedQuery
    .input(z.object({ clusterId: z.string(), status: z.string().optional(), month: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const user = ctx.user as { type: string; clusterId?: string | null };
      const clusterId = input?.clusterId || user.clusterId;
      if (!clusterId) throw new Error("No cluster specified");

      const now = new Date();
      const filterMonth = input?.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const [y, m] = filterMonth.split("-").map(Number);
      const monthStart = `${filterMonth}-01`;
      const monthEnd = new Date(y, m, 1).toISOString().slice(0, 10);

      let query = supabase
        .from("stationary_orders")
        .select("*, stationary_order_items(*, stationary_items(name, unit, threshold))")
        .eq("clusterId", clusterId)
        .gte("orderDate", monthStart)
        .lt("orderDate", monthEnd)
        .order("createdAt", { ascending: false });
      if (input?.status && input.status !== "all") query = query.eq("status", input.status);

      const { data, error } = (await query) as any;
      if (error) throw new Error(error.message);

      const branchIds: string[] = Array.from(new Set((data ?? []).map((o: any) => o.branchId)));
      const fallbackIds = branchIds.length ? branchIds : ["00000000-0000-0000-0000-000000000000"];
      const [{ data: branchRows }, { data: profs }] = await Promise.all([
        supabase.from("branches").select("id, name, code").in("id", fallbackIds),
        supabase.from("profiles").select("id, branchName, branchCode, branchRole").in("id", fallbackIds),
      ]);
      const branchLookup = new Map<string, any>();
      for (const b of (branchRows ?? []) as any[]) branchLookup.set(b.id, { branchName: b.name, branchCode: b.code, branchRole: null });
      for (const p of (profs ?? []) as any[]) if (!branchLookup.has(p.id)) branchLookup.set(p.id, { branchName: p.branchName, branchCode: p.branchCode, branchRole: p.branchRole });

      const orders = (data ?? []).map((o: any) => ({
        id: o.id,
        branchId: o.branchId,
        branchName: branchLookup.get(o.branchId)?.branchName ?? "",
        branchCode: branchLookup.get(o.branchId)?.branchCode ?? "",
        branchRole: branchLookup.get(o.branchId)?.branchRole ?? null,
        status: o.status,
        clusterApprovedAt: o.clusterApprovedAt,
        orderDate: o.orderDate,
        createdAt: o.createdAt,
        total: (o.stationary_order_items ?? []).reduce((s: number, li: { lineTotal?: number }) => s + Number(li.lineTotal ?? 0), 0),
        items: (o.stationary_order_items ?? []).map((li: { id: string; itemId: string; quantity: number; unitPrice?: number; lineTotal?: number; stationary_items?: { name?: string; unit?: string | null; threshold?: number | null } }) => ({
          id: li.id,
          itemId: li.itemId,
          quantity: li.quantity,
          unitPrice: li.unitPrice ?? 0,
          lineTotal: li.lineTotal ?? 0,
          name: li.stationary_items?.name ?? "",
          unit: li.stationary_items?.unit ?? null,
          threshold: li.stationary_items?.threshold ?? 0,
        })),
      }));

      const branchTotalsMap = new Map<string, { branchName: string; branchCode: string; total: number; orderCount: number }>();
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
      const grandTotal = orders.reduce((s: number, o: any) => s + o.total, 0);

      return { orders, branchTotals, grandTotal };
    }),

  // ---------------- Cluster admin: approve order (sends to admin) ----------------
  approveOrder: authedQuery
    .input(z.object({ orderId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const user = ctx.user as { type: string; clusterId?: string | null; id: string; name?: string | null };
      const { error } = await supabase
        .from("stationary_orders")
        .update({ clusterApprovedAt: new Date().toISOString(), clusterApprovedBy: user.id })
        .eq("id", input.orderId)
        .eq("clusterId", user.clusterId);
      if (error) throw new Error(error.message);
      await createAuditLog({ userId: user.id, userType: "cluster", userName: user.name || "Cluster Admin", action: "approve_cluster_order", entityType: "stationaryOrder", entityId: input.orderId });

      // Send email from cluster to all admins
      try {
        const { data: admins } = await supabase
          .from("profiles")
          .select("email")
          .eq("role", "admin")
          .eq("isActive", true);
        const { data: order } = await supabase
          .from("stationary_orders")
          .select("branchId")
          .eq("id", input.orderId)
          .maybeSingle();
        const { data: branch } = order?.branchId
          ? await supabase.from("branches").select("name").eq("id", order.branchId).maybeSingle()
          : { data: null };
        const { data: cluster } = user.clusterId
          ? await supabase.from("clusters").select("name").eq("id", user.clusterId).maybeSingle()
          : { data: null };
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
                    <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Approved At</td><td style="padding:8px;border-bottom:1px solid #eee;">${new Date().toLocaleString()}</td></tr>
                  </table>
                  <p style="margin-top:16px;color:#666;">The stationary order has been approved by the cluster and is ready for processing.</p>
                </div>`
              );
            }
          }
        }
      } catch (e) { console.error("Cluster approve email failed:", e); }

      return { success: true };
    }),

  // ---------------- Cluster admin: reject order ----------------
  rejectOrder: authedQuery
    .input(z.object({ orderId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const user = ctx.user as { type: string; clusterId?: string | null; id: string; name?: string | null };
      const { error } = await supabase
        .from("stationary_orders")
        .update({ status: "cancelled", clusterApprovedBy: user.id })
        .eq("id", input.orderId)
        .eq("clusterId", user.clusterId);
      if (error) throw new Error(error.message);
      await createAuditLog({ userId: user.id, userType: "cluster", userName: user.name || "Cluster Admin", action: "reject_cluster_order", entityType: "stationaryOrder", entityId: input.orderId });

      try {
        const { data: order } = await supabase
          .from("stationary_orders")
          .select("branchId, createdBy")
          .eq("id", input.orderId)
          .maybeSingle();
        if (order?.createdBy) {
          const { data: branchUser } = await supabase
            .from("profiles")
            .select("email, branchName")
            .eq("id", order.createdBy)
            .maybeSingle();
          const { data: clusterInfo } = user.clusterId
            ? await supabase.from("clusters").select("name").eq("id", user.clusterId).maybeSingle()
            : { data: null };
          if (branchUser?.email) {
            await sendEmailFromUser(
              user.id,
              branchUser.email,
              `Order Rejected by ${clusterInfo?.name || "Cluster"}`,
              `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <h2 style="color:#DC2626;">Order Rejected</h2>
                <table style="width:100%;border-collapse:collapse;">
                  <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Branch</td><td style="padding:8px;border-bottom:1px solid #eee;">${branchUser.branchName || "Branch"}</td></tr>
                  <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Rejected By</td><td style="padding:8px;border-bottom:1px solid #eee;">${user.name || "Cluster Admin"}</td></tr>
                  <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Rejected At</td><td style="padding:8px;border-bottom:1px solid #eee;">${new Date().toLocaleString()}</td></tr>
                </table>
                <p style="margin-top:16px;color:#666;">Your stationary order has been rejected. You can place a new order from the Stationary portal.</p>
              </div>`
            );
          }
        }
      } catch (e) { console.error("Cluster reject email failed:", e); }

      return { success: true };
    }),

  // ---------------- Cluster admin: edit order item qty ----------------
  updateOrderItemQty: authedQuery
    .input(z.object({ orderItemId: z.string(), quantity: z.number().int().min(0) }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const user = ctx.user as { type: string; clusterId?: string | null; id: string; name?: string | null };

      // Fetch the line item with its order and item details
      const { data: li, error: liErr } = await supabase
        .from("stationary_order_items")
        .select("orderId, itemId, quantity")
        .eq("id", input.orderItemId)
        .single();
      if (liErr || !li) throw new Error("Order item not found");

      // Fetch the order to get branchId
      const { data: order } = await supabase
        .from("stationary_orders")
        .select("branchId")
        .eq("id", li.orderId)
        .single();
      if (!order) throw new Error("Order not found");

      // Fetch the item's threshold
      const { data: item } = await supabase
        .from("stationary_items")
        .select("name, threshold")
        .eq("id", li.itemId)
        .single();
      const threshold = item?.threshold ?? 0;

      // Validate threshold: sum all quantities for this branch+item across the order (excluding current item)
      if (threshold > 0) {
        const { data: siblings } = await supabase
          .from("stationary_order_items")
          .select("itemId, quantity, orderId")
          .eq("itemId", li.itemId);
        let otherQty = 0;
        for (const s of siblings ?? []) {
          if (s.orderId === li.orderId && s.itemId === li.itemId) {
            otherQty += s.quantity;
          }
        }
        // current line item qty being replaced — subtract old, add new
        const totalAfter = otherQty - li.quantity + input.quantity;
        if (totalAfter > threshold) {
          throw new Error(`Quantity exceeds the per-branch limit for ${item?.name ?? "item"} (max ${threshold} per window)`);
        }
      }

      const { error: updErr } = await supabase
        .from("stationary_order_items")
        .update({ quantity: input.quantity })
        .eq("id", input.orderItemId);
      if (updErr) throw new Error(updErr.message);
      await createAuditLog({ userId: user.id, userType: "cluster", userName: user.name || "Cluster Admin", action: "edit_cluster_order_qty", entityType: "stationaryOrder", entityId: li.orderId, details: { orderItemId: input.orderItemId, quantity: input.quantity } });
      return { success: true };
    }),
});
