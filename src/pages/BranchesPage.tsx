import { useState, useMemo } from "react";
import { trpc } from "@/providers/trpc";
import { useBranchRoles } from "@/hooks/useBranchRoles";
import {
  Plus, Pencil, Trash2, X, Loader2, Save, Users, Building2, KeyRound, Power, UserPlus,
} from "lucide-react";

export default function BranchesPage() {
  const utils = trpc.useUtils();
  const { getColor } = useBranchRoles();
  const { data, isLoading } = trpc.branch.list.useQuery({ page: 1, limit: 100 });
  const createBranch = trpc.branch.create.useMutation({ onSuccess: () => { utils.branch.list.invalidate(); utils.branch.listAll.invalidate(); close(); } });
  const updateBranch = trpc.branch.update.useMutation({ onSuccess: () => { utils.branch.list.invalidate(); utils.branch.listAll.invalidate(); close(); } });
  const deleteBranch = trpc.branch.delete.useMutation({ onSuccess: () => { utils.branch.list.invalidate(); utils.branch.listAll.invalidate(); } });

  // All branch users, grouped by branch for inline display
  const { data: userData } = trpc.branchUser.list.useQuery({ page: 1, limit: 10000, status: "all" });
  const usersByBranch = useMemo(() => {
    const map: Record<string, NonNullable<typeof userData>["items"]> = {};
    userData?.items.forEach((u) => {
      if (!u.branchId) return;
      (map[u.branchId] ??= []).push(u);
    });
    return map;
  }, [userData]);

  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", code: "", contactPerson: "", address: "" });

  const open = (b?: any) => {
    if (b) {
      setEditing(b.id);
      setForm({ name: b.name, code: b.code, contactPerson: b.contactPerson || "", address: b.address || "" });
    } else {
      setEditing(null);
      setForm({ name: "", code: "", contactPerson: "", address: "" });
    }
    setShow(true);
  };
  const close = () => setShow(false);

  const save = () => {
    const payload = { name: form.name, code: form.code, contactPerson: form.contactPerson || undefined, address: form.address || undefined };
    if (editing) updateBranch.mutate({ id: editing, ...payload });
    else createBranch.mutate(payload);
  };

  // ---- User management (inline) ----
  const [userModal, setUserModal] = useState<{ branchId: string; editingId: string | null } | null>(null);
  const [userForm, setUserForm] = useState({
    branchId: "", contactPerson: "", email: "", mobile: "", address: "", username: "", password: "", isActive: true,
  });
  const [userErrors, setUserErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState<string | null>(null);

  const createUser = trpc.branchUser.create.useMutation({
    onSuccess: () => { closeUser(); utils.branchUser.list.invalidate(); },
    onError: (e) => setUserErrors({ form: e.message }),
  });
  const updateUser = trpc.branchUser.update.useMutation({
    onSuccess: () => { closeUser(); utils.branchUser.list.invalidate(); },
    onError: (e) => setUserErrors({ form: e.message }),
  });
  const toggleStatus = trpc.branchUser.toggleStatus.useMutation({ onSuccess: () => utils.branchUser.list.invalidate() });
  const resetPassword = trpc.branchUser.resetPassword.useMutation({
    onSuccess: (data) => { setShowPassword(data.password); utils.branchUser.list.invalidate(); },
  });
  const deleteUser = trpc.branchUser.delete.useMutation({
    onSuccess: () => utils.branchUser.list.invalidate(),
    onError: (e) => alert(e.message),
  });

  const closeUser = () => {
    setUserModal(null);
    setUserForm({ branchId: "", contactPerson: "", email: "", mobile: "", address: "", username: "", password: "", isActive: true });
    setUserErrors({});
  };

  const openCreateUser = (branchId: string) => {
    setUserForm({ branchId, contactPerson: "", email: "", mobile: "", address: "", username: "", password: "", isActive: true });
    setUserModal({ branchId, editingId: null });
  };

  const openEditUser = (u: NonNullable<typeof userData>["items"][0]) => {
    setUserForm({
      branchId: u.branchId ?? "",
      contactPerson: u.contactPerson ?? "",
      email: u.email ?? "",
      mobile: u.mobile || "",
      address: u.address || "",
      username: "",
      password: "",
      isActive: !!u.isActive,
    });
    setUserModal({ branchId: u.branchId ?? "", editingId: u.id });
  };

  const handleUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!userForm.branchId) errors.branchId = "Select a branch";
    if (!userForm.contactPerson) errors.contactPerson = "Required";
    if (!userForm.email) errors.email = "Required";
    if (!userModal?.editingId && !userForm.username) errors.username = "Required";
    if (!userModal?.editingId && !userForm.password) errors.password = "Required";
    if (Object.keys(errors).length > 0) { setUserErrors(errors); return; }

    if (userModal?.editingId) {
      updateUser.mutate({
        id: userModal.editingId, branchId: userForm.branchId, contactPerson: userForm.contactPerson,
        email: userForm.email, mobile: userForm.mobile, address: userForm.address, isActive: userForm.isActive,
      });
    } else {
      createUser.mutate({
        branchId: userForm.branchId, contactPerson: userForm.contactPerson, email: userForm.email,
        mobile: userForm.mobile, address: userForm.address, username: userForm.username,
        password: userForm.password, isActive: userForm.isActive,
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Branches</h1>
          <p className="text-sm text-gray-500 mt-1">Add branches and manage their users inline.</p>
        </div>
        <button onClick={() => open()} className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700"><Plus className="w-3 h-3" /> Add Branch</button>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-gray-400 text-sm bg-white rounded-xl border border-gray-200">Loading…</div>
      ) : data?.items.length === 0 ? (
        <div className="p-12 text-center text-gray-400 text-sm bg-white rounded-xl border border-gray-200">No branches yet. Click "Add Branch" to create one.</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {data?.items.map((b) => {
            const branchUsers = usersByBranch[b.id] || [];
            return (
              <div key={b.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-gray-200 flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 flex items-center gap-2"><Building2 className="w-4 h-4 text-gray-400 shrink-0" />{b.name}</p>
                    <p className="text-xs text-gray-500 font-mono">{b.code}{b.contactPerson ? ` · ${b.contactPerson}` : ""}{b.address ? ` · ${b.address}` : ""}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => open(b)} className="p-1.5 hover:bg-blue-50 rounded-lg text-gray-400 hover:text-blue-600"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => { if (confirm(`Delete branch "${b.name}"?`)) deleteBranch.mutate({ id: b.id }); }} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50/50">
                    <p className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Users ({branchUsers.length})</p>
                    <button onClick={() => openCreateUser(b.id)} className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg"><UserPlus className="w-3.5 h-3.5" /> Add User</button>
                  </div>
                  {branchUsers.length === 0 ? (
                    <div className="px-4 py-6 text-center text-gray-400 text-sm">No users in this branch yet.</div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {branchUsers.map((u) => (
                        <div key={u.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${u.isActive ? "bg-green-500" : "bg-gray-300"}`} />
                            <div className="min-w-0">
                              <p className="text-sm text-gray-800 truncate">{u.contactPerson} <span className="text-gray-400 text-xs">({u.username})</span></p>
                              <p className="text-xs text-gray-500 truncate">{u.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            {u.branchRole && <span className="px-2 py-0.5 rounded-full text-xs font-medium mr-1" style={{ backgroundColor: `${getColor(u.branchRole)}1A`, color: getColor(u.branchRole) }}>{u.branchRole}</span>}
                            <button onClick={() => openEditUser(u)} className="p-1.5 hover:bg-blue-50 rounded-lg text-gray-400 hover:text-blue-600 transition-colors" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                            <button onClick={() => resetPassword.mutate({ id: u.id })} className="p-1.5 hover:bg-amber-50 rounded-lg text-gray-400 hover:text-amber-600 transition-colors" title="Reset Password"><KeyRound className="w-3.5 h-3.5" /></button>
                            <button onClick={() => toggleStatus.mutate({ id: u.id })} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors" title={u.isActive ? "Deactivate" : "Activate"}><Power className="w-3.5 h-3.5" /></button>
                            <button onClick={() => { if (confirm(`Delete user "${u.contactPerson}"? This will also remove their auth account.`)) deleteUser.mutate({ id: u.id }); }} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Branch Modal */}
      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={close} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">{editing ? "Edit Branch" : "Add Branch"}</h3>
              <button onClick={close} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
            </div>
            <div className="space-y-3">
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Branch name (e.g. Nittur)" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
              <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="Branch code (e.g. NIT)" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
              <input value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} placeholder="Contact person" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
              <textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Address" rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none resize-none" />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={close} className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={save} disabled={createBranch.isPending || updateBranch.isPending} className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
                {(createBranch.isPending || updateBranch.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Branch User Modal */}
      {userModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closeUser} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800">{userModal.editingId ? "Edit Branch User" : "Add Branch User"}</h2>
              <button onClick={closeUser} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <form onSubmit={handleUserSubmit} className="p-5 space-y-4">
              {userErrors.form && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{userErrors.form}</p>}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Branch *</label>
                <select value={userForm.branchId} onChange={e => setUserForm({ ...userForm, branchId: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none bg-white">
                  <option value="">— Select Branch —</option>
                  {data?.items.map(b => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
                </select>
                {userErrors.branchId && <p className="text-[10px] text-red-500 mt-1">{userErrors.branchId}</p>}
              </div>
              <div><label className="block text-xs font-medium text-gray-700 mb-1">Contact Person *</label><input value={userForm.contactPerson} onChange={e => setUserForm({ ...userForm, contactPerson: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
                {userErrors.contactPerson && <p className="text-[10px] text-red-500 mt-1">{userErrors.contactPerson}</p>}</div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-gray-700 mb-1">Email *</label><input type="email" value={userForm.email} onChange={e => setUserForm({ ...userForm, email: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
                  {userErrors.email && <p className="text-[10px] text-red-500 mt-1">{userErrors.email}</p>}</div>
                <div><label className="block text-xs font-medium text-gray-700 mb-1">Mobile</label><input value={userForm.mobile} onChange={e => setUserForm({ ...userForm, mobile: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" /></div>
              </div>
              <div><label className="block text-xs font-medium text-gray-700 mb-1">Address</label><textarea value={userForm.address} onChange={e => setUserForm({ ...userForm, address: e.target.value })} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none resize-none" /></div>
              {!userModal.editingId && (
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-gray-700 mb-1">Username *</label><input value={userForm.username} onChange={e => setUserForm({ ...userForm, username: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
                    {userErrors.username && <p className="text-[10px] text-red-500 mt-1">{userErrors.username}</p>}</div>
                  <div><label className="block text-xs font-medium text-gray-700 mb-1">Password *</label><input type="text" value={userForm.password} onChange={e => setUserForm({ ...userForm, password: e.target.value })} placeholder="Min 6 characters" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
                    {userErrors.password && <p className="text-[10px] text-red-500 mt-1">{userErrors.password}</p>}</div>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={userForm.isActive} onChange={e => setUserForm({ ...userForm, isActive: e.target.checked })} className="rounded border-gray-300" />
                Active account
              </label>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeUser} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={createUser.isPending || updateUser.isPending} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
                  {(createUser.isPending || updateUser.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : (userModal.editingId ? "Update" : "Create")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Modal */}
      {showPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowPassword(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Password Reset</h3>
            <p className="text-sm text-gray-500 mb-3">New password generated:</p>
            <div className="bg-gray-100 rounded-lg p-3 flex items-center justify-between">
              <code className="text-lg font-mono text-gray-800">{showPassword}</code>
              <button onClick={() => navigator.clipboard.writeText(showPassword)} className="text-xs text-red-600 hover:text-red-700 font-medium">Copy</button>
            </div>
            <p className="text-xs text-amber-600 mt-3">Please share this password securely with the branch user.</p>
            <button onClick={() => setShowPassword(null)} className="w-full mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
