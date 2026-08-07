import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Plus, Pencil, Trash2, X, Save, Loader2, Building2, Users, Search, UserPlus, UserCog, Check, XCircle, Copy, CheckCheck, KeyRound } from "lucide-react";

type Tab = "clusters" | "users" | "branches";

export default function ClusterManagement() {
  const [tab, setTab] = useState<Tab>("clusters");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Cluster Management</h1>
          <p className="text-sm text-gray-500 mt-1">Manage clusters, cluster admins, and branch assignments</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { key: "clusters" as Tab, label: "Clusters", icon: Building2 },
          { key: "users" as Tab, label: "Cluster Users", icon: UserCog },
          { key: "branches" as Tab, label: "Branch Assignments", icon: Users },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-red-600 text-red-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "clusters" && <ClustersTab />}
      {tab === "users" && <ClusterUsersTab />}
      {tab === "branches" && <BranchAssignmentsTab />}
    </div>
  );
}

/* ───── Clusters Tab ───── */
function ClustersTab() {
  const utils = trpc.useUtils();
  const { data: clusters, isLoading } = trpc.cluster.list.useQuery();
  const createCluster = trpc.cluster.create.useMutation({ onSuccess: () => { utils.cluster.list.invalidate(); closeForm(); } });
  const updateCluster = trpc.cluster.update.useMutation({ onSuccess: () => { utils.cluster.list.invalidate(); closeForm(); } });
  const deleteCluster = trpc.cluster.delete.useMutation({ onSuccess: () => utils.cluster.list.invalidate() });

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", code: "" });
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);

  const { data: clusterBranches } = trpc.cluster.branches.useQuery(
    { clusterId: selectedCluster! },
    { enabled: !!selectedCluster }
  );

  const openForm = (c?: any) => {
    if (c) { setEditing(c.id); setForm({ name: c.name, code: c.code }); }
    else { setEditing(null); setForm({ name: "", code: "" }); }
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditing(null); setForm({ name: "", code: "" }); };
  const saveCluster = () => {
    if (editing) updateCluster.mutate({ id: editing, ...form });
    else createCluster.mutate(form);
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-red-600" /></div>;

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{clusters?.length ?? 0} clusters</p>
        <button onClick={() => openForm()} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
          <Plus className="w-4 h-4" /> Add Cluster
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 space-y-2">
          {(!clusters || clusters.length === 0) ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">No clusters yet</div>
          ) : clusters.map((c: any) => (
            <div
              key={c.id}
              onClick={() => setSelectedCluster(c.id)}
              className={`bg-white rounded-xl border p-4 cursor-pointer transition-all ${selectedCluster === c.id ? "border-red-600 ring-1 ring-red-600" : "border-gray-200 hover:border-gray-300"}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center"><Building2 className="w-5 h-5 text-red-600" /></div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{c.name}</p>
                    <p className="text-xs text-gray-500">{c.code} {!c.isActive && <span className="text-red-500">(inactive)</span>}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={(e) => { e.stopPropagation(); openForm(c); }} className="p-1.5 hover:bg-blue-50 rounded-lg text-gray-400 hover:text-blue-600"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={(e) => { e.stopPropagation(); if (confirm("Delete this cluster?")) deleteCluster.mutate({ id: c.id }); }} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="lg:col-span-2">
          {selectedCluster ? (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-800 flex items-center gap-2"><Users className="w-4 h-4" /> Branches in this cluster</h3>
                <AssignBranchModalButton clusterId={selectedCluster} onAssigned={() => { utils.cluster.branches.invalidate(); utils.cluster.availableBranchUsers.invalidate(); }} />
              </div>
              {clusterBranches?.length === 0 ? (
                <div className="py-8 text-center text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-lg">No branches assigned</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {clusterBranches?.map((b: any) => (
                    <div key={b.id} className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{b.branchName || b.name}</p>
                        <p className="text-xs text-gray-500">{b.branchCode} {!b.isActive && <span className="text-red-500">(inactive)</span>}</p>
                      </div>
                      <button
                        onClick={() => {
                          if (confirm(`Remove ${b.branchName || b.name} from this cluster?`))
                            trpc.cluster.unassignBranches.useMutation({ onSuccess: () => utils.cluster.branches.invalidate() }).mutate({ branchIds: [b.id] });
                        }}
                        className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
              <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">Select a cluster to view its branches</p>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Cluster Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closeForm} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">{editing ? "Edit Cluster" : "Add Cluster"}</h3>
              <button onClick={closeForm} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
            </div>
            <div className="space-y-3">
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Cluster name (e.g. North Zone)" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
              <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="Cluster code (e.g. NORTH)" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={closeForm} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={saveCluster} disabled={createCluster.isPending || updateCluster.isPending || !form.name || !form.code} className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
                {(createCluster.isPending || updateCluster.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ───── Cluster Users Tab ───── */
function ClusterUsersTab() {
  const utils = trpc.useUtils();
  const { data: users, isLoading } = trpc.cluster.listUsers.useQuery();
  const { data: clusters } = trpc.cluster.list.useQuery();
  const createUser = trpc.cluster.createUser.useMutation({ onSuccess: () => { utils.cluster.listUsers.invalidate(); } });
  const updateUser = trpc.cluster.updateUser.useMutation({ onSuccess: () => utils.cluster.listUsers.invalidate() });
  const deleteUser = trpc.cluster.deleteUser.useMutation({ onSuccess: () => utils.cluster.listUsers.invalidate() });
  const resetPassword = trpc.cluster.resetPassword.useMutation({
    onSuccess: (data) => { setShowResetPassword(data.password); utils.cluster.listUsers.invalidate(); },
  });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: "", name: "", email: "", clusterId: "" });
  const [createdUser, setCreatedUser] = useState<any>(null);
  const [showResetPassword, setShowResetPassword] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const resetForm = () => setForm({ username: "", name: "", email: "", clusterId: "" });

  const handleCreate = () => {
    setErrorMsg("");
    createUser.mutate(form, {
      onSuccess: (data) => {
        setCreatedUser(data);
        resetForm();
      },
      onError: (err) => {
        setErrorMsg(err.message);
      },
    });
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-red-600" /></div>;

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{users?.length ?? 0} cluster users</p>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">
          <UserPlus className="w-4 h-4" /> Add Cluster User
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {(!users || users.length === 0) ? (
          <div className="p-12 text-center text-gray-400 text-sm">No cluster users yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500 uppercase">
                  <th className="px-4 py-3 font-medium">Username</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Cluster</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u: any) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{u.username}</td>
                    <td className="px-4 py-3 text-gray-700">{u.name}</td>
                    <td className="px-4 py-3 text-gray-500">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 rounded-full text-xs font-medium">
                        {u.clusterName || u.clusterCode || u.clusterId?.slice(0, 8)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.isActive ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full"><Check className="w-3 h-3" /> Active</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" /> Inactive</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => updateUser.mutate({ id: u.id, isActive: !u.isActive })}
                          className={`p-1.5 rounded-lg text-xs ${u.isActive ? "text-red-600 hover:bg-red-50" : "text-green-600 hover:bg-green-50"}`}
                          title={u.isActive ? "Deactivate" : "Activate"}
                        >
                          {u.isActive ? <XCircle className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => resetPassword.mutate({ id: u.id })} className="p-1.5 hover:bg-amber-50 rounded-lg text-gray-400 hover:text-amber-600 transition-colors" title="Reset Password"><KeyRound className="w-3.5 h-3.5" /></button>
                        <button onClick={() => { if (confirm(`Delete user "${u.username}"? This will also remove their auth account.`)) deleteUser.mutate({ id: u.id }); }} className="p-1.5 hover:bg-red-50 rounded-lg text-red-600 hover:text-red-700" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Cluster User Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setShowForm(false); setCreatedUser(null); resetForm(); }} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">Add Cluster User</h3>
              <button onClick={() => { setShowForm(false); setCreatedUser(null); resetForm(); }} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
            </div>

            {createdUser ? (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
                  <p className="font-medium mb-2">Cluster user created successfully!</p>
                  <p className="text-xs text-green-600 mb-3">Save these credentials. The password will not be shown again.</p>
                  <div className="bg-white rounded border border-green-200 p-3 space-y-2 text-xs font-mono">
                    <div className="flex items-center justify-between">
                      <div><span className="text-gray-500">Username:</span> {createdUser.username}</div>
                      <button onClick={() => copyToClipboard(createdUser.username, "username")} className="p-1 hover:bg-gray-100 rounded" title="Copy username">
                        {copiedField === "username" ? <CheckCheck className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div><span className="text-gray-500">Password:</span> <strong>{createdUser.password}</strong></div>
                      <button onClick={() => copyToClipboard(createdUser.password, "password")} className="p-1 hover:bg-gray-100 rounded" title="Copy password">
                        {copiedField === "password" ? <CheckCheck className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
                      </button>
                    </div>
                  </div>
                </div>
                <button onClick={() => { setShowForm(false); setCreatedUser(null); resetForm(); }} className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">Done</button>
              </div>
            ) : (
              <div className="space-y-3">
                {errorMsg && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{errorMsg}</div>
                )}
                <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="Username *" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
                <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Email address" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
                <p className="text-xs text-gray-400">Password will be auto-generated and shown once after creation.</p>
                <select value={form.clusterId} onChange={e => setForm({ ...form, clusterId: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none">
                  <option value="">Select cluster *</option>
                  {clusters?.filter((c: any) => c.isActive).map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                  ))}
                </select>
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => { setShowForm(false); setCreatedUser(null); resetForm(); }} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
                  <button onClick={handleCreate} disabled={createUser.isPending || !form.username || !form.name || !form.email || !form.clusterId} className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
                    {createUser.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Create User
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowResetPassword(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Password Reset</h3>
            <p className="text-sm text-gray-500 mb-3">New password generated:</p>
            <div className="bg-gray-100 rounded-lg p-3 flex items-center justify-between">
              <code className="text-lg font-mono text-gray-800">{showResetPassword}</code>
              <button onClick={() => navigator.clipboard.writeText(showResetPassword)} className="text-xs text-red-600 hover:text-red-700 font-medium">Copy</button>
            </div>
            <p className="text-xs text-amber-600 mt-3">Please share this password securely with the cluster user.</p>
            <button onClick={() => setShowResetPassword(null)} className="w-full mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">Close</button>
          </div>
        </div>
      )}
    </>
  );
}

/* ───── Branch Assignments Tab ───── */
function BranchAssignmentsTab() {
  const utils = trpc.useUtils();
  const { data: branches, isLoading } = trpc.cluster.allBranchUsers.useQuery();
  const { data: clusters } = trpc.cluster.list.useQuery();
  const unassignBranches = trpc.cluster.unassignBranches.useMutation({ onSuccess: () => { utils.cluster.allBranchUsers.invalidate(); utils.cluster.branches.invalidate(); utils.cluster.availableBranchUsers.invalidate(); } });

  const [filterCluster, setFilterCluster] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = (branches ?? []).filter((b: any) => {
    if (filterCluster === "unassigned" && b.clusterId) return false;
    if (filterCluster === "assigned" && !b.clusterId) return false;
    if (filterCluster !== "all" && filterCluster !== "unassigned" && filterCluster !== "assigned" && b.clusterId !== filterCluster) return false;
    if (search && !`${b.branchName} ${b.branchCode} ${b.email ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-red-600" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search branches..." className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
        </div>
        <select value={filterCluster} onChange={e => setFilterCluster(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none">
          <option value="all">All branches</option>
          <option value="unassigned">Unassigned</option>
          <option value="assigned">Assigned</option>
          {clusters?.filter((c: any) => c.isActive).map((c: any) => (
            <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
          ))}
        </select>
        <p className="text-sm text-gray-500">{filtered.length} branches</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-visible">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">No branches match your filters</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((b: any) => (
              <div key={b.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                <div>
                  <p className="text-sm font-medium text-gray-800">{b.branchName || b.name}</p>
                  <p className="text-xs text-gray-500">{b.branchCode} · {b.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {b.clusterId ? (
                    <>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 rounded-full text-xs font-medium">
                        {b.clusterName || b.clusterId?.slice(0, 8)}
                      </span>
                      <button
                        onClick={() => { if (confirm(`Unassign ${b.branchName} from ${b.clusterName}?`)) unassignBranches.mutate({ branchIds: [b.id] }); }}
                        className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        Unassign
                      </button>
                    </>
                  ) : (
                    <AssignSingleBranchMenu branchId={b.id} branchName={b.branchName || b.name} clusters={clusters?.filter((c: any) => c.isActive) ?? []} onAssigned={() => { utils.cluster.allBranchUsers.invalidate(); }} />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ───── Assign Branch Modal (single) ───── */
function AssignSingleBranchMenu({ branchId, clusters, onAssigned }: { branchId: string; branchName: string; clusters: any[]; onAssigned: () => void }) {
  const assignBranches = trpc.cluster.assignBranches.useMutation({ onSuccess: onAssigned });
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-lg">
        Assign
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-xl p-2 min-w-[200px]">
            {clusters.length === 0 ? (
              <p className="px-2 py-1 text-xs text-gray-400">No clusters available</p>
            ) : clusters.map((c: any) => (
              <button
                key={c.id}
                onClick={() => {
                  assignBranches.mutate({ clusterId: c.id, branchIds: [branchId] });
                  setOpen(false);
                }}
                className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg"
              >
                {c.name} ({c.code})
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ───── Assign Branch Modal (multi, from Clusters tab) ───── */
function AssignBranchModalButton({ clusterId, onAssigned }: { clusterId: string; onAssigned: () => void }) {
  const { data: availableUsers } = trpc.cluster.availableBranchUsers.useQuery();
  const assignBranches = trpc.cluster.assignBranches.useMutation({ onSuccess: onAssigned });
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const handleAssign = () => {
    const ids = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
    if (ids.length === 0) return;
    assignBranches.mutate({ clusterId, branchIds: ids });
    setOpen(false);
    setSelected({});
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700">
        <Plus className="w-3 h-3" /> Assign Branches
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg p-5 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">Assign Branches</h3>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
            </div>
            <div className="flex-1 overflow-auto space-y-1">
              {(!availableUsers || availableUsers.length === 0) ? (
                <div className="py-8 text-center text-gray-400 text-sm">No unassigned branches available</div>
              ) : availableUsers.map((b: any) => (
                <label key={b.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-lg cursor-pointer">
                  <input type="checkbox" checked={!!selected[b.id]} onChange={() => setSelected({ ...selected, [b.id]: !selected[b.id] })} className="text-red-600 rounded" />
                  <div>
                    <p className="text-sm text-gray-800">{b.branchName || b.name}</p>
                    <p className="text-xs text-gray-500">{b.branchCode}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-gray-100 mt-3">
              <button onClick={() => { setSelected({}); setOpen(false); }} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
              <button onClick={handleAssign} disabled={!Object.values(selected).some(Boolean)} className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">Assign Selected</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
