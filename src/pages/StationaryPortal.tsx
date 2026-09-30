import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Loader2, Package, ShoppingCart, CheckCircle2, XCircle, Clock, AlertTriangle, Eye, Search } from "lucide-react";
import { OrderDetailsModal } from "@/components/OrderDetailsModal";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-amber-50 text-amber-700" },
  approved: { label: "Approved", cls: "bg-blue-50 text-blue-700" },
  dispatched: { label: "Dispatched", cls: "bg-indigo-50 text-indigo-700" },
  received: { label: "Received", cls: "bg-green-50 text-green-700" },
  fulfilled: { label: "Fulfilled", cls: "bg-green-50 text-green-700" },
  cancelled: { label: "Cancelled", cls: "bg-red-50 text-red-700" },
};

export default function StationaryPortal() {
  const utils = trpc.useUtils();
  const status = trpc.stationary.getPortalStatus.useQuery();
  const { data: items, isLoading } = trpc.stationary.getOrderableItems.useQuery(undefined, { enabled: !!status.data?.canOrder });
  const myOrders = trpc.stationary.myOrders.useQuery();
  const placeOrder = trpc.stationary.placeOrder.useMutation({
    onSuccess: (res) => {
      setCart({});
      setShowConfirm(false);
      utils.stationary.myOrders.invalidate();
      utils.stationary.getOrderableItems.invalidate();
      setPlaced(true);
      const email = (res as any)?.emailStatus;
      if (email && email.failed > 0) {
        alert(
          `Order placed, but the notification email could not be sent.\n\nReason:\n${(email.errors || []).join("\n")}\n\nConnect your Gmail under Email Settings to fix this.`
        );
      }
    },
    onError: (e) => { setError(e.message); setShowConfirm(false); },
  });
  const markReceived = trpc.stationary.markReceived.useMutation({
    onSuccess: (res) => {
      utils.stationary.myOrders.invalidate();
      if ((res as any)?.emailStatus?.failed > 0) alert("Order marked as received, but some notification emails failed to send.");
    },
    onError: (e) => alert(e.message),
  });
  const updateQty = trpc.stationary.updateMyOrderItemQty.useMutation({
    onSuccess: (res) => {
      utils.stationary.myOrders.invalidate();
      if ((res as any)?.emailStatus?.failed > 0) alert("Order updated. The cluster was emailed for re-approval, but some notification emails failed to send.");
    },
    onError: (e) => alert(e.message),
  });
  const deleteItem = trpc.stationary.deleteMyOrderItem.useMutation({
    onSuccess: (res) => {
      utils.stationary.myOrders.invalidate();
      if ((res as any)?.emailStatus?.failed > 0) alert("Item removed. The cluster was emailed for re-approval, but some notification emails failed to send.");
    },
    onError: (e) => alert(e.message),
  });
  const cancelOrder = trpc.stationary.cancelOrder.useMutation({ onSuccess: () => utils.stationary.myOrders.invalidate(), onError: (e) => alert(e.message) });
  const addItem = trpc.stationary.addMyOrderItem.useMutation({
    onSuccess: (res) => {
      utils.stationary.myOrders.invalidate();
      utils.stationary.getOrderableItems.invalidate();
      if ((res as any)?.emailStatus?.failed > 0) alert("Item added. The cluster was emailed for re-approval, but some notification emails failed to send.");
    },
    onError: (e) => alert(e.message),
  });

  const [cart, setCart] = useState<Record<string, number>>({});
  const orderDate = new Date().toISOString().slice(0, 10);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [viewOrderId, setViewOrderId] = useState<string | null>(null);
  const [itemSearch, setItemSearch] = useState("");
  const [view, setView] = useState<"ordering" | "orders">("ordering");

  const myOrdersList: any[] = myOrders.data ?? [];
  const viewOrder = myOrdersList.find((o: any) => o.id === viewOrderId) ?? null;

  // One order per branch per window: block if an order already exists for this window.
  const windowStart = status.data?.windowOpenAt ?? "1970-01-01";
  const alreadyOrdered = (myOrders.data ?? []).some((o: { createdAt?: string; status?: string }) => (o.createdAt ?? "") >= windowStart && o.status !== "cancelled");

  if (status.isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-red-600" /></div>;
  }

  const s = status.data!;

  // Ordering is only possible while the admin has the portal enabled and the window is open.
  // "My Orders" stays available at all times.
  const canOrderNow = s.enabled && s.inWindow;
  const closedMsg = s.windowOpenAt && new Date(s.windowOpenAt).getTime() > Date.now()
    ? `Ordering opens on ${new Date(s.windowOpenAt).toLocaleString()}.`
    : s.windowCloseAt
      ? `Ordering closed on ${new Date(s.windowCloseAt).toLocaleString()}.`
      : "Ordering is currently closed.";

  // Group branch orders under "Month Year" headings, newest month first (e.g. September 2026, August 2026).
  const orderDateOf = (o: any): Date => {
    const d = new Date(o.orderDate || o.createdAt);
    return isNaN(d.getTime()) ? new Date(0) : d;
  };
  const groupedOrders = myOrdersList
    .map((o: any, i: number) => ({ o, i, d: orderDateOf(o) }))
    .sort((a, b) => b.d.getTime() - a.d.getTime() || a.i - b.i)
    .reduce<{ key: string; label: string; orders: any[] }[]>((acc, { o, d }) => {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      let group = acc.find((g) => g.key === key);
      if (!group) {
        group = { key, label: d.toLocaleString("en-US", { month: "long", year: "numeric" }), orders: [] };
        acc.push(group);
      }
      group.orders.push(o);
      return acc;
    }, [])
    .sort((a, b) => b.key.localeCompare(a.key));

  const setQty = (id: string, qty: number) => {
    const it = items?.find((i) => i.id === id);
    const max = it ? it.remaining : 0;
    setCart((c) => ({ ...c, [id]: Math.min(Math.max(0, qty), max) }));
  };
  const cartItems = Object.entries(cart).filter(([, q]) => q > 0);

  const submit = () => {
    setError(null);
    setPlaced(false);
    if (cartItems.length === 0) { setError("Add at least one item to the order."); return; }
    if (alreadyOrdered) { setError("Your branch has already placed an order for this window. Only one order is allowed per window."); return; }
    setShowConfirm(true);
  };

  const confirmOrder = () => {
    placeOrder.mutate({ items: cartItems.map(([itemId, quantity]) => ({ itemId, quantity })), orderDate });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Stationary Order</h1>
        <p className="text-sm text-gray-500 mt-1">
          Order window: {s.windowOpenAt ? new Date(s.windowOpenAt).toLocaleString() : "now"} – {s.windowCloseAt ? new Date(s.windowCloseAt).toLocaleString() : "open"}
        </p>
      </div>

      {/* Tabs: Order (window only) / My Orders (always available) */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setView("ordering")}
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${view === "ordering" ? "border-red-600 text-red-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          Order
        </button>
        <button
          onClick={() => setView("orders")}
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${view === "orders" ? "border-red-600 text-red-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          My Orders{myOrdersList.length > 0 ? ` (${myOrdersList.length})` : ""}
        </button>
      </div>

      {view === "ordering" && (
        <>
          {placed && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
              <CheckCircle2 className="w-5 h-5" /> Order placed successfully.
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
          )}

          {!canOrderNow ? (
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="flex flex-col items-center justify-center py-16 text-center">
                {!s.enabled
                  ? <XCircle className="w-10 h-10 text-gray-300" />
                  : <Clock className="w-10 h-10 text-gray-300" />}
                <h2 className="mt-3 text-lg font-semibold text-gray-700">{!s.enabled ? "Stationary portal is disabled" : "Ordering window is closed"}</h2>
                <p className="text-sm text-gray-500 mt-1 max-w-sm">{!s.enabled ? "The administrator has not enabled stationary ordering yet." : closedMsg}</p>
                {myOrdersList.length > 0 && (
                  <button
                    onClick={() => setView("orders")}
                    className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
                  >
                    View my orders
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Items */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-800 flex items-center gap-2"><Package className="w-4 h-4" /> Available Items</h3>
                  <p className="text-xs text-gray-500 mt-1">Threshold = max quantity per branch for this order window.</p>
                  <div className="relative mt-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search items..."
                      value={itemSearch}
                      onChange={e => setItemSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500/20 outline-none"
                    />
                  </div>
                </div>
                {isLoading ? (
                  <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {items?.filter(it => !itemSearch || it.name.toLowerCase().includes(itemSearch.toLowerCase())).map((it) => {
                      const remaining = it.remaining;
                      const qty = cart[it.id] ?? 0;
                      return (
                        <div key={it.id} className="flex items-center justify-between p-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800">{it.name}</p>
                            <p className="text-xs text-gray-500">
                              {it.unit ? `Per ${it.unit} · ` : ""}Threshold: {it.threshold} · Remaining: <span className={remaining <= 0 ? "text-red-600 font-medium" : "text-green-600 font-medium"}>{remaining}</span>
                            </p>
                            {it.description && <p className="text-xs text-gray-400 mt-0.5">{it.description}</p>}
                          </div>
                          <div className="flex items-center gap-2 ml-3">
                            <button onClick={() => setQty(it.id, qty - 1)} disabled={qty <= 0} className="w-8 h-8 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40">−</button>
                            <input type="number" value={qty} onChange={e => setQty(it.id, Number(e.target.value))} className="w-14 text-center px-2 py-1 border border-gray-300 rounded-lg text-sm" />
                            <button onClick={() => setQty(it.id, qty + 1)} disabled={qty >= remaining} className="w-8 h-8 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40">+</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Cart */}
              <div className="bg-white rounded-xl border border-gray-200 h-fit">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-800 flex items-center gap-2"><ShoppingCart className="w-4 h-4" /> Your Order</h3>
                </div>
                <div className="p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Order date</label>
                    <input type="date" value={orderDate} readOnly className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-700 cursor-not-allowed" />
                  </div>
                  {cartItems.length === 0 ? (
                    <p className="text-sm text-gray-400">No items selected.</p>
                  ) : (
                    <div className="space-y-2">
                      {cartItems.map(([id, q]) => {
                        const it = items?.find((i) => i.id === id);
                        return (
                          <div key={id} className="flex justify-between text-sm">
                            <span className="text-gray-700">{it?.name} x{q}</span>
                            <span className="text-gray-500">{q} {it?.unit || "pcs"}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {alreadyOrdered ? (
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-3 py-2 text-xs">
                      <AlertTriangle className="w-4 h-4" /> Your branch already placed an order for this window.
                    </div>
                  ) : (
                    <button onClick={submit} disabled={placeOrder.isPending || cartItems.length === 0} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                      {placeOrder.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Place Order
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* My Orders - always available, grouped by month and year, newest first */}
      {view === "orders" && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">My Orders</h3>
            <span className="text-xs text-gray-500">{myOrdersList.length} order{myOrdersList.length === 1 ? "" : "s"}</span>
          </div>
          {myOrdersList.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">No orders yet.</div>
          ) : (
            <div>
              {groupedOrders.map((group) => (
                <div key={group.key}>
                  <div className="px-4 py-2 bg-gray-50 border-y border-gray-200 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">{group.label}</p>
                    <p className="text-xs text-gray-500">{group.orders.length} order{group.orders.length === 1 ? "" : "s"}</p>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {group.orders.map((o: any) => (
                      <div key={o.id} className="p-4">
                        <div className="flex justify-between items-start gap-2 mb-1">
                          <p className="text-sm font-medium text-gray-800">Order on {o.orderDate || new Date(o.createdAt).toLocaleDateString()}</p>
                          <div className="flex items-center gap-2">
                            {o.status === "dispatched" && (
                              <button
                                onClick={() => markReceived.mutate({ orderId: o.id })}
                                disabled={markReceived.isPending}
                                className="flex items-center gap-1 px-2.5 py-1 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:opacity-50"
                              >
                                {markReceived.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Received
                              </button>
                            )}
                            <button
                              onClick={() => setViewOrderId(o.id)}
                              className="flex items-center gap-1 px-2.5 py-1 border border-gray-300 rounded-lg text-xs text-gray-700 hover:bg-gray-50"
                            >
                              <Eye className="w-3.5 h-3.5" /> {o.status === "pending" ? "View / Edit" : "View"}
                            </button>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_META[o.status]?.cls ?? "bg-gray-100 text-gray-600"}`}>
                              {STATUS_META[o.status]?.label ?? o.status}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500">{o.items.map((i: any) => `${i.name} x${i.quantity}`).join(", ")}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Order Details / Edit Modal */}
      {viewOrder && (
        <OrderDetailsModal
          order={viewOrder}
          mode="branch"
          canEdit={viewOrder.status === "pending"}
          onClose={() => setViewOrderId(null)}
          onUpdateQty={(orderItemId, quantity) => updateQty.mutate({ orderItemId, quantity })}
          onDeleteItem={(orderItemId) => deleteItem.mutate({ orderItemId })}
          onCancelOrder={() => cancelOrder.mutate({ orderId: viewOrder.id })}
          cancelPending={cancelOrder.isPending}
          onAddItem={(itemId, quantity) => addItem.mutate({ orderId: viewOrder.id, itemId, quantity })}
          availableItems={items as any}
          addPending={addItem.isPending}
        />
      )}

      {/* Confirm Order Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowConfirm(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-1">Confirm Order</h3>
            <p className="text-sm text-gray-500 mb-4">Please review your order before placing it. You can only place <b>one order per branch per window</b>.</p>
            <div className="space-y-2 max-h-60 overflow-auto mb-4">
              {cartItems.map(([id, q]) => {
                const it = items?.find((i) => i.id === id);
                return (
                  <div key={id} className="flex justify-between text-sm">
                    <span className="text-gray-700">{it?.name} x{q}</span>
                    <span className="text-gray-500">{q} {it?.unit || "pcs"}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowConfirm(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={confirmOrder} disabled={placeOrder.isPending} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                {placeOrder.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Confirm & Place
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
