import { useState, useRef, useMemo, Fragment } from "react";
import { trpc } from "@/providers/trpc";
import { Plus, Pencil, Trash2, X, Loader2, Package, Settings2, ClipboardList, BarChart3, Save, Download, Printer, Eye, Search, History, AlertTriangle, CheckCircle2, Clock, XCircle, Truck, PackageCheck, ChevronDown, ChevronUp } from "lucide-react";
import { OrderDetailsModal } from "@/components/OrderDetailsModal";
import ExcelJS from "exceljs";

type Tab = "items" | "portal" | "orders" | "audit" | "reports";

export default function StationaryAdmin() {
  const [tab, setTab] = useState<Tab>("items");

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "items", label: "Items", icon: Package },
    { id: "portal", label: "Portal Settings", icon: Settings2 },
    { id: "orders", label: "Orders", icon: ClipboardList },
    { id: "audit", label: "Order Audit", icon: History },
    { id: "reports", label: "Reports", icon: BarChart3 },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Stationary</h1>
        <p className="text-sm text-gray-500 mt-1">Manage stationary items, ordering portal and reports</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active ? "border-red-600 text-red-600" : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "items" && <ItemsTab />}
      {tab === "portal" && <PortalTab />}
      {tab === "orders" && <OrdersTab />}
      {tab === "audit" && <AuditTab />}
      {tab === "reports" && <ReportsTab />}
    </div>
  );
}

/* ===================== Order Audit ===================== */

type StageKey = "pending_cluster" | "awaiting_admin" | "approved" | "dispatched" | "received" | "fulfilled" | "cancelled";

