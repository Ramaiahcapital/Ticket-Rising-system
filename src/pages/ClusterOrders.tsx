import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";

export default function ClusterOrders() {
  const { user } = useAuth();
  const clusterUser = user as { type: string; clusterId?: string | null; clusterName?: string | null } | null;
  const utils = trpc.useUtils();
  const { data: cluster } = trpc.cluster.myCluster.useQuery();

  const defaultMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: ordersData, isLoading } = trpc.cluster.clusterOrders.useQuery(
    { clusterId: clusterUser?.clusterId || "", status: statusFilter, month },
    { enabled: !!clusterUser?.clusterId }
  );

  const approveOrder = trpc.cluster.approveOrder.useMutation({
    onSuccess: () => utils.cluster.clusterOrders.invalidate(),
  });
  const rejectOrder = trpc.cluster.rejectOrder.useMutation({
    onSuccess: () => utils.cluster.clusterOrders.invalidate(),
  });
  const updateQty = trpc.cluster.updateOrderItemQty.useMutation({
    onSuccess: () => utils.cluster.clusterOrders.invalidate(),
  });

  const [editing, setEditing] = useState<{ orderId: string; itemId: string; qty: number } | null>(null);
  const orders = ordersData?.orders ?? [];
  const branchTotals = ordersData?.branchTotals ?? [];
  const grandTotal = ordersData?.grandTotal ?? 0;

  const pendingCount = orders.filter((o: any) => !o.clusterApprovedAt && o.status !== "cancelled").length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Cluster Orders</h1>
        <p className="text-sm text-gray-500 mt-1">
          {cluster?.name || clusterUser?.clusterName || "Cluster"} — Review and approve branch orders
        </p>
      </div>

      {!clusterUser?.clusterId && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-700">You are not assigned to any cluster. Contact the admin to assign you to a cluster.</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center"><Clock className="w-5 h-5 text-amber-600" /></div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{pendingCount}</p>
              <p className="text-xs text-gray-500">Pending Approval</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-green-600" /></div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{orders.length}</p>
              <p className="text-xs text-gray-500">Total Orders</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Month</label>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:border-red-500 outline-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:border-red-500 outline-none">
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="fulfilled">Fulfilled</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Branch-wise totals */}
      {branchTotals.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-700">Branch-wise Summary</h4>
            <span className="text-sm font-bold text-gray-800">{orders.length} order{orders.length !== 1 ? "s" : ""} total</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {branchTotals.map((bt: any) => (
              <div key={bt.branchCode} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <p className="text-xs font-medium text-gray-600 truncate">{bt.branchName}</p>
                <p className="text-xs text-gray-400">{bt.branchCode}</p>
                <p className="text-sm font-bold text-gray-800 mt-1">{bt.orderCount} order{bt.orderCount > 1 ? "s" : ""}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Orders */}
      {isLoading ? (
        <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin text-red-600 mx-auto" /></div>
      ) : orders.length === 0 ? (
        <div className="p-8 text-center text-gray-400 text-sm bg-white rounded-xl border border-gray-200">No orders found for this month</div>
      ) : (
        orders.map((o: any) => (
          <div key={o.id} className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div>
                <p className="text-sm font-medium text-gray-800">{o.branchName} <span className="text-xs text-gray-400">({o.branchCode})</span></p>
                <p className="text-xs text-gray-500">Ordered: {new Date(o.createdAt).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-2">
                {o.status === "cancelled" ? (
                  <span className="flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 text-xs rounded-lg"><XCircle className="w-3 h-3" /> Rejected</span>
                ) : o.clusterApprovedAt ? (
                  <span className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-xs rounded-lg"><CheckCircle2 className="w-3 h-3" /> Approved</span>
                ) : (
                  <>
                    <button onClick={() => approveOrder.mutate({ orderId: o.id })} disabled={approveOrder.isPending} className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:opacity-50"><CheckCircle2 className="w-3 h-3" /> Approve</button>
                    <button onClick={() => { if (confirm("Reject this order?")) rejectOrder.mutate({ orderId: o.id }); }} disabled={rejectOrder.isPending} className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 disabled:opacity-50"><XCircle className="w-3 h-3" /> Reject</button>
                  </>
                )}
              </div>
            </div>
            <div className="divide-y divide-gray-50">
              {o.items.map((li: any) => (
                <div key={li.id} className="flex items-center justify-between p-3 px-4">
                  <div>
                    <p className="text-sm text-gray-800">{li.name}</p>
                    {li.unit && <p className="text-xs text-gray-500">{li.unit}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Qty:</span>
                    {!o.clusterApprovedAt && o.status !== "cancelled" ? (
                      editing?.orderId === o.id && editing?.itemId === li.id ? (
                        <>
                          <input type="number" value={editing!.qty} onChange={e => setEditing({ ...editing!, qty: Number(e.target.value) })} className="w-16 px-2 py-1 border border-gray-300 rounded-lg text-sm" />
                          <button onClick={() => { updateQty.mutate({ orderItemId: li.id, quantity: editing!.qty }); setEditing(null); }} className="px-2 py-1 bg-red-600 text-white text-xs rounded-lg">OK</button>
                        </>
                      ) : (
                        <button onClick={() => setEditing({ orderId: o.id, itemId: li.id, qty: li.quantity })} className="px-2 py-1 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">{li.quantity}</button>
                      )
                    ) : (
                      <span className="text-sm text-gray-800 font-medium">{li.quantity}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
