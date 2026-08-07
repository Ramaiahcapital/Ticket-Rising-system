import { z } from "zod";
import { createRouter, adminQuery, authedQuery } from "./middleware.js";
import { getSupabaseAdmin } from "./lib/supabase.js";
import { createAuditLog, requireRoleExists } from "./lib/utils.js";
import type { BranchRole } from "./lib/db-types.js";
import { sendEmailFromUserResult } from "./email-service.js";

const PORTAL_SETTINGS_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Helpers
 */
async function getPortalSettings(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data } = await supabase
    .from("stationary_portal_settings")
    .select("*")
    .eq("id", PORTAL_SETTINGS_ID)
    .maybeSingle();
  return data;
}

function nowWindowOpen(settings: { windowOpenAt: string | null; windowCloseAt: string | null } | null) {
  if (!settings) return false;
  const now = Date.now();
  const open = settings.windowOpenAt ? new Date(settings.windowOpenAt).getTime() : null;
  const close = settings.windowCloseAt ? new Date(settings.windowCloseAt).getTime() : null;
  if (open !== null && now < open) return false;
  if (close !== null && now > close) return false;
  return true;
}

/** Resolve the branch id for the acting branch user (from the linked branch). */
function getActingBranchId(ctx: { user: { role: string; branchId?: string | null } }): string {
  const id = (ctx.user as { branchId?: string | null }).branchId;
  if (!id) throw new Error("Your account is not linked to a branch");
  return id;
}

/**
 * When a branch modifies an order that was already cluster-approved, reset the
 * approval so the cluster must review it again, and email the cluster.
 * Returns the email status ({ sent, failed, errors }).
 */
async function resubmitForClusterApproval(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  ctx: { user: { id: string; name?: string | null } },
  orderId: string,
  clusterId: string | null
) {
  const { error: rErr } = await supabase
    .from("stationary_orders")
    .update({ clusterApprovedAt: null, clusterApprovedBy: null })
    .eq("id", orderId);
  if (rErr) throw new Error(rErr.message);

  const emailStatus = { sent: 0, failed: 0, errors: [] as string[] };
  try {
    const [{ data: clusterUsers }, { data: sender }, { data: clusterInfo }, { data: lines }] = await Promise.all([
      clusterId
        ? supabase.from("profiles").select("id, email").eq("clusterId", clusterId).eq("role", "cluster").eq("isActive", true)
        : Promise.resolve({ data: [] }),
      supabase.from("profiles").select("branchName, email").eq("id", ctx.user.id).maybeSingle(),
      clusterId
        ? supabase.from("clusters").select("name").eq("id", clusterId).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("stationary_order_items").select("quantity, unitPrice, lineTotal, stationary_items(name, unit)").eq("orderId", orderId),
    ]) as any;

    if (clusterUsers?.length && sender?.email) {
      const branchLabel = sender.branchName || "Branch";
      const clusterLabel = clusterInfo?.name || "Cluster";
      const itemList = (lines ?? []).map((li: any) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">${li.stationary_items?.name || "Item"}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">${li.quantity}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">₹${Number(li.lineTotal ?? 0)}</td></tr>`
      ).join("");
      const grandTotal = (lines ?? []).reduce((s: number, li: any) => s + Number(li.lineTotal ?? 0), 0);

      for (const cu of clusterUsers) {
        if (cu.email) {
          const res = await sendEmailFromUserResult(
            ctx.user.id,
            cu.email,
            `Stationary Order Updated — Review Required`,
            `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
              <h2 style="color:#DC2626;">Order Updated — Review Required</h2>
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Branch</td><td style="padding:8px;border-bottom:1px solid #eee;">${branchLabel}</td></tr>
                <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Cluster</td><td style="padding:8px;border-bottom:1px solid #eee;">${clusterLabel}</td></tr>
                <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Updated By</td><td style="padding:8px;border-bottom:1px solid #eee;">${ctx.user.name || branchLabel}</td></tr>
                <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Updated At</td><td style="padding:8px;border-bottom:1px solid #eee;">${new Date().toLocaleString()}</td></tr>
              </table>
              <h3 style="margin-top:16px;">Updated Items</h3>
              <table style="width:100%;border-collapse:collapse;border:1px solid #eee;">
                <thead><tr style="background:#f9fafb;"><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #ddd;">Item</th><th style="padding:6px 8px;text-align:center;border-bottom:2px solid #ddd;">Qty</th><th style="padding:6px 8px;text-align:right;border-bottom:2px solid #ddd;">Amount</th></tr></thead>
                <tbody>${itemList}</tbody>
              </table>
              <p style="margin-top:12px;font-weight:bold;">Grand Total: ₹${grandTotal}</p>
              <p style="margin-top:16px;color:#666;">A branch modified this order. Please review and approve it in the Ramaiah Capital Stationary Portal.</p>
            </div>`
          );
          if (res.ok) emailStatus.sent++;
          else { emailStatus.failed++; emailStatus.errors.push(`${cu.email}: ${res.reason}`); }
        }
      }
    }
  } catch (e) { emailStatus.errors.push(String(e)); }

  await createAuditLog({
    userId: ctx.user.id,
    userType: "branch",
    userName: ctx.user.name ?? undefined,
    action: "resubmit_cluster_approval",
    entityType: "stationaryOrder",
    entityId: orderId,
    details: { emailStatus },
  });

  return emailStatus;
}

