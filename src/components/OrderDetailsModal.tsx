import { useState } from "react";
import { X, CheckCircle2, XCircle, Trash2, Loader2, Package } from "lucide-react";

interface OrderDetailsModalProps {
  order: any;
  onClose: () => void;
  /** "cluster" shows Approve/Reject actions; "admin" shows a status selector. */
  mode: "cluster" | "admin";
  /** When false, qty edit + delete are hidden. */
  canEdit: boolean;
  onUpdateQty: (orderItemId: string, quantity: number) => void;
  onDeleteItem: (orderItemId: string) => void;
  onApprove?: () => void;
  onReject?: () => void;
  approvePending?: boolean;
  rejectPending?: boolean;
  onSetStatus?: (status: "pending" | "approved" | "dispatched" | "cancelled") => void;
  statusPending?: boolean;
}

export function OrderDetailsModal({
  order,
  onClose,
  mode,
  canEdit,
  onUpdateQty,
  onDeleteItem,
  onApprove,
  onReject,
  approvePending,
  rejectPending,
  onSetStatus,
  statusPending,
}: OrderDetailsModalProps) {
  const [editing, setEditing] = useState<{ itemId: string; qty: number } | null>(null);

  const itemCount = order?.items?.length ?? 0;
  const approved = !!order?.clusterApprovedAt && order?.status !== "cancelled";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-200">
          <div>
            <p className="text-lg font-bold text-gray-800">
              {order?.branchName} <span className="text-sm font-normal text-gray-400">({order?.branchCode})</span>
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {order?.clusterName ? `${order.clusterName} · ` : ""}
              {new Date(order?.createdAt).toLocaleString()}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm font-bold text-gray-800">Total: ₹{order?.total}</span>
              <span className="text-xs text-gray-400">· {itemCount} item{itemCount !== 1 ? "s" : ""}</span>
              {mode === "admin" ? (
                order?.status === "cancelled" ? (
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 text-xs rounded-full"><XCircle className="w-3 h-3" /> Cancelled</span>
                ) : order?.status === "received" ? (
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded-full"><CheckCircle2 className="w-3 h-3" /> Received</span>
                ) : order?.status === "dispatched" ? (
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded-full"><Package className="w-3 h-3" /> Dispatched</span>
                ) : order?.status === "approved" ? (
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full"><CheckCircle2 className="w-3 h-3" /> Approved</span>
                ) : (
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded-full"><Package className="w-3 h-3" /> Pending</span>
                )
              ) : order?.status === "cancelled" ? (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 text-xs rounded-full"><XCircle className="w-3 h-3" /> Rejected</span>
              ) : approved ? (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded-full"><CheckCircle2 className="w-3 h-3" /> Approved</span>
              ) : (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded-full"><Package className="w-3 h-3" /> Pending</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"><X className="w-5 h-5" /></button>
        </div>

        {/* Items */}
        <div className="overflow-y-auto p-5 space-y-2">
          {itemCount === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">No items in this order</div>
          ) : (
            order.items.map((li: any) => (
              <div key={li.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-gray-800">{li.name}</p>
                  <p className="text-xs text-gray-500">₹{li.unitPrice} each · {li.unit ? `${li.unit} · ` : ""}₹{li.lineTotal}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Qty:</span>
                  {canEdit ? (
                    editing?.itemId === li.id ? (
                      <>
                        <input
                          type="number"
                          min={0}
                          max={li.threshold || undefined}
                          value={editing!.qty}
                          onChange={e => {
                            const val = Math.max(0, li.threshold ? Math.min(Number(e.target.value), li.threshold) : Number(e.target.value));
                            setEditing({ itemId: li.id, qty: val });
                          }}
                          className="w-16 px-2 py-1 border border-gray-300 rounded-lg text-sm"
                        />
                        {li.threshold > 0 && <span className="text-[10px] text-gray-400">max {li.threshold}</span>}
                        <button
                          onClick={() => { onUpdateQty(li.id, editing!.qty); setEditing(null); }}
                          className="px-2 py-1 bg-red-600 text-white text-xs rounded-lg"
                        >
                          OK
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setEditing({ itemId: li.id, qty: li.quantity })}
                        className="px-2 py-1 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                      >
                        {li.quantity}
                      </button>
                    )
                  ) : (
                    <span className="text-sm text-gray-800 font-semibold">{li.quantity}</span>
                  )}
                  {canEdit && (
                    <button
                      title="Remove item"
                      onClick={() => { if (window.confirm(`Remove "${li.name}" from this order?`)) onDeleteItem(li.id); }}
                      className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer actions */}
        {(mode === "cluster" ? (onApprove || onReject) && !approved && order?.status !== "cancelled" : onSetStatus) && (
          <div className="p-4 border-t border-gray-200 flex items-center justify-end gap-2">
            {mode === "cluster" ? (
              <>
                <button
                  onClick={onReject}
                  disabled={rejectPending}
                  className="flex items-center gap-1 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {rejectPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} Reject
                </button>
                <button
                  onClick={onApprove}
                  disabled={approvePending}
                  className="flex items-center gap-1 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {approvePending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Approve
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Status:</span>
                <select
                  value={order?.status ?? "pending"}
                  disabled={statusPending}
                  onChange={e => onSetStatus?.(e.target.value as "pending" | "approved" | "dispatched" | "cancelled")}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:border-red-500 outline-none"
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="dispatched">Dispatched</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