const STAGE_META: Record<StageKey, { label: string; short: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  pending_cluster: { label: "Pending Cluster Approval", short: "Pending cluster", cls: "bg-amber-50 text-amber-700 border-amber-200", Icon: Clock },
  awaiting_admin: { label: "Awaiting Stationary Admin", short: "Awaiting admin", cls: "bg-blue-50 text-blue-700 border-blue-200", Icon: Clock },
  approved: { label: "Approved", short: "Approved", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
  dispatched: { label: "Dispatched", short: "Dispatched", cls: "bg-indigo-50 text-indigo-700 border-indigo-200", Icon: Truck },
  received: { label: "Received by Branch", short: "Received", cls: "bg-teal-50 text-teal-700 border-teal-200", Icon: PackageCheck },
  fulfilled: { label: "Fulfilled / Closed", short: "Fulfilled", cls: "bg-green-50 text-green-800 border-green-200", Icon: PackageCheck },
  cancelled: { label: "Cancelled", short: "Cancelled", cls: "bg-gray-100 text-gray-500 border-gray-200", Icon: XCircle },
};

function StageBadge({ stage }: { stage: string }) {
  const meta = STAGE_META[stage as StageKey];
  if (!meta) return <span className="text-xs text-gray-400">-</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.cls}`}>
      <meta.Icon className="w-3.5 h-3.5" />
      {meta.short}
    </span>
  );
}

const money = (n: number) => `₹${Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function AuditTab() {
  const [month, setMonth] = useState<string>("");
  const [branchId, setBranchId] = useState<string>("");
  const [stageFilter, setStageFilter] = useState<string>("");
  const [groupByMonth, setGroupByMonth] = useState(true);
  const [viewOrderId, setViewOrderId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: branches } = trpc.stationary.listBranches.useQuery();
  const { data, isLoading } = trpc.stationary.orderAudit.useQuery({ month: month || undefined, branchId: branchId || undefined });

  const totals = data?.totals;
  const orders = data?.orders ?? [];
  const viewOrder = viewOrderId ? orders.find((o: any) => o.id === viewOrderId) : null;

  const visible = useMemo(() => (stageFilter ? orders.filter((o) => o.stage === stageFilter) : orders), [orders, stageFilter]);

  const groups = useMemo((): Array<[string, typeof visible]> => {
    if (!groupByMonth) return [["All orders", visible]];
    const acc = visible.reduce<Record<string, typeof visible>>((a, o) => {
      const key = o.orderDate ? String(o.orderDate).slice(0, 7) : "No date";
      (a[key] ||= []).push(o);
      return a;
    }, {});
    return Object.entries(acc).sort((a, b) => b[0].localeCompare(a[0])) as Array<[string, typeof visible]>;
  }, [visible, groupByMonth]);

  const monthOptions = useMemo(() => {
    const set = new Set<string>(data?.months ?? []);
    return Array.from(set).sort().reverse();
  }, [data?.months]);

  const exportCsv = async () => {
    if (!orders.length) return;
    const header = ["Order Date", "Branch", "Branch Code", "Cluster", "Ordered By", "Stage", "Status", "Cluster Approved At", "Cluster Approved By", "Items", "Total"];
    const rows = orders.map((o) => [
      o.orderDate ?? "", o.branchName, o.branchCode, o.clusterName, o.orderedBy,
      STAGE_META[o.stage as StageKey]?.label ?? o.stage, o.status,
      o.clusterApprovedAt ?? "", o.clusterApprovedByName,
      o.itemCount, String(o.total),
    ]);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Stationary Order Audit");
    ws.addRow(header);
    rows.forEach((r) => ws.addRow(r));
    ws.getRow(1).font = { bold: true };
    ws.columns.forEach((c: any, i: number) => { c.width = [12, 24, 12, 20, 22, 26, 12, 22, 22, 8, 12][i] ?? 14; });
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `stationary-order-audit-${month || "last-12-months"}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cards = [
    { label: "Orders", value: totals?.orders ?? 0, sub: `${totals?.branches ?? 0} branches`, cls: "text-gray-800" },
    { label: "Pending cluster approval", value: totals?.pending_cluster ?? 0, sub: "waiting on cluster", cls: (totals?.pending_cluster ?? 0) > 0 ? "text-amber-600" : "text-gray-800" },
    { label: "Awaiting stationary admin", value: totals?.awaiting_admin ?? 0, sub: "cluster approved", cls: (totals?.awaiting_admin ?? 0) > 0 ? "text-blue-600" : "text-gray-800" },
    { label: "Open (incl. dispatched)", value: totals?.open ?? 0, sub: "not yet closed", cls: "text-indigo-600" },
    { label: "Completed", value: totals?.completed ?? 0, sub: "received / fulfilled", cls: "text-emerald-600" },
    { label: "Order value", value: money(totals?.value ?? 0), sub: `${totals?.cancelled ?? 0} cancelled`, cls: "text-gray-800" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Order Audit</h2>
          <p className="text-sm text-gray-500">Which branches ordered, what is pending approval, and what is completed</p>
        </div>
        <button onClick={exportCsv} disabled={!orders.length}
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      {(totals?.pending_cluster ?? 0) > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <span className="font-semibold">{totals?.pending_cluster} order(s) still awaiting cluster approval.</span>{" "}
            These do not appear in the Orders tab until the cluster approves them.
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="text-xs text-gray-500 uppercase tracking-wide">{c.label}</div>
            <div className={`mt-1 text-xl font-bold ${c.cls}`}>{c.value}</div>
            <div className="text-xs text-gray-400">{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Month</label>
          <select value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm">
            <option value="">Last 12 months</option>
            {monthOptions.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Branch</label>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm">
            <option value="">All branches</option>
            {(branches ?? []).map((b: any) => <option key={b.id} value={b.id}>{b.name}{b.code ? ` (${b.code})` : ""}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Stage</label>
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm">
            <option value="">All stages</option>
            {Object.entries(STAGE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-1.5 text-sm text-gray-700">
          <input type="checkbox" checked={groupByMonth} onChange={(e) => setGroupByMonth(e.target.checked)} className="rounded" />
          Group by month
        </label>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="border-b border-gray-200 px-4 py-2.5">
          <h3 className="text-sm font-semibold text-gray-800">Branch-wise summary</h3>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading</div>
        ) : !data?.branchSummary?.length ? (
          <div className="py-10 text-center text-sm text-gray-500">No orders in this period</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Branch</th>
                  <th className="px-3 py-2 text-left font-medium">Cluster</th>
                  <th className="px-3 py-2 text-right font-medium">Orders</th>
                  <th className="px-3 py-2 text-right font-medium text-amber-600">Pending cluster</th>
                  <th className="px-3 py-2 text-right font-medium text-blue-600">Awaiting admin</th>
                  <th className="px-3 py-2 text-right font-medium text-emerald-600">Approved</th>
                  <th className="px-3 py-2 text-right font-medium text-indigo-600">Dispatched</th>
                  <th className="px-3 py-2 text-right font-medium text-teal-600">Completed</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">Cancelled</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.branchSummary.map((s) => (
                  <tr key={s.branchId} className="hover:bg-gray-50 cursor-pointer" onClick={() => { setBranchId(s.branchId); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                    <td className="px-3 py-2 font-medium text-gray-800">{s.branchName || "-"}</td>
                    <td className="px-3 py-2 text-gray-600">{s.clusterNames.length ? s.clusterNames.join(", ") : "-"}</td>
                    <td className="px-3 py-2 text-right">{s.orders}</td>
                    <td className="px-3 py-2 text-right">{s.pending_cluster > 0 ? <span className="font-semibold text-amber-600">{s.pending_cluster}</span> : <span className="text-gray-300">0</span>}</td>
                    <td className="px-3 py-2 text-right">{s.awaiting_admin > 0 ? <span className="font-semibold text-blue-600">{s.awaiting_admin}</span> : <span className="text-gray-300">0</span>}</td>
                    <td className="px-3 py-2 text-right">{s.approved || <span className="text-gray-300">0</span>}</td>
                    <td className="px-3 py-2 text-right">{s.dispatched || <span className="text-gray-300">0</span>}</td>
                    <td className="px-3 py-2 text-right">{s.completed || <span className="text-gray-300">0</span>}</td>
                    <td className="px-3 py-2 text-right">{s.cancelled || <span className="text-gray-300">0</span>}</td>
                    <td className="px-3 py-2 text-right font-medium">{money(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {groups.map(([label, list]) => (
          <div key={label} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2.5">
              <h3 className="text-sm font-semibold text-gray-800">{groupByMonth ? label : "Order lifecycle"}</h3>
              <span className="text-xs text-gray-500">{list.length} order(s) · {money(list.reduce((s: number, o: any) => s + o.total, 0))}</span>
            </div>
            {!list.length ? (
              <div className="py-8 text-center text-sm text-gray-500">No orders</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Order date</th>
                      <th className="px-3 py-2 text-left font-medium">Branch</th>
                      <th className="px-3 py-2 text-left font-medium">Cluster</th>
                      <th className="px-3 py-2 text-left font-medium">Ordered by</th>
                      <th className="px-3 py-2 text-left font-medium">Cluster approval</th>
                      <th className="px-3 py-2 text-left font-medium">Stage</th>
                      <th className="px-3 py-2 text-right font-medium">Items</th>
                      <th className="px-3 py-2 text-right font-medium">Total</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {list.map((o) => (
                      <Fragment key={o.id}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-3 py-2 whitespace-nowrap text-gray-700">{o.orderDate ?? "-"}</td>
                          <td className="px-3 py-2 font-medium text-gray-800">{o.branchName || "-"}</td>
                          <td className="px-3 py-2 text-gray-600">{o.clusterName || "-"}</td>
                          <td className="px-3 py-2 text-gray-600">{o.orderedBy || "-"}</td>
                          <td className="px-3 py-2 text-xs text-gray-600">
                            {o.clusterApprovedAt ? (
                              <span className="text-emerald-700">
                                {new Date(o.clusterApprovedAt).toLocaleString()}{o.clusterApprovedByName ? ` · ${o.clusterApprovedByName}` : ""}
                              </span>
                            ) : o.clusterId ? (
                              <span className="text-amber-600">Not approved yet</span>
                            ) : (
                              <span className="text-gray-400">No cluster</span>
                            )}
                          </td>
                          <td className="px-3 py-2"><StageBadge stage={o.stage} /></td>
                          <td className="px-3 py-2 text-right">{o.itemCount}</td>
                          <td className="px-3 py-2 text-right font-medium">{money(o.total)}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => setExpanded(expanded === o.id ? null : o.id)} title="Toggle items"
                                className="rounded p-1 text-gray-500 hover:bg-gray-100">
                                {expanded === o.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                              <button onClick={() => setViewOrderId(o.id)} title="Order details"
                                className="rounded p-1 text-gray-500 hover:bg-gray-100">
                                <Eye className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expanded === o.id && (
                          <tr className="bg-gray-50/60">
                            <td colSpan={9} className="px-6 py-2">
                              <ul className="space-y-0.5 text-xs text-gray-700">
                                {o.items.map((it) => (
                                  <li key={it.id} className="flex justify-between gap-4">
                                    <span>{it.name}{it.unit ? ` (${it.unit})` : ""} × {it.quantity}</span>
                                    <span className="font-medium">{money(it.lineTotal)}</span>
                                  </li>
                                ))}
                                {!o.items.length && <li className="text-gray-400">No line items</li>}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
        {!isLoading && !visible.length && (
          <div className="rounded-lg border border-gray-200 bg-white py-10 text-center text-sm text-gray-500">No orders match the selected filters</div>
        )}
      </div>

      {viewOrder && (
        <OrderDetailsModal
          order={viewOrder}
          mode="admin"
          canEdit={false}
          onClose={() => setViewOrderId(null)}
          onUpdateQty={() => {}}
          onDeleteItem={() => {}}
        />
      )}
    </div>
  );
}

/* ===================== Items ===================== */
function ItemsTab() {
  const utils = trpc.useUtils();
  const { data: items, isLoading } = trpc.stationary.listItems.useQuery({ includeInactive: true });
  const createItem = trpc.stationary.createItem.useMutation({ onSuccess: () => { utils.stationary.listItems.invalidate(); close(); } });
  const updateItem = trpc.stationary.updateItem.useMutation({ onSuccess: () => { utils.stationary.listItems.invalidate(); close(); } });
  const deleteItem = trpc.stationary.deleteItem.useMutation({
    onSuccess: () => utils.stationary.listItems.invalidate(),
    onError: (err) => alert(err.message),
  });

  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", unit: "", price: "0", threshold: "0", isActive: true });
  const [itemSearch, setItemSearch] = useState("");

  const open = (it?: any) => {
    if (it) {
      setEditing(it.id);
      setForm({ name: it.name, description: it.description || "", unit: it.unit || "", price: String(it.price), threshold: String(it.threshold), isActive: it.isActive });
    } else {
      setEditing(null);
      setForm({ name: "", description: "", unit: "", price: "0", threshold: "0", isActive: true });
    }
    setShow(true);
  };
  const close = () => setShow(false);

  const save = () => {
    const payload = {
      name: form.name,
      description: form.description || undefined,
      unit: form.unit || undefined,
      price: Number(form.price) || 0,
      threshold: Number(form.threshold) || 0,
      isActive: form.isActive,
    };
    if (editing) updateItem.mutate({ id: editing, ...payload });
    else createItem.mutate(payload);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-800">Stationary Items <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full ml-2">{items?.length || 0}</span></h3>
        <button onClick={() => open()} className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700"><Plus className="w-3 h-3" /> Add Item</button>
      </div>
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="relative">
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
      <div className="divide-y divide-gray-50">
        {isLoading ? <div className="p-8 text-center text-gray-400 text-sm">Loading…</div> : items?.filter(it => !itemSearch || it.name.toLowerCase().includes(itemSearch.toLowerCase())).map((it) => (
          <div key={it.id} className="flex items-center justify-between p-4 hover:bg-gray-50">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">{it.name} {!it.isActive && <span className="text-[10px] text-gray-400">(inactive)</span>}</p>
              <p className="text-xs text-gray-500">{it.unit ? `Unit: ${it.unit} · ` : ""}Price: ₹{it.price} · Threshold/branch: {it.threshold}</p>
              {it.description && <p className="text-xs text-gray-400 mt-0.5">{it.description}</p>}
            </div>
            <div className="flex gap-1">
              <button onClick={() => open(it)} className="p-1.5 hover:bg-blue-50 rounded-lg text-gray-400 hover:text-blue-600"><Pencil className="w-3.5 h-3.5" /></button>
              <button onClick={() => { if (confirm("Delete item?")) deleteItem.mutate({ id: it.id }); }} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
      </div>

      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={close} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">{editing ? "Edit Item" : "Add Item"}</h3>
              <button onClick={close} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
            </div>
            <div className="space-y-3">
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Item name (e.g. A4 Paper)" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
              <input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="Unit (e.g. ream, box, pcs)" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Price (₹)</label>
                  <input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Threshold / branch</label>
                  <input type="number" value={form.threshold} onChange={e => setForm({ ...form, threshold: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
                  <p className="text-[10px] text-gray-400 mt-1">Max qty each branch may order</p>
                </div>
              </div>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description (optional)" rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none resize-none" />
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} /> Active (orderable)
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={close} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={save} disabled={createItem.isPending || updateItem.isPending} className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
                {(createItem.isPending || updateItem.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ===================== Portal Settings ===================== */
function PortalTab() {
  const utils = trpc.useUtils();
  const { data: settings } = trpc.stationary.getPortalSettings.useQuery();
  const update = trpc.stationary.updatePortalSettings.useMutation({ onSuccess: () => utils.stationary.getPortalSettings.invalidate() });

  const [enabled, setEnabled] = useState(false);
  const [openAt, setOpenAt] = useState("");
  const [closeAt, setCloseAt] = useState("");

  // sync from server
  const synced = useState(false);
  if (settings && !synced[0]) {
    setEnabled(settings.enabled);
    setOpenAt(settings.windowOpenAt ? settings.windowOpenAt.slice(0, 16) : "");
    setCloseAt(settings.windowCloseAt ? settings.windowCloseAt.slice(0, 16) : "");
    synced[1](true);
  }

  const save = () => update.mutate({
    enabled,
    windowOpenAt: openAt || null,
    windowCloseAt: closeAt || null,
  });

  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-800">Enable Stationary Portal</h3>
            <p className="text-xs text-gray-500">When off, branches cannot access the ordering portal.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="sr-only peer" />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-red-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Order window opens</label>
            <input type="datetime-local" value={openAt} onChange={e => setOpenAt(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
            <p className="text-[10px] text-gray-400 mt-1">Branches can order from this date/time</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Order window closes</label>
            <input type="datetime-local" value={closeAt} onChange={e => setCloseAt(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
            <p className="text-[10px] text-gray-400 mt-1">After this, portal is locked for branches</p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Portal access</label>
          <p className="text-xs text-gray-500">All branch accounts can access the portal while it is enabled and within the order window.</p>
        </div>

        <div className="flex justify-end">
          <button onClick={save} disabled={update.isPending} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
            {update.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===================== Orders (admin edit) ===================== */
function OrdersTab() {
  const utils = trpc.useUtils();
  const { data: branches } = trpc.stationary.listBranches.useQuery();
  const [branchId, setBranchId] = useState<string>("");
  const [status, setStatus] = useState<"all" | "pending" | "approved" | "dispatched" | "received" | "cancelled">("all");
  const defaultMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);
  const { data, isLoading } = trpc.stationary.listOrders.useQuery({ branchId: branchId || undefined, status, month });

  const orders = data?.orders ?? [];
  const branchTotals = data?.branchTotals ?? [];
  const grandTotal = data?.grandTotal ?? 0;

  const [qtySavingId, setQtySavingId] = useState<string | null>(null);
  const [deleteSavingId, setDeleteSavingId] = useState<string | null>(null);

  const updateQty = trpc.stationary.updateOrderItemQty.useMutation({
    onSuccess: () => utils.stationary.listOrders.invalidate(),
    onSettled: () => setQtySavingId(null),
  });
  const setStatusM = trpc.stationary.setOrderStatus.useMutation({ onSuccess: () => utils.stationary.listOrders.invalidate() });
  const deleteItemM = trpc.stationary.deleteOrderItem.useMutation({
    onSuccess: () => utils.stationary.listOrders.invalidate(),
    onError: (err) => alert(err.message),
    onSettled: () => setDeleteSavingId(null),
  });

  const handleUpdateQty = (orderItemId: string, quantity: number) => {
    setQtySavingId(orderItemId);
    updateQty.mutate({ orderItemId, quantity });
  };
  const handleDeleteItem = (orderItemId: string) => {
    setDeleteSavingId(orderItemId);
    deleteItemM.mutate({ orderItemId });
  };
  const handleSetStatus = (status: "pending" | "approved" | "dispatched") => {
    if (!viewOrder) return;
    setStatusM.mutate({ orderId: viewOrder.id, status });
  };

  const [viewOrderId, setViewOrderId] = useState<string | null>(null);
  const viewOrder = orders.find((o: any) => o.id === viewOrderId) ?? null;

  const statusBadge = (o: any) =>
    o.status === "cancelled" ? (
      <span className="px-2 py-1 bg-red-50 text-red-700 text-xs rounded-lg">Cancelled</span>
    ) : o.status === "received" ? (
      <span className="px-2 py-1 bg-green-50 text-green-700 text-xs rounded-lg">Received</span>
    ) : o.status === "dispatched" ? (
      <span className="px-2 py-1 bg-indigo-50 text-indigo-700 text-xs rounded-lg">Dispatched</span>
    ) : o.status === "approved" ? (
      <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-lg">Approved</span>
    ) : o.status === "fulfilled" ? (
      <span className="px-2 py-1 bg-green-50 text-green-700 text-xs rounded-lg">Fulfilled</span>
    ) : (
      <span className="flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 text-xs rounded-lg"><Package className="w-3 h-3" /> Pending</span>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Month</label>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:border-red-500 outline-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Branch</label>
          <select value={branchId} onChange={e => setBranchId(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:border-red-500 outline-none">
            <option value="">All branches</option>
            {branches?.map(b => <option key={b.id} value={b.id}>{b.branchName} ({b.branchCode})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
          <select value={status} onChange={e => setStatus(e.target.value as any)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:border-red-500 outline-none">
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="dispatched">Dispatched</option>
            <option value="received">Received</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Branch-wise totals summary */}
      {branchTotals.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-700">Branch-wise Total</h4>
            <span className="text-sm font-bold text-gray-800">Grand Total: ₹{grandTotal}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {branchTotals.map(bt => (
              <div key={bt.branchCode} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <p className="text-xs font-medium text-gray-600 truncate">{bt.branchName}</p>
                <p className="text-xs text-gray-400">{bt.branchCode} · {bt.orderCount} order{bt.orderCount > 1 ? "s" : ""}</p>
                <p className="text-sm font-bold text-gray-800 mt-1">₹{bt.total}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoading ? <div className="p-8 text-center text-gray-400 text-sm">Loading…</div> :
        orders.length === 0 ? <div className="p-8 text-center text-gray-400 text-sm bg-white rounded-xl border border-gray-200">No orders found for this month</div> :
        orders.map((o: any) => (
          <div key={o.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-800">{o.branchName} <span className="text-xs text-gray-400">({o.branchCode})</span></p>
              <p className="text-xs text-gray-500 mt-0.5">
                {o.clusterName ? `${o.clusterName} · ` : ""}{new Date(o.createdAt).toLocaleString()}
              </p>
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
        ))}

      {viewOrder && (
        <OrderDetailsModal
          order={viewOrder}
          mode="admin"
          canEdit={viewOrder.status !== "cancelled" && viewOrder.status !== "received"}
          onClose={() => setViewOrderId(null)}
          onUpdateQty={handleUpdateQty}
          onDeleteItem={handleDeleteItem}
          onSetStatus={handleSetStatus}
          updatingItemId={qtySavingId}
          deletingItemId={deleteSavingId}
          statusPending={setStatusM.isPending}
        />
      )}
    </div>
  );
}

/* ===================== Reports ===================== */
function ReportsTab() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [month, setMonth] = useState("");
  const { data: allItems } = trpc.stationary.listItems.useQuery();
  const { data, isLoading, refetch } = trpc.stationary.reports.useQuery(
    { from: from || undefined, to: to || undefined, month: month || undefined },
    { enabled: false }
  );

  // Build pivot: item -> branch -> qty
  const pivotData = (() => {
    if (!data || !allItems) return null;
    const branchIds = Array.from(new Set((data.orders ?? []).map((o: any) => o.branchId)));
    const branches = branchIds
      .map((id) => ({ id, ...(data.byBranch.find((b: any) => b.branchId === id) ?? { branchName: "", branchCode: "" }) }))
      .sort((a: any, b: any) => (a.branchName || "").localeCompare(b.branchName || ""));

    // Map: itemId -> branchId -> { qty, price }
    const qtyMap = new Map<string, Map<string, { qty: number; price: number }>>();
    for (const o of data.orders) {
      for (const li of o.items) {
        if (!qtyMap.has(li.itemId)) qtyMap.set(li.itemId, new Map());
        const bm = qtyMap.get(li.itemId)!;
        const existing = bm.get(o.branchId) ?? { qty: 0, price: Number(li.unitPrice ?? 0) };
        existing.qty += li.quantity;
        existing.price = Number(li.unitPrice ?? 0);
        bm.set(o.branchId, existing);
      }
    }

    // Use allItems for stable ordering, but only keep items that were actually
    // ordered (totalQty > 0). Items nobody ordered must not appear with 0 values.
    const items = (allItems ?? [])
      .filter((it: any) => it.isActive)
      .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));

    const rows = items
      .map((it: any) => {
        const bm = qtyMap.get(it.id) ?? new Map();
        let totalQty = 0;
        let totalPrice = 0;
        const unitPrice = bm.values().next().value?.price ?? Number(it.price ?? 0);
        const branchQtys = branches.map((br: any) => {
          const entry = bm.get(br.id);
          const q = entry?.qty ?? 0;
          totalQty += q;
          totalPrice += q * unitPrice;
          return { branchId: br.id, qty: q, price: q * unitPrice };
        });
        return { itemId: it.id, name: it.name, unit: it.unit, threshold: it.threshold ?? 0, unitPrice, branchQtys, totalQty, totalPrice };
      })
      .filter((r) => r.totalQty > 0)
      .map((r, idx) => ({ idx: idx + 1, ...r }));

    return { branches, rows };
  })();

  // Date range label
  const dateLabel = (() => {
    if (month) {
      const [y, m] = month.split("-");
      return `${new Date(Number(y), Number(m) - 1).toLocaleString("default", { month: "long" })} ${y}`;
    }
    if (from && to) return `${new Date(from).toLocaleDateString()} – ${new Date(to).toLocaleDateString()}`;
    if (from) return `From ${new Date(from).toLocaleDateString()}`;
    if (to) return `Until ${new Date(to).toLocaleDateString()}`;
    return "All dates";
  })();

  const reportDate = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  const exportCsv = async () => {
    if (!pivotData) return;
    const wb = new ExcelJS.Workbook();
    wb.creator = "Ticket Rising";
    wb.created = new Date();
    const ws = wb.addWorksheet("Stationary Report", { views: [{ state: "frozen", xSplit: 4, ySplit: 1 }] });

    // Build columns
    ws.columns = [
      { header: "SI No.", key: "si", width: 8 },
      { header: "Description", key: "desc", width: 22 },
      { header: "UNIT", key: "unit", width: 10 },
      { header: "Threshold", key: "threshold", width: 10 },
      ...pivotData.branches.flatMap((b: any) => [
        { header: `${b.branchName}\nQty`, key: `qty_${b.id}`, width: 10 },
        { header: `${b.branchName}\nPrice`, key: `price_${b.id}`, width: 12 },
      ]),
      { header: "Total Qty", key: "totalQty", width: 10 },
      { header: "Total Price", key: "totalPrice", width: 14 },
    ];

    // Style header row
    ws.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF374151" } }; // gray-700
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = {
        bottom: { style: "medium", color: { argb: "FF000000" } },
      };
    });
    ws.getRow(1).height = 30;

    // Add data rows
    pivotData.rows.forEach((r, idx) => {
      const rowData: Record<string, any> = {
        si: r.idx,
        desc: r.name,
        unit: r.unit,
        threshold: r.threshold,
        totalQty: r.totalQty,
        totalPrice: r.totalPrice,
      };
      r.branchQtys.forEach((bq) => {
        // Branches that did not order this item get a blank cell (no 0 values)
        rowData[`qty_${bq.branchId}`] = bq.qty > 0 ? bq.qty : "";
        rowData[`price_${bq.branchId}`] = bq.price > 0 ? bq.price : "";
      });
      const row = ws.addRow(rowData);

      // Alternating row colors
      const bgColor = idx % 2 === 0 ? "FFFFFFFF" : "FFF9FAFB";
      row.eachCell((cell, colNumber) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = { bottom: { style: "thin", color: { argb: "FFE5E7EB" } } };
        cell.font = { size: 10 };
        // Bold total columns
        if (colNumber >= ws.columns.length - 1) {
          cell.font = { bold: true, size: 10 };
        }
      });
      // Left-align description
      row.getCell("desc").alignment = { horizontal: "left", vertical: "middle" };
    });

    // Totals row
    const totalsData: Record<string, any> = {
      si: "",
      desc: "",
      unit: "",
      threshold: "Total",
      totalQty: pivotData.rows.reduce((s, r) => s + r.totalQty, 0),
      totalPrice: pivotData.rows.reduce((s, r) => s + r.totalPrice, 0),
    };
    pivotData.branches.forEach((br: any) => {
      const branchQty = pivotData.rows.reduce((sum, r) => {
        const bq = r.branchQtys.find((b) => b.branchId === br.id);
        return sum + (bq?.qty ?? 0);
      }, 0);
      const branchPrice = pivotData.rows.reduce((sum, r) => {
        const bq = r.branchQtys.find((b) => b.branchId === br.id);
        return sum + (bq?.price ?? 0);
      }, 0);
      totalsData[`qty_${br.id}`] = branchQty;
      totalsData[`price_${br.id}`] = branchPrice > 0 ? branchPrice : "";
    });
    const totalsRow = ws.addRow(totalsData);
    totalsRow.eachCell((cell) => {
      cell.font = { bold: true, size: 11 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF97316" } }; // orange-500
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = { top: { style: "medium", color: { argb: "FF000000" } } };
    });
    totalsRow.height = 24;

    // Generate and download
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stationary-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportItemsSummary = async () => {
    if (!pivotData) return;
    const wb = new ExcelJS.Workbook();
    wb.creator = "Ticket Rising";
    wb.created = new Date();

    // Sheet 1: Items Summary (for bulk purchasing)
    const ws1 = wb.addWorksheet("Items Summary");
    ws1.columns = [
      { header: "SI No.", key: "si", width: 8 },
      { header: "Item Name", key: "name", width: 25 },
      { header: "Unit", key: "unit", width: 10 },
      { header: "Unit Price (₹)", key: "price", width: 14 },
      { header: "Threshold", key: "threshold", width: 10 },
      { header: "Total Qty Ordered", key: "totalQty", width: 16 },
      { header: "Total Amount (₹)", key: "totalPrice", width: 16 },
    ];

    // Style header
    ws1.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } }; // blue-700
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = { bottom: { style: "medium", color: { argb: "FF000000" } } };
    });
    ws1.getRow(1).height = 28;

    // Add item rows (only items with qty > 0)
    const itemsWithData = pivotData.rows.filter((r) => r.totalQty > 0);
    itemsWithData.forEach((r, idx) => {
      const row = ws1.addRow({
        si: idx + 1,
        name: r.name,
        unit: r.unit,
        price: r.unitPrice,
        threshold: r.threshold,
        totalQty: r.totalQty,
        totalPrice: r.totalPrice,
      });
      const bgColor = idx % 2 === 0 ? "FFFFFFFF" : "FFEFF6FF";
      row.eachCell((cell, colNumber) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = { bottom: { style: "thin", color: { argb: "FFE5E7EB" } } };
        cell.font = { size: 10 };
        if (colNumber === 2) cell.alignment = { horizontal: "left", vertical: "middle" };
        if (colNumber >= 6) cell.font = { bold: true, size: 10 };
      });
    });

    // Totals row
    const totalQty = itemsWithData.reduce((s, r) => s + r.totalQty, 0);
    const totalPrice = itemsWithData.reduce((s, r) => s + r.totalPrice, 0);
    const totalsRow = ws1.addRow({
      si: "", name: "", unit: "", price: "", threshold: "TOTAL",
      totalQty, totalPrice,
    });
    totalsRow.eachCell((cell) => {
      cell.font = { bold: true, size: 11 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF97316" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = { top: { style: "medium", color: { argb: "FF000000" } } };
    });

    // Sheet 2: Branch-wise Orders
    const ws2 = wb.addWorksheet("Branch-wise Orders");
    ws2.columns = [
      { header: "Branch Name", key: "branchName", width: 25 },
      { header: "Branch Code", key: "branchCode", width: 14 },
      ...itemsWithData.map((r) => ({ header: r.name, key: `item_${r.itemId}`, width: 14 })),
      { header: "Total Qty", key: "totalQty", width: 12 },
      { header: "Total Amount (₹)", key: "totalPrice", width: 14 },
    ];

    // Style header
    ws2.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = { bottom: { style: "medium", color: { argb: "FF000000" } } };
    });
    ws2.getRow(1).height = 32;

    // Add branch rows
    pivotData.branches.forEach((br: any, idx: number) => {
      let branchTotalQty = 0;
      let branchTotalPrice = 0;
      const rowData: Record<string, any> = {
        branchName: br.branchName,
        branchCode: br.branchCode,
      };
      itemsWithData.forEach((r) => {
        const bq = r.branchQtys.find((b) => b.branchId === br.id);
        const q = bq?.qty ?? 0;
        const p = q * r.unitPrice;
        rowData[`item_${r.itemId}`] = q > 0 ? q : "";
        branchTotalQty += q;
        branchTotalPrice += p;
      });
      rowData.totalQty = branchTotalQty;
      rowData.totalPrice = branchTotalPrice;
      const row = ws2.addRow(rowData);
      const bgColor = idx % 2 === 0 ? "FFFFFFFF" : "FFEFF6FF";
      row.eachCell((cell, colNumber) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = { bottom: { style: "thin", color: { argb: "FFE5E7EB" } } };
        cell.font = { size: 10 };
        if (colNumber <= 2) cell.alignment = { horizontal: "left", vertical: "middle" };
        if (colNumber >= ws2.columns.length - 1) cell.font = { bold: true, size: 10 };
      });
    });

    // Branch totals row
    const branchTotals: Record<string, any> = { branchName: "", branchCode: "TOTAL" };
    let grandTotalQty = 0;
    let grandTotalPrice = 0;
    itemsWithData.forEach((r) => {
      branchTotals[`item_${r.itemId}`] = r.totalQty;
      grandTotalQty += r.totalQty;
      grandTotalPrice += r.totalPrice;
    });
    branchTotals.totalQty = grandTotalQty;
    branchTotals.totalPrice = grandTotalPrice;
    const branchTotalsRow = ws2.addRow(branchTotals);
    branchTotalsRow.eachCell((cell) => {
      cell.font = { bold: true, size: 11 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF97316" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = { top: { style: "medium", color: { argb: "FF000000" } } };
    });

    // Generate and download
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stationary-items-summary-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tableRef = useRef<HTMLDivElement>(null);

  const printReport = () => {
    const el = tableRef.current;
    if (!el) return;
    const html = el.innerHTML;
    const printWin = window.open("", "_blank", "width=1200,height=800");
    if (!printWin) return;
    printWin.document.write(`<!DOCTYPE html><html><head><title>Stationary Report</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 10px; font-size: 11px; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: center; font-size: 11px; }
        th { background: #1f2937; color: white; font-weight: 600; }
        .bg-amber-50 { background: #fef3c7; }
        .bg-amber-100 { background: #fde68a; }
        .text-green-600 { color: #16a34a; }
        .text-green-700 { color: #15803d; }
        .text-gray-400 { color: #9ca3af; }
        .font-bold { font-weight: 700; }
        .text-left { text-align: left; }
        @media print { @page { size: landscape; margin: 10mm; } }
      </style></head><body>${html}</body></html>`);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => { printWin.print(); printWin.close(); }, 300);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4 no-print">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">From date</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">To date</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Month</label>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
          </div>
          <button onClick={() => refetch()} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">Generate</button>
          {pivotData && (
            <>
              <button onClick={() => exportCsv()} className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"><Download className="w-4 h-4" /> Export Excel</button>
              <button onClick={() => exportItemsSummary()} className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"><Download className="w-4 h-4" /> Items Summary</button>
              <button onClick={printReport} className="flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"><Printer className="w-4 h-4" /> Print</button>
            </>
          )}
        </div>
      </div>

      {isLoading && <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>}

      {pivotData && (
        <div ref={tableRef} className="bg-white rounded-xl border border-gray-200 overflow-hidden print:border-0 print:shadow-none">
          {/* Report header */}
          <div className="px-5 py-4 border-b border-gray-200 print:py-2">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-bold text-gray-800">Stationary Requirement Report</h3>
                <p className="text-xs text-gray-500 mt-1">Period: {dateLabel}</p>
              </div>
              <div className="text-right text-xs text-gray-500">
                <p>Generated: {reportDate}</p>
                <p>Branches: {pivotData.branches.length} · Items: {pivotData.rows.length}</p>
              </div>
            </div>
          </div>

          {/* Pivot table */}
          {pivotData.branches.length > 4 && (
            <div className="flex items-center gap-1 text-xs text-gray-400 px-1">
              <span>Scroll → to see all branches</span>
              <svg className="w-4 h-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-xs border-collapse" style={{ minWidth: `${180 + pivotData.branches.length * 80 + 160}px` }}>
              <thead>
                <tr className="bg-gray-800 text-white">
                  <th className="py-2 px-2 font-semibold text-center border border-gray-700 sticky left-0 bg-gray-800 z-10 w-10">SI No.</th>
                  <th className="py-2 px-2 font-semibold text-left border border-gray-700 sticky left-10 bg-gray-800 z-10 min-w-[140px]">Description</th>
                  <th className="py-2 px-2 font-semibold text-center border border-gray-700 sticky left-[calc(2.5rem+140px)] bg-gray-800 z-10 w-16">UNIT</th>
                  <th className="py-2 px-2 font-semibold text-center border border-gray-700 sticky left-[calc(2.5rem+140px+4rem)] bg-gray-800 z-10 w-16">Threshold</th>
                  {pivotData.branches.map((b: any) => (
                    <th key={b.id} className="py-2 px-2 font-semibold text-center border border-gray-700 min-w-[80px]">
                      <div>{b.branchName}</div>
                      <div className="text-[10px] font-normal opacity-70">Qty | ₹ Price</div>
                    </th>
                  ))}
                  <th className="py-2 px-2 font-semibold text-center border border-gray-700 bg-amber-500 min-w-[70px]">Total Qty</th>
                  <th className="py-2 px-2 font-semibold text-center border border-gray-700 bg-amber-500 min-w-[90px]">Total Price ₹</th>
                </tr>
              </thead>
              <tbody>
                {pivotData.rows.length === 0 ? (
                  <tr><td colSpan={6 + pivotData.branches.length} className="py-8 text-center text-gray-400">No data for this period.</td></tr>
                ) : pivotData.rows.map((r, rowIdx) => (
                  <tr key={r.itemId} className={`hover:bg-gray-50 print:hover:bg-transparent ${rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                    <td className="py-1.5 px-2 text-center border border-gray-200 text-gray-500 sticky left-0 bg-inherit z-10">{r.idx}</td>
                    <td className="py-1.5 px-2 border border-gray-200 font-medium text-gray-800 sticky left-10 bg-inherit z-10">{r.name}</td>
                    <td className="py-1.5 px-2 text-center border border-gray-200 text-gray-600 sticky left-[calc(2.5rem+140px)] bg-inherit z-10">{r.unit}</td>
                    <td className="py-1.5 px-2 text-center border border-gray-200 font-semibold text-gray-700 sticky left-[calc(2.5rem+140px+4rem)] bg-inherit z-10">{r.threshold}</td>
                    {r.branchQtys.map((bq) => (
                      <td key={bq.branchId} className="py-1.5 px-2 text-center border border-gray-200">
                        {bq.qty > 0 ? (
                          <>
                            <div className="font-medium text-gray-800">{bq.qty}</div>
                            {bq.price > 0 && <div className="text-[10px] text-green-600">₹{bq.price}</div>}
                          </>
                        ) : (
                          <div className="text-gray-300">–</div>
                        )}
                      </td>
                    ))}
                    <td className="py-1.5 px-2 text-center border border-gray-200 font-bold text-gray-900 bg-amber-50 print:bg-amber-50">{r.totalQty}</td>
                    <td className="py-1.5 px-2 text-center border border-gray-200 font-bold text-green-700 bg-amber-50 print:bg-amber-50">₹{r.totalPrice}</td>
                  </tr>
                ))}
              </tbody>
              {/* Totals row */}
              {pivotData.rows.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-100 font-bold text-gray-800">
                    <td colSpan={4} className="py-2 px-2 border border-gray-300 text-right sticky left-0 bg-gray-100 z-10" style={{ minWidth: `${2.5 + 14 + 4 + 4}rem` }}>Total</td>
                    {pivotData.branches.map((br: any) => {
                      const branchQty = pivotData.rows.reduce((sum, r) => {
                        const bq = r.branchQtys.find((b) => b.branchId === br.id);
                        return sum + (bq?.qty ?? 0);
                      }, 0);
                      const branchPrice = pivotData.rows.reduce((sum, r) => {
                        const bq = r.branchQtys.find((b) => b.branchId === br.id);
                        return sum + (bq?.price ?? 0);
                      }, 0);
                      return (
                        <td key={br.id} className="py-2 px-2 text-center border border-gray-300">
                          <div>{branchQty}</div>
                          {branchPrice > 0 && <div className="text-[10px] font-normal text-green-600">₹{branchPrice}</div>}
                        </td>
                      );
                    })}
                    <td className="py-2 px-2 text-center border border-gray-300 bg-amber-100">{pivotData.rows.reduce((s, r) => s + r.totalQty, 0)}</td>
                    <td className="py-2 px-2 text-center border border-gray-300 bg-amber-100 text-green-700">₹{pivotData.rows.reduce((s, r) => s + r.totalPrice, 0)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
