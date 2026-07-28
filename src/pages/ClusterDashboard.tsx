import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Building2, CheckCircle2, Clock, AlertTriangle } from "lucide-react";

export default function ClusterDashboard() {
  const { user } = useAuth();
  const clusterUser = user as { type: string; clusterId?: string | null; clusterName?: string | null } | null;
  const { data: cluster } = trpc.cluster.myCluster.useQuery();
  const { data: branches, isLoading: branchesLoading } = trpc.cluster.clusterBranches.useQuery();

  const defaultMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);

  const { data: ordersData, isLoading: ordersLoading } = trpc.cluster.clusterOrders.useQuery(
    { clusterId: clusterUser?.clusterId || "", status: "all", month },
    { enabled: !!clusterUser?.clusterId }
  );

  const orders = ordersData?.orders ?? [];
  const branchTotals = ordersData?.branchTotals ?? [];

  // Branches that have ordered this month
  const orderedBranchCodes = new Set(orders.filter((o: any) => o.status !== "cancelled").map((o: any) => o.branchCode));
  // Branches with pending orders (not yet cluster-approved)
  const pendingBranchCodes = new Set(orders.filter((o: any) => !o.clusterApprovedAt && o.status !== "cancelled").map((o: any) => o.branchCode));

  const isLoading = branchesLoading || ordersLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Cluster Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          {cluster?.name || clusterUser?.clusterName || "Cluster"} — Overview of branches and their order status
        </p>
      </div>

      {!clusterUser?.clusterId && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-700">You are not assigned to any cluster. Contact the admin to assign you to a cluster.</p>
        </div>
      )}

      {/* Month picker */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Month</label>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:border-red-500 outline-none" />
      </div>

      {isLoading ? (
        <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin text-red-600 mx-auto" /></div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><Building2 className="w-5 h-5 text-blue-600" /></div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">{branches?.length || 0}</p>
                  <p className="text-xs text-gray-500">Total Branches</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-green-600" /></div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">{orderedBranchCodes.size}</p>
                  <p className="text-xs text-gray-500">Branches Ordered</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center"><Clock className="w-5 h-5 text-amber-600" /></div>
                <div>
                  <p className="text-2xl font-bold text-gray-800">{pendingBranchCodes.size}</p>
                  <p className="text-xs text-gray-500">Pending Approval</p>
                </div>
              </div>
            </div>
          </div>

          {/* Branch list */}
          {branches && branches.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">All Branches</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {branches.map((b: any) => {
                  const isOrdered = orderedBranchCodes.has(b.branch_code);
                  const isPending = pendingBranchCodes.has(b.branch_code);
                  return (
                    <div key={b.id} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-800">{b.name || b.branch_code}</p>
                          <p className="text-xs text-gray-400">{b.branch_code}</p>
                        </div>
                        {isPending ? (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded-full">
                            <Clock className="w-3 h-3" /> Pending
                          </span>
                        ) : isOrdered ? (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> Ordered
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {branches && branches.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
              No branches assigned to this cluster yet.
            </div>
          )}
        </>
      )}
    </div>
  );
}
