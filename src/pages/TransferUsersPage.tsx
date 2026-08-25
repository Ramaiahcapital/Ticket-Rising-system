import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Plus, Pencil, Trash2, X, Loader2, Users, Search, KeyRound, ToggleLeft, ToggleRight } from "lucide-react";

export default function TransferUsersPage() {
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [formError, setFormError] = useState("");
  const [search, setSearch] = useState("");
  const [resetPasswordId, setResetPasswordId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.transferUser.list.useQuery({ search: search || undefined });

  const createUser = trpc.transferUser.create.useMutation({
    onSuccess: () => { reset(); utils.transferUser.list.invalidate(); },
    onError: (e) => setFormError(e.message),
  });
  const updateUser = trpc.transferUser.update.useMutation({
    onSuccess: () => { reset(); utils.transferUser.list.invalidate(); },
    onError: (e) => setFormError(e.message),
  });
  const deleteUser = trpc.transferUser.delete.useMutation({
    onSuccess: () => { utils.transferUser.list.invalidate(); },
    onError: (e) => { alert(e.message); },
  });
  const toggleStatus = trpc.transferUser.toggleStatus.useMutation({
    onSuccess: () => { utils.transferUser.list.invalidate(); },
  });
  const resetPassword = trpc.transferUser.resetPassword.useMutation({
    onSuccess: (data) => { setNewPassword(data.password); setResetPasswordId(null); },
    onError: (e) => { alert(e.message); setResetPasswordId(null); },
  });

  const reset = () => {
    setForm({ name: "", email: "", password: "" });
    setEditingId(null);
    setShowModal(false);
    setFormError("");
  };

  const openEdit = (u: { id: string; name: string | null; email: string | null }) => {
    setForm({ name: u.name || "", email: u.email || "", password: "" });
    setEditingId(u.id);
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormError("Name is required"); return; }
    if (!form.email.trim()) { setFormError("Email is required"); return; }
    if (editingId) {
      updateUser.mutate({
        id: editingId,
        name: form.name,
        email: form.email,
      });
    } else {
      if (!form.password || form.password.length < 6) { setFormError("Password must be at least 6 characters"); return; }
      createUser.mutate({
        name: form.name,
        email: form.email,
        password: form.password,
      });
    }
  };

  const items = data?.items ?? [];

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
            <Users className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Transfer Users</h1>
            <p className="text-sm text-gray-500">Manage transfer user accounts who receive and work on transferred tickets</p>
          </div>
        </div>
        <button
          onClick={() => { reset(); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> Add User
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Name</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Email</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Last Login</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="py-3 px-4">
                        <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Users className="w-10 h-10 text-gray-300" />
                      <p className="text-gray-500 text-sm">{search ? "No users match your search" : "No transfer users yet. Add one to get started."}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((u) => (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4 text-sm font-medium text-gray-800">{u.name}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{u.email}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                        u.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}>
                        {u.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never"}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => toggleStatus.mutate({ id: u.id })}
                          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                          title={u.isActive ? "Deactivate" : "Activate"}
                          disabled={toggleStatus.isPending}
                        >
                          {u.isActive ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4 text-gray-400" />}
                        </button>
                        <button
                          onClick={() => openEdit(u)}
                          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4 text-gray-500" />
                        </button>
                        <button
                          onClick={() => {
                            setResetPasswordId(u.id);
                            setNewPassword(null);
                          }}
                          className="p-1.5 hover:bg-amber-50 rounded-lg transition-colors"
                          title="Reset Password"
                        >
                          <KeyRound className="w-4 h-4 text-amber-500" />
                        </button>
                        <button
                          onClick={() => {
                            if (!confirm(`Delete ${u.name}? This cannot be undone.`)) return;
                            deleteUser.mutate({ id: u.id });
                          }}
                          className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
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

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800">
                {editingId ? "Edit Transfer User" : "Add Transfer User"}
              </h2>
              <button onClick={reset} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                  placeholder="user@example.com"
                />
              </div>
              {!editingId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                    placeholder="Minimum 6 characters"
                  />
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={reset}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createUser.isPending || updateUser.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {(createUser.isPending || updateUser.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingId ? "Save Changes" : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetPasswordId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800">Reset Password</h2>
              <button onClick={() => { setResetPasswordId(null); setNewPassword(null); }} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6">
              {newPassword ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">New password generated:</p>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 font-mono text-lg text-center text-gray-800">
                    {newPassword}
                  </div>
                  <p className="text-xs text-amber-600">Save this password. It will not be shown again.</p>
                  <button
                    onClick={() => { setResetPasswordId(null); setNewPassword(null); }}
                    className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">Generate a new random password for this user?</p>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => { setResetPasswordId(null); setNewPassword(null); }}
                      className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => resetPassword.mutate({ id: resetPasswordId })}
                      disabled={resetPassword.isPending}
                      className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      {resetPassword.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                      Reset Password
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
