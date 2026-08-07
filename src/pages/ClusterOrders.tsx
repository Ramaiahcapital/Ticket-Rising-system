import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, CheckCircle2, XCircle, Clock, AlertTriangle, Eye, Package } from "lucide-react";
import { OrderDetailsModal } from "@/components/OrderDetailsModal";

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
  const deleteItem = trpc.cluster.deleteOrderItem.useMutation({
    onSuccess: () => utils.cluster.clusterOrders.invalidate(),
    onError: (e) => alert(e.message),
  });

  const [viewOrderId, setViewOrderId] = useState<string | null>(null);
  const orders = ordersData?.orders ?? [];
  const branchTotals = ordersData?.branchTotals ?? [];
  const viewOrder = orders.find((o: any) => o.id === viewOrderId) ?? null;

  const pendingCount = orders.filter((o: any) => !o.clusterApprovedAt && o.status !== "cancelled").length;

  const statusBadge = (o: any) =>
    o.status === "cancelled" ? (
      <span className="flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 text-xs rounded-lg"><XCircle className="w-3 h-3" /> Rejected</span>
    ) : o.status === "received" ? (
      <span className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-xs rounded-lg"><CheckCircle2 className="w-3 h-3" /> Received</span>
    ) : o.status === "dispatched" ? (
      <span className="flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 text-xs rounded-lg"><Package className="w-3 h-3" /> Dispatched</span>
    ) : o.clusterApprovedAt ? (
      <span className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-xs rounded-lg"><CheckCircle2 className="w-3 h-3" /> Approved</span>
    ) : o.status === "approved" ? (
      <span className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-lg"><CheckCircle2 className="w-3 h-3" /> Approved</span>
    ) : (
      <span className="flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 text-xs rounded-lg"><Package className="w-3 h-3" /> Pending</span>
    );

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
            <option value="approved">Approved</option>
            <option value="dispatched">Dispatched</option>
            <option value="received">Received</option>
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
          <div key={o.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-800">{o.branchName} <span className="text-xs text-gray-400">({o.branchCode})</span></p>
              <p className="text-xs text-gray-500 mt-0.5">{new Date(o.createdAt).toLocaleString()}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-sm font-bold text-gray-800">₹{o.total}</span>
                <span className="text-xs text-gray-400">· {o.items.length} item{o.items.length !== 1 ? "s" : ""}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {statusBadge(o)}
              <button
                onClick={() => setViewOrderId(o.id)}
                className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                <Eye className="w-4 h-4" /> View Items
              </button>
            </div>
          </div>
        ))
      )}

      {viewOrder && (
        <OrderDetailsModal
          order={viewOrder}
          mode="cluster"
          canEdit={!viewOrder.clusterApprovedAt && viewOrder.status !== "cancelled" && viewOrder.status !== "dispatched" && viewOrder.status !== "received"}
          onClose={() => setViewOrderId(null)}
          onUpdateQty={(orderItemId, quantity) => updateQty.mutate({ orderItemId, quantity })}
          onDeleteItem={(orderItemId) => deleteItem.mutate({ orderItemId })}
          onApprove={() => approveOrder.mutate({ orderId: viewOrder.id })}
          onReject={() => { if (window.confirm("Reject this order?")) rejectOrder.mutate({ orderId: viewOrder.id }); }}
          approvePending={approveOrder.isPending}
          rejectPending={rejectOrder.isPending}
        />
      )}
    </div>
  );
}
