import { useState } from "react";
import { trpc } from "@/providers/trpc";
import {
  Plus, Pencil, Trash2, X, Loader2, ToggleLeft, ToggleRight, KeyRound, UserCog,
} from "lucide-react";

const EMPTY_FORM = { name: "", username: "", email: "", password: "", adminRole: "", isActive: true };

export default function AdminUsersPage() {
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [tempPassword, setTempPassword] = useState("");

  const utils = trpc.useUtils();
  const { data: users, isLoading } = trpc.adminUser.list.useQuery({ page: 1, limit: 100, status: "all" });
  const { data: roles } = trpc.branchRole.list.useQuery();
  const activeRoles = (roles ?? []).filter((r) => r.isActive);

  const createUser = trpc.adminUser.create.useMutation({
    onSuccess: () => { reset(); utils.adminUser.list.invalidate(); },
    onError: (e) => setFormError(e.message),
  });
  const updateUser = trpc.adminUser.update.useMutation({
    onSuccess: () => { reset(); utils.adminUser.list.invalidate(); },
    onError: (e) => setFormError(e.message),
  });
  const toggleStatus = trpc.adminUser.toggleStatus.useMutation({
    onSuccess: () => utils.adminUser.list.invalidate(),
    onError: (e) => alert(e.message),
  });
  const deleteUser = trpc.adminUser.delete.useMutation({
    onSuccess: () => utils.adminUser.list.invalidate(),
    onError: (e) => alert(e.message),
  });
  const resetPassword = trpc.adminUser.resetPassword.useMutation({
    onSuccess: (data) => setTempPassword(data.password),
    onError: (e) => alert(e.message),
  });

  const reset = () => { setForm(EMPTY_FORM); setEditingId(null); setShowModal(false); setFormError(""); };

  const openEdit = (u: NonNullable<typeof users>["items"][number]) => {
    setForm({ name: u.name ?? "", username: u.username ?? "", email: u.email ?? "", password: "", adminRole: u.adminRole ?? "", isActive: !!u.isActive });
    setEditingId(u.id);
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormError("Name is required"); return; }
    if (!form.username.trim()) { setFormError("Username is required"); return; }
    if (!form.email.trim()) { setFormError("Email is required"); return; }
    if (!form.adminRole.trim()) { setFormError("Role is required"); return; }
    if (editingId) {
      updateUser.mutate({
        id: editingId,
        name: form.name,
        username: form.username,
        email: form.email,
        adminRole: form.adminRole,
        isActive: form.isActive,
      });
    } else {
      if (!form.password) { setFormError("Password is required"); return; }
      createUser.mutate({
        name: form.name,
        username: form.username,
        email: form.email,
        password: form.password,
        adminRole: form.adminRole,
        isActive: form.isActive,
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Admin Users</h1>
          <p className="text-sm text-gray-500 mt-1">Create and manage sub-admin accounts</p>
        </div>
        <button onClick={() => { reset(); setShowModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors self-start">
          <Plus className="w-4 h-4" /> Add Sub-Admin
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <UserCog className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-blue-700">
          Every account here is a <strong>sub-admin</strong> scoped to a branch role (department) — they only see
          tickets from that department. Main admins (which see everything) are not managed from this page.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Name</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Username</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Email</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Role</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Active</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="py-3 px-4"><div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" /></td>
                    ))}
                  </tr>
                ))
              ) : (
                (users?.items ?? []).map((u) => (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors fade-in-up">
                    <td className="py-3 px-4 text-sm text-gray-800">{u.name || "-"}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{u.username || "-"}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{u.email || "-"}</td>
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{u.adminRole}</span>
                    </td>
                    <td className="py-3 px-4">
                      <button onClick={() => toggleStatus.mutate({ id: u.id })} className="transition-colors">
                        {u.isActive ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5 text-gray-300" />}
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(u)} className="p-1.5 hover:bg-blue-50 rounded-lg text-gray-400 hover:text-blue-600"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => resetPassword.mutate({ id: u.id })} className="p-1.5 hover:bg-amber-50 rounded-lg text-gray-400 hover:text-amber-600" title="Reset password"><KeyRound className="w-4 h-4" /></button>
                        <button onClick={() => { if (confirm(`Delete admin "${u.name || u.username}"?`)) deleteUser.mutate({ id: u.id }); }} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={reset} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800">{editingId ? "Edit Sub-Admin" : "Add Sub-Admin"}</h2>
              <button onClick={reset} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {formError && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{formError}</p>}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Username *</label>
                <input value={form.username} onChange={e => setForm({...form, username: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
                <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
              </div>
              {!editingId && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Password *</label>
                  <input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Role / Department *</label>
                <select value={form.adminRole} onChange={e => setForm({...form, adminRole: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none bg-white">
                  <option value="" disabled>Select a role...</option>
                  <option value="Stationary Admin">Stationary Admin</option>
                  {activeRoles.map((r) => (
                    <option key={r.id} value={r.name}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="isActive" checked={form.isActive} onChange={e => setForm({...form, isActive: e.target.checked})} className="w-4 h-4 text-red-600 rounded" />
                <label htmlFor="isActive" className="text-sm text-gray-700">Active</label>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={reset} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={createUser.isPending || updateUser.isPending} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
                  {(createUser.isPending || updateUser.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {tempPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setTempPassword("")} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Password Reset</h3>
            <p className="text-sm text-gray-600 mb-3">New temporary password for this admin:</p>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 font-mono text-sm text-center">{tempPassword}</div>
            <p className="text-xs text-amber-600 mt-3">Please share this password securely with the admin.</p>
            <div className="flex justify-end mt-4">
              <button onClick={() => setTempPassword("")} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