export const stationaryRouter = createRouter({
  // ---------------- Admin: items ----------------
  listItems: adminQuery
    .input(z.object({ includeInactive: z.boolean().default(false) }).optional())
    .query(async ({ input }) => {
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
        createdAt: i.createdAt,
      }));
    }),

  createItem: adminQuery
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        unit: z.string().optional(),
        price: z.number().min(0).default(0),
        threshold: z.number().int().min(0).default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from("stationary_items")
        .insert({
          name: input.name,
          description: input.description ?? null,
          unit: input.unit ?? null,
          price: input.price,
          threshold: input.threshold,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      await createAuditLog({ userId: ctx.user.id, userType: "admin", action: "create_stationary_item", entityType: "stationaryItem", entityId: data.id, details: { name: input.name } });
      return { id: data.id };
    }),

  updateItem: adminQuery
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        unit: z.string().optional(),
        price: z.number().min(0).optional(),
        threshold: z.number().int().min(0).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { id, ...rest } = input;
      const set: Partial<import("./lib/db-types").StationaryItemRow> = {};
      if (rest.name !== undefined) set.name = rest.name;
      if (rest.description !== undefined) set.description = rest.description;
      if (rest.unit !== undefined) set.unit = rest.unit;
      if (rest.price !== undefined) set.price = rest.price;
      if (rest.threshold !== undefined) set.threshold = rest.threshold;
      if (rest.isActive !== undefined) set.isActive = rest.isActive;
      const { error } = await supabase.from("stationary_items").update(set).eq("id", id);
      if (error) throw new Error(error.message);
      await createAuditLog({ userId: ctx.user.id, userType: "admin", action: "update_stationary_item", entityType: "stationaryItem", entityId: id });
      return { success: true };
    }),

  deleteItem: adminQuery
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      // Block delete if referenced by any ACTIVE (non-cancelled) order.
      const { data: refs, error: refError } = await supabase
        .from("stationary_order_items")
        .select("id, orderId")
        .eq("itemId", input.id);
      if (refError) throw new Error(refError.message);
      if ((refs ?? []).length > 0) {
        const orderIds = [...new Set((refs ?? []).map((r) => r.orderId))];
        const { data: orders } = await supabase
          .from("stationary_orders")
          .select("id, status")
          .in("id", orderIds);
        const activeCount = (orders ?? []).filter((o) => o.status !== "cancelled").length;
        if (activeCount > 0) throw new Error("Cannot delete item that has been ordered. Deactivate it instead.");
        // Only cancelled orders reference it — remove those line items so the FK (restrict) allows delete.
        const { error: liError } = await supabase
          .from("stationary_order_items")
          .delete()
          .eq("itemId", input.id);
        if (liError) throw new Error(liError.message);
      }
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
      allowedRoles: ((data?.allowedRoles as unknown) ?? []) as BranchRole[],
    };
  }),

  updatePortalSettings: adminQuery
    .input(
      z.object({
        enabled: z.boolean().optional(),
        windowOpenAt: z.string().nullable().optional(),
        windowCloseAt: z.string().nullable().optional(),
        allowedRoles: z.array(z.string().min(1).max(100)).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      if (input.allowedRoles !== undefined) {
        for (const role of input.allowedRoles) {
          await requireRoleExists(supabase, role);
        }
      }
      const set: Record<string, unknown> = { updatedAt: new Date().toISOString(), updatedBy: ctx.user.id };
      if (input.enabled !== undefined) set.enabled = input.enabled;
      if (input.windowOpenAt !== undefined) set.windowOpenAt = input.windowOpenAt;
      if (input.windowCloseAt !== undefined) set.windowCloseAt = input.windowCloseAt;
      if (input.allowedRoles !== undefined) set.allowedRoles = input.allowedRoles;
      const { error } = await supabase
        .from("stationary_portal_settings")
        .update(set as Partial<import("./lib/db-types").StationaryPortalSettingsRow>)
        .eq("id", PORTAL_SETTINGS_ID);
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
    const allowedRoles = ((settings?.allowedRoles as unknown) ?? []) as string[];
    const roleAllowed = ctx.user.role === "admin" ? true : ctx.user.role === "branch";
    const canOrder = enabled && inWindow && roleAllowed;
    return {
      enabled,
      inWindow,
      roleAllowed,
      canOrder,
      windowOpenAt: settings?.windowOpenAt ?? null,
      windowCloseAt: settings?.windowCloseAt ?? null,
      allowedRoles: allowedRoles as BranchRole[],
    };
  }),

  // ---------------- Branch: items available to order (with remaining quota) ----------------
  getOrderableItems: authedQuery.query(async ({ ctx }) => {
    const supabase = getSupabaseAdmin();
    if (ctx.user.role !== "branch") throw new Error("Only branch users can order stationary");
    const branchId = getActingBranchId(ctx);

    const { data: items, error } = await supabase
      .from("stationary_items")
      .select("*")
      .eq("isActive", true)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);

    // Total quantity this branch has already ordered in the current open window
    const settings = await getPortalSettings(supabase);
    let orderedSince: string | null = null;
    if (settings?.windowOpenAt) {
      orderedSince = settings.windowOpenAt;
    }

    const { data: myOrders } = await supabase
      .from("stationary_orders")
      .select("id")
      .eq("branchId", branchId)
      .neq("status", "cancelled")
      .gte("createdAt", orderedSince ?? "1970-01-01");

    const orderIds = (myOrders ?? []).map((o) => o.id);
    let orderedItems: Record<string, number> = {};
    if (orderIds.length > 0) {
      const { data: lineItems } = await supabase
        .from("stationary_order_items")
        .select("itemId, quantity")
        .in("orderId", orderIds);
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
        remaining,
      };
    });
  }),

  // ---------------- Branch: place an order ----------------
  placeOrder: authedQuery
    .input(
      z.object({
        items: z
          .array(z.object({ itemId: z.string(), quantity: z.number().int().min(1) }))
          .min(1),
        orderDate: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      if (ctx.user.role !== "branch") throw new Error("Only branch users can order stationary");
      const branchId = getActingBranchId(ctx);

      const settings = await getPortalSettings(supabase);
      if (!(settings?.enabled ?? false)) throw new Error("Stationary portal is disabled");
      if (!nowWindowOpen(settings)) throw new Error("Stationary portal ordering window is closed");

      // Validate items + threshold against current window usage
      const { data: items, error } = await supabase
        .from("stationary_items")
        .select("*")
        .in("id", input.items.map((it) => it.itemId));
      if (error) throw new Error(error.message);
      const itemMap = new Map(items?.map((i) => [i.id, i]) ?? []);
      for (const it of input.items) {
        const item = itemMap.get(it.itemId);
        if (!item) throw new Error("Unknown item");
        if (!(item.isActive ?? true)) throw new Error(`Item ${item.name} is not active`);
      }

      // Resolve cluster from branch profile
      const { data: branchProfile } = await supabase
        .from("profiles")
        .select("clusterId")
        .eq("id", ctx.user.id)
        .maybeSingle();
      const clusterId = (branchProfile as { clusterId?: string | null })?.clusterId ?? null;

      // One order per branch (within the open window). Reuse an existing pending order.
      const orderedSince = settings?.windowOpenAt ?? "1970-01-01";
      const { data: existingOrders } = await supabase
        .from("stationary_orders")
        .select("id")
        .eq("branchId", branchId)
        .eq("status", "pending")
        .gte("createdAt", orderedSince)
        .order("createdAt", { ascending: false })
        .limit(1);
      const orderId = existingOrders?.[0]?.id ?? (await supabase.from("stationary_orders").insert({ branchId, createdBy: ctx.user.id, clusterId, orderDate: input.orderDate ?? new Date().toISOString().slice(0, 10) }).select("id").single()).data?.id;
      if (!orderId) throw new Error("Failed to create order");

      // Aggregate already-ordered qty for this branch (across its single order)
      const { data: existingLines } = await supabase
        .from("stationary_order_items")
        .select("itemId, quantity")
        .eq("orderId", orderId);
      const already: Record<string, number> = {};
      for (const li of existingLines ?? []) already[li.itemId] = (already[li.itemId] ?? 0) + li.quantity;

      const lineInserts: { orderId: string; itemId: string; quantity: number; unitPrice: number; lineTotal: number }[] = [];
      for (const it of input.items) {
        const item = itemMap.get(it.itemId)!;
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

      const emailStatus = { sent: 0, failed: 0, errors: [] as string[] };

      // Send email from branch user to cluster
      try {
        if (clusterId) {
          const { data: clusterUsers } = await supabase
            .from("profiles")
            .select("id, email")
            .eq("clusterId", clusterId)
            .eq("role", "cluster")
            .eq("isActive", true);
          const { data: sender } = await supabase
            .from("profiles")
            .select("branchName, email")
            .eq("id", ctx.user.id)
            .maybeSingle();
          const { data: clusterInfo } = await supabase
            .from("clusters")
            .select("name")
            .eq("id", clusterId)
            .maybeSingle();
          if (clusterUsers?.length && sender?.email) {
            const branchLabel = sender.branchName || "Branch";
            const clusterLabel = clusterInfo?.name || "Cluster";
            const itemList = input.items.map(it => {
              const item = itemMap.get(it.itemId);
              return `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">${item?.name || it.itemId}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">${it.quantity}</td></tr>`;
            }).join("");
            for (const cu of clusterUsers) {
              if (cu.email) {
                const res = await sendEmailFromUserResult(
                  ctx.user.id,
                  cu.email,
                  `New Stationary Order from ${branchLabel}`,
                  `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                    <h2 style="color:#DC2626;">New Stationary Order</h2>
                    <table style="width:100%;border-collapse:collapse;">
                      <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Branch</td><td style="padding:8px;border-bottom:1px solid #eee;">${branchLabel}</td></tr>
                      <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Cluster</td><td style="padding:8px;border-bottom:1px solid #eee;">${clusterLabel}</td></tr>
                      <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Order Date</td><td style="padding:8px;border-bottom:1px solid #eee;">${input.orderDate || new Date().toISOString().slice(0,10)}</td></tr>
                    </table>
                    <h3 style="margin-top:16px;">Items Ordered</h3>
                    <table style="width:100%;border-collapse:collapse;border:1px solid #eee;">
                      <thead><tr style="background:#f9fafb;"><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #ddd;">Item</th><th style="padding:6px 8px;text-align:center;border-bottom:2px solid #ddd;">Qty</th></tr></thead>
                      <tbody>${itemList}</tbody>
                    </table>
                    <p style="margin-top:16px;color:#666;">Please review and approve this order in the Ramaiah Capital Stationary Portal.</p>
                  </div>`
                );
                if (res.ok) emailStatus.sent++;
                else { emailStatus.failed++; emailStatus.errors.push(`${cu.email}: ${res.reason}`); }
              }
            }
          }
        }
      } catch (e) { emailStatus.errors.push(String(e)); }

      await createAuditLog({ userId: ctx.user.id, userType: "branch", userName: ctx.user.name, action: "place_stationary_order", entityType: "stationaryOrder", entityId: orderId, details: { emailStatus } });

      return { id: orderId };
    }),

  // ---------------- Branch: my orders ----------------
  myOrders: authedQuery.query(async ({ ctx }) => {
    const supabase = getSupabaseAdmin();
    if (ctx.user.role !== "branch") throw new Error("Only branch users can view their orders");
    const branchId = getActingBranchId(ctx);
    const { data, error } = (await supabase
      .from("stationary_orders")
      .select("*, stationary_order_items(*, stationary_items(name, unit, threshold))")
      .eq("branchId", branchId)
      .order("createdAt", { ascending: false })) as any;
    if (error) throw new Error(error.message);

    const branchIds: string[] = Array.from(new Set((data ?? []).map((o: any) => o.branchId)));
    const clusterIds: string[] = Array.from(new Set((data ?? []).map((o: any) => o.clusterId).filter(Boolean)));
    const fallbackIds = branchIds.length ? branchIds : ["00000000-0000-0000-0000-000000000000"];
    const [{ data: branches }, { data: clusters }] = await Promise.all([
      supabase.from("branches").select("id, name, code").in("id", fallbackIds),
      clusterIds.length ? supabase.from("clusters").select("id, name").in("id", clusterIds) : Promise.resolve({ data: [] }),
    ]);
    const branchLookup = new Map<string, any>((branches ?? []).map((b: any) => [b.id, b]));
    const clusterLookup = new Map<string, string>((clusters ?? []).map((c: any) => [c.id, c.name]));

    return (data ?? []).map((o: any) => ({
      id: o.id,
      status: o.status,
      orderDate: o.orderDate,
      createdAt: o.createdAt,
      branchId: o.branchId,
      branchName: branchLookup.get(o.branchId)?.name ?? "",
      branchCode: branchLookup.get(o.branchId)?.code ?? "",
      clusterId: o.clusterId ?? null,
      clusterName: clusterLookup.get(o.clusterId) ?? "",
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
  }),

  // ---------------- Branch: mark an order as received ----------------
  markReceived: authedQuery
    .input(z.object({ orderId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      if (ctx.user.role !== "branch") throw new Error("Only branch users can mark orders as received");
      const branchId = getActingBranchId(ctx);

      const { data: order, error: oErr } = await supabase
        .from("stationary_orders")
        .select("id, branchId, clusterId, orderDate, createdAt, status")
        .eq("id", input.orderId)
        .single();
      if (oErr || !order) throw new Error("Order not found");
      if (order.branchId !== branchId) throw new Error("Order does not belong to your branch");
      if (order.status !== "dispatched") throw new Error("Order can only be marked as received after it is dispatched");

      const { error } = await supabase.from("stationary_orders").update({ status: "received" }).eq("id", input.orderId);
      if (error) throw new Error(error.message);

      const emailStatus = { sent: 0, failed: 0, errors: [] as string[] };
      const orderDateLabel = order.orderDate || (order.createdAt ? new Date(order.createdAt).toLocaleDateString() : new Date().toLocaleDateString());

      // Send "Order Received" email to all admins + the order's cluster users.
      try {
        const [{ data: admins }, { data: clusterUsers }, { data: sender }, { data: clusterInfo }, { data: orderLines }] = await Promise.all([
          supabase.from("profiles").select("id, email").eq("role", "admin").eq("isActive", true),
          order.clusterId
            ? supabase.from("profiles").select("id, email").eq("clusterId", order.clusterId).eq("role", "cluster").eq("isActive", true)
            : Promise.resolve({ data: [] }),
          supabase.from("profiles").select("branchName, email").eq("id", ctx.user.id).maybeSingle(),
          order.clusterId
            ? supabase.from("clusters").select("name").eq("id", order.clusterId).maybeSingle()
            : Promise.resolve({ data: null }),
          supabase.from("stationary_order_items").select("quantity, unitPrice, lineTotal, stationary_items(name, unit)").eq("orderId", input.orderId),
        ]) as any;

        const recipients = [...(admins ?? []), ...(clusterUsers ?? [])];
        if (recipients.length && sender?.email) {
          const branchLabel = sender.branchName || "Branch";
          const clusterLabel = clusterInfo?.name || "Cluster";
          const itemList = (orderLines ?? []).map((li: any) =>
            `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">${li.stationary_items?.name || "Item"}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">${li.quantity}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">₹${Number(li.lineTotal ?? 0)}</td></tr>`
          ).join("");
          const grandTotal = (orderLines ?? []).reduce((s: number, li: any) => s + Number(li.lineTotal ?? 0), 0);

          for (const r of recipients) {
            if (r.email) {
              const res = await sendEmailFromUserResult(
                ctx.user.id,
                r.email,
                `Stationary Order Received by ${branchLabel}`,
                `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                  <h2 style="color:#16A34A;">Order Received</h2>
                  <table style="width:100%;border-collapse:collapse;">
                    <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Branch</td><td style="padding:8px;border-bottom:1px solid #eee;">${branchLabel}</td></tr>
                    <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Cluster</td><td style="padding:8px;border-bottom:1px solid #eee;">${clusterLabel}</td></tr>
                    <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Order Date</td><td style="padding:8px;border-bottom:1px solid #eee;">${orderDateLabel}</td></tr>
                    <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Received By</td><td style="padding:8px;border-bottom:1px solid #eee;">${ctx.user.name || sender.branchName || "Branch"}</td></tr>
                    <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">Received At</td><td style="padding:8px;border-bottom:1px solid #eee;">${new Date().toLocaleString()}</td></tr>
                  </table>
                  <h3 style="margin-top:16px;">Items Received</h3>
                  <table style="width:100%;border-collapse:collapse;border:1px solid #eee;">
                    <thead><tr style="background:#f9fafb;"><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #ddd;">Item</th><th style="padding:6px 8px;text-align:center;border-bottom:2px solid #ddd;">Qty</th><th style="padding:6px 8px;text-align:right;border-bottom:2px solid #ddd;">Amount</th></tr></thead>
                    <tbody>${itemList}</tbody>
                  </table>
                  <p style="margin-top:12px;font-weight:bold;">Grand Total: ₹${grandTotal}</p>
                  <p style="margin-top:16px;color:#666;">The branch has confirmed receipt of this stationary order.</p>
                </div>`
              );
              if (res.ok) emailStatus.sent++;
              else { emailStatus.failed++; emailStatus.errors.push(`${r.email}: ${res.reason}`); }
            }
          }
        }
      } catch (e) { emailStatus.errors.push(String(e)); }

      await createAuditLog({ userId: ctx.user.id, userType: "branch", userName: ctx.user.name, action: "receive_stationary_order", entityType: "stationaryOrder", entityId: input.orderId, details: { emailStatus } });
      return { success: true, emailStatus };
    }),

  // ---------------- Branch: edit qty of an item in a pending order ----------------
  updateMyOrderItemQty: authedQuery
    .input(z.object({ orderItemId: z.string(), quantity: z.number().int().min(0) }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      if (ctx.user.role !== "branch") throw new Error("Only branch users can edit their order");
      const branchId = getActingBranchId(ctx);

      const { data: li, error: liErr } = await supabase
        .from("stationary_order_items")
        .select("orderId, itemId, quantity")
        .eq("id", input.orderItemId)
        .single();
      if (liErr || !li) throw new Error("Order item not found");

      const { data: order } = await supabase
        .from("stationary_orders")
        .select("branchId, status, clusterId, clusterApprovedAt")
        .eq("id", li.orderId)
        .single();
      if (!order) throw new Error("Order not found");
      if (order.branchId !== branchId) throw new Error("Order does not belong to your branch");
      if (order.status !== "pending") throw new Error("Order can only be edited while it is pending");

      const { data: item } = await supabase
        .from("stationary_items")
        .select("name, threshold")
        .eq("id", li.itemId)
        .single();
      const threshold = item?.threshold ?? 0;

      if (threshold > 0) {
        const { data: siblings } = await supabase
          .from("stationary_order_items")
          .select("itemId, quantity, orderId")
          .eq("itemId", li.itemId);
        let otherQty = 0;
        for (const s of siblings ?? []) {
          if (s.orderId === li.orderId && s.itemId === li.itemId) otherQty += s.quantity;
        }
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

      const emailStatus = await resubmitForClusterApproval(supabase, ctx, li.orderId, order.clusterId);

      await createAuditLog({ userId: ctx.user.id, userType: "branch", userName: ctx.user.name, action: "edit_stationary_order_qty", entityType: "stationaryOrder", entityId: li.orderId, details: { orderItemId: input.orderItemId, quantity: input.quantity } });
      return { success: true, emailStatus };
    }),

  // ---------------- Branch: delete an item from a pending order ----------------
  deleteMyOrderItem: authedQuery
    .input(z.object({ orderItemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      if (ctx.user.role !== "branch") throw new Error("Only branch users can edit their order");
      const branchId = getActingBranchId(ctx);

      const { data: li, error: liErr } = await supabase
        .from("stationary_order_items")
        .select("orderId, itemId, quantity")
        .eq("id", input.orderItemId)
        .single();
      if (liErr || !li) throw new Error("Order item not found");

      const { data: order } = await supabase
        .from("stationary_orders")
        .select("branchId, status, clusterId, clusterApprovedAt")
        .eq("id", li.orderId)
        .single();
      if (!order) throw new Error("Order not found");
      if (order.branchId !== branchId) throw new Error("Order does not belong to your branch");
      if (order.status !== "pending") throw new Error("Order can only be edited while it is pending");

      const { data: item } = await supabase
        .from("stationary_items")
        .select("name")
        .eq("id", li.itemId)
        .single();

      const { error: delErr } = await supabase
        .from("stationary_order_items")
        .delete()
        .eq("id", input.orderItemId);
      if (delErr) throw new Error(delErr.message);

      const emailStatus = await resubmitForClusterApproval(supabase, ctx, li.orderId, order.clusterId);

      await createAuditLog({
        userId: ctx.user.id,
        userType: "branch",
        userName: ctx.user.name,
        action: "delete_stationary_order_item",
        entityType: "stationaryOrder",
        entityId: li.orderId,
        details: { orderItemId: input.orderItemId, itemName: item?.name ?? null, quantity: li.quantity },
      });
      return { success: true, emailStatus };
    }),

  // ---------------- Branch: add an item to a pending order ----------------
  addMyOrderItem: authedQuery
    .input(z.object({ orderId: z.string(), itemId: z.string(), quantity: z.number().int().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      if (ctx.user.role !== "branch") throw new Error("Only branch users can edit their order");
      const branchId = getActingBranchId(ctx);

      const { data: order, error: oErr } = await supabase
        .from("stationary_orders")
        .select("id, branchId, status, clusterId, clusterApprovedAt")
        .eq("id", input.orderId)
        .single();
      if (oErr || !order) throw new Error("Order not found");
      if (order.branchId !== branchId) throw new Error("Order does not belong to your branch");
      if (order.status !== "pending") throw new Error("Order can only be edited while it is pending");

      const { data: item, error: iErr } = await supabase
        .from("stationary_items")
        .select("*")
        .eq("id", input.itemId)
        .single();
      if (iErr || !item) throw new Error("Item not found");
      if (!(item.isActive ?? true)) throw new Error(`Item ${item.name} is not active`);

      const threshold = item.threshold ?? 0;
      if (threshold > 0) {
        const { data: existingLines } = await supabase
          .from("stationary_order_items")
          .select("itemId, quantity")
          .eq("orderId", input.orderId);
        const alreadyInOrder = (existingLines ?? []).some((l) => l.itemId === input.itemId);
        if (alreadyInOrder) {
          throw new Error(`${item.name} is already in this order. You can change its quantity from the item list above.`);
        }
        const used = (existingLines ?? []).filter((l) => l.itemId === input.itemId).reduce((s, l) => s + l.quantity, 0);
        if (used + input.quantity > threshold) {
          throw new Error(`Quantity exceeds the per-branch limit for ${item.name} (max ${threshold} per window)`);
        }
      }

      const unitPrice = Number(item.price ?? 0);
      const { error: insErr } = await supabase
        .from("stationary_order_items")
        .insert({ orderId: input.orderId, itemId: input.itemId, quantity: input.quantity, unitPrice, lineTotal: unitPrice * input.quantity });
      if (insErr) throw new Error(insErr.message);

      const emailStatus = await resubmitForClusterApproval(supabase, ctx, input.orderId, order.clusterId);

      await createAuditLog({
        userId: ctx.user.id,
        userType: "branch",
        userName: ctx.user.name,
        action: "add_stationary_order_item",
        entityType: "stationaryOrder",
        entityId: input.orderId,
        details: { itemId: input.itemId, itemName: item.name, quantity: input.quantity },
      });
      return { success: true, emailStatus };
    }),

  // ---------------- Branch: cancel their own pending order ----------------
  cancelOrder: authedQuery
    .input(z.object({ orderId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      if (ctx.user.role !== "branch") throw new Error("Only branch users can cancel their order");
      const branchId = getActingBranchId(ctx);

      const { data: order, error: oErr } = await supabase
        .from("stationary_orders")
        .select("id, branchId, status")
        .eq("id", input.orderId)
        .single();
      if (oErr || !order) throw new Error("Order not found");
      if (order.branchId !== branchId) throw new Error("Order does not belong to your branch");
      if (order.status !== "pending") throw new Error("Only pending orders can be cancelled");

      const { error } = await supabase.from("stationary_orders").update({ status: "cancelled" }).eq("id", input.orderId);
      if (error) throw new Error(error.message);
      await createAuditLog({ userId: ctx.user.id, userType: "branch", userName: ctx.user.name, action: "cancel_stationary_order", entityType: "stationaryOrder", entityId: input.orderId });
      return { success: true };
    }),

  // ---------------- Admin: reports ----------------
  reports: adminQuery
    .input(
      z
        .object({
          from: z.string().optional(),
          to: z.string().optional(),
          branchId: z.string().optional(),
          month: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const supabase = getSupabaseAdmin();
      let query = supabase
        .from("stationary_orders")
        .select("*, stationary_order_items(*, stationary_items(name, unit))")
        .or("clusterApprovedAt.not.is.null,clusterId.is.null")
        .neq("status", "cancelled")
        .order("createdAt", { ascending: false });

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

      const { data, error } = (await query) as any;
      if (error) throw new Error(error.message);

      // Fetch branch details separately (avoids embed relation issues).
      // Fall back to profiles for legacy orders whose branchId still points at a profile id.
      const branchIds: string[] = Array.from(new Set((data ?? []).map((o: any) => o.branchId)));
      const fallbackIds = branchIds.length ? branchIds : ["00000000-0000-0000-0000-000000000000"];
      const [{ data: branches }, { data: profs }] = await Promise.all([
        supabase.from("branches").select("id, name, code").in("id", fallbackIds),
        supabase.from("profiles").select("id, branchName, branchCode, branchRole").in("id", fallbackIds),
      ]);
      const branchLookup = new Map<string, any>();
      for (const b of (branches ?? []) as any[]) branchLookup.set(b.id, { name: b.name, code: b.code, branchRole: null });
      for (const p of (profs ?? []) as any[]) if (!branchLookup.has(p.id)) branchLookup.set(p.id, { name: p.branchName, code: p.branchCode, branchRole: p.branchRole });

      const orders = (data ?? []).map((o: any) => ({
        id: o.id,
        branchId: o.branchId,
        branchName: branchLookup.get(o.branchId)?.name ?? "",
        branchCode: branchLookup.get(o.branchId)?.code ?? "",
        branchRole: branchLookup.get(o.branchId)?.branchRole ?? null,
        status: o.status,
        orderDate: o.orderDate,
        createdAt: o.createdAt,
        items: (o.stationary_order_items ?? []).map((li: { id: string; itemId: string; quantity: number; unitPrice?: number; lineTotal?: number; stationary_items?: { name?: string; unit?: string | null } }) => ({
          id: li.id,
          itemId: li.itemId,
          quantity: li.quantity,
          unitPrice: li.unitPrice ?? 0,
          lineTotal: li.lineTotal ?? 0,
          name: li.stationary_items?.name ?? "",
          unit: li.stationary_items?.unit ?? null,
        })),
      }));

      // Fetch all stationary items to get thresholds and prices
      const { data: allItems } = await supabase
        .from("stationary_items")
        .select("id, name, unit, threshold, price");
      const thresholdMap = new Map<string, { unit: string; threshold: number; price: number }>((allItems ?? []).map((it: any) => [it.id, { unit: it.unit, threshold: it.threshold ?? 0, price: Number(it.price ?? 0) }]));

      // Aggregate: per-branch totals + per-item totals across all branches
      const aggBranchMap = new Map<string, { branchId: string; branchName: string; branchCode: string; branchRole: string | null; total: number; items: Record<string, { name: string; qty: number; price: number }> }>();
      const itemMap = new Map<string, { name: string; unit: string; threshold: number; price: number; qty: number; total: number }>();
      let grandTotal = 0;

      for (const o of orders) {
        const bKey = o.branchId;
        if (!aggBranchMap.has(bKey)) {
          aggBranchMap.set(bKey, { branchId: o.branchId, branchName: o.branchName, branchCode: o.branchCode, branchRole: o.branchRole, total: 0, items: {} });
        }
        const b = aggBranchMap.get(bKey)!;
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
        items: Object.entries(b.items).map(([itemId, v]) => ({ itemId, name: v.name, qty: v.qty, price: v.price })),
      }));

      const byItem = Array.from(itemMap.entries()).map(([itemId, v]) => ({ itemId: itemId, name: v.name, unit: v.unit, threshold: v.threshold, price: v.price, qty: v.qty, total: v.total }));

      return { orders, byBranch, byItem, grandTotal };
    }),

  // ---------------- Admin: all orders (for editing branch order qty) ----------------
  listOrders: adminQuery
    .input(z.object({ branchId: z.string().optional(), status: z.enum(["all", "pending", "approved", "dispatched", "received", "fulfilled", "cancelled"]).default("all"), month: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const supabase = getSupabaseAdmin();

      // Default to current month if no month filter provided
      const now = new Date();
      const filterMonth = input?.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const monthStart = `${filterMonth}-01`;
      const [y, m] = filterMonth.split("-").map(Number);
      const monthEnd = new Date(y, m, 1).toISOString().slice(0, 10);

      let query = supabase
        .from("stationary_orders")
        .select("*, stationary_order_items(*, stationary_items(name, unit, threshold))")
        .gte("orderDate", monthStart)
        .lt("orderDate", monthEnd)
        .or("clusterApprovedAt.not.is.null,clusterId.is.null")
        .order("createdAt", { ascending: false });
      if (input?.branchId) query = query.eq("branchId", input.branchId);
      if (input?.status && input.status !== "all") query = query.eq("status", input.status);

      const { data, error } = (await query) as any;
      if (error) throw new Error(error.message);

      // Fetch branch names from the branches table (o.branchId -> branches.id).
      // Fall back to profiles for legacy orders whose branchId still points at a profile id.
      const branchIds: string[] = Array.from(new Set((data ?? []).map((o: any) => o.branchId)));
      const clusterIds: string[] = Array.from(new Set((data ?? []).map((o: any) => o.clusterId).filter(Boolean)));
      const fallbackIds = branchIds.length ? branchIds : ["00000000-0000-0000-0000-000000000000"];
      const [{ data: branches }, { data: profs }, { data: clusters }] = await Promise.all([
        supabase.from("branches").select("id, name, code").in("id", fallbackIds),
        supabase.from("profiles").select("id, branchName, branchCode, branchRole").in("id", fallbackIds),
        clusterIds.length ? supabase.from("clusters").select("id, name").in("id", clusterIds) : Promise.resolve({ data: [] }),
      ]);
      const branchLookup = new Map<string, any>();
      for (const b of (branches ?? []) as any[]) branchLookup.set(b.id, { name: b.name, code: b.code, branchRole: null });
      for (const p of (profs ?? []) as any[]) if (!branchLookup.has(p.id)) branchLookup.set(p.id, { name: p.branchName, code: p.branchCode, branchRole: p.branchRole });
      const clusterLookup = new Map<string, string>();
      for (const c of (clusters ?? []) as any[]) clusterLookup.set(c.id, c.name);

      const mapped = (data ?? []).map((o: any) => ({
        id: o.id,
        branchId: o.branchId,
        branchName: branchLookup.get(o.branchId)?.name ?? "",
        branchCode: branchLookup.get(o.branchId)?.code ?? "",
        branchRole: branchLookup.get(o.branchId)?.branchRole ?? null,
        clusterId: o.clusterId ?? null,
        clusterName: clusterLookup.get(o.clusterId) ?? "",
        status: o.status,
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

      // Branch-wise totals
      const branchTotalsMap = new Map<string, { branchName: string; branchCode: string; total: number; orderCount: number }>();
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
      const grandTotal = mapped.reduce((s: number, o: any) => s + o.total, 0);

      return { orders: mapped, branchTotals, grandTotal };
    }),

  updateOrderItemQty: adminQuery
    .input(z.object({ orderItemId: z.string(), quantity: z.number().int().min(0) }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();

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

      // Validate threshold
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
      await createAuditLog({ userId: ctx.user.id, userType: "admin", action: "edit_stationary_order_qty", entityType: "stationaryOrder", entityId: li.orderId, details: { orderItemId: input.orderItemId, quantity: input.quantity } });
      return { success: true };
    }),

  /** Admin: delete a line item from a branch's stationary order. */
  deleteOrderItem: adminQuery
    .input(z.object({ orderItemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();

      const { data: li, error: liErr } = await supabase
        .from("stationary_order_items")
        .select("orderId, itemId, quantity")
        .eq("id", input.orderItemId)
        .single();
      if (liErr || !li) throw new Error("Order item not found");

      const { data: order } = await supabase
        .from("stationary_orders")
        .select("status")
        .eq("id", li.orderId)
        .single();
      if (!order) throw new Error("Order not found");
      if (order.status === "cancelled") throw new Error("Cannot modify a cancelled order");

      const { data: item } = await supabase
        .from("stationary_items")
        .select("name")
        .eq("id", li.itemId)
        .single();

      const { error: delErr } = await supabase
        .from("stationary_order_items")
        .delete()
        .eq("id", input.orderItemId);
      if (delErr) throw new Error(delErr.message);

      await createAuditLog({
        userId: ctx.user.id,
        userType: "admin",
        action: "delete_stationary_order_item",
        entityType: "stationaryOrder",
        entityId: li.orderId,
        details: { orderItemId: input.orderItemId, itemName: item?.name ?? null, quantity: li.quantity },
      });
      return { success: true };
    }),

  setOrderStatus: adminQuery
    .input(z.object({ orderId: z.string(), status: z.enum(["pending", "approved", "dispatched"]) }))
    .mutation(async ({ ctx, input }) => {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase.from("stationary_orders").update({ status: input.status }).eq("id", input.orderId);
      if (error) throw new Error(error.message);
      await createAuditLog({ userId: ctx.user.id, userType: "admin", action: "set_stationary_order_status", entityType: "stationaryOrder", entityId: input.orderId, details: { status: input.status } });
      return { success: true };
    }),

  listBranches: adminQuery.query(async () => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("branches")
      .select("id, name, code")
      .eq("isActive", true)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((b) => ({ id: b.id, branchName: b.name, branchCode: b.code }));
  }),
});
