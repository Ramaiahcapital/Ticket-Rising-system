import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Plus, Pencil, Trash2, X, Loader2, Users, Search } from "lucide-react";

export default function TransferUsersPage() {
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", department: "", credential: "" });
  const [formError, setFormError] = useState("");
  const [search, setSearch] = useState("");

  const utils = trpc.useUtils();
  const { data: users, isLoading } = trpc.transferUser.list.useQuery();

  const createUser = trpc.transferUser.create.useMutation({
    onSuccess: () => { reset(); utils.transferUser.list.invalidate(); },
    onError: (e) => setFormError(e.message),
  });
  const updateUser = trpc.transferUser.update.useMutation({
    onSuccess: () => { reset(); utils.transferUser.list.invalidate(); },
    onError: (e) => setFormError(e.message),
  });
  const deleteUser = trpc.transferUser.delete.useMutation({
    onSuccess: (_data, variables) => {
      setRemovingId(variables.id);
      setTimeout(() => {
        utils.transferUser.list.invalidate();
        setRemovingId(null);
      }, 300);
    },
    onError: (e) => { alert(e.message); },
  });

  const reset = () => {
    setForm({ name: "", email: "", department: "", credential: "" });
    setEditingId(null);
    setShowModal(false);
    setFormError("");
  };

  const openEdit = (u: { id: string; name: string; email: string; department: string | null; credential: string | null }) => {
    setForm({
      name: u.name,
      email: u.email,
      department: u.department || "",
      credential: u.credential || "",
    });
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
        department: form.department || undefined,
        credential: form.credential || undefined,
      });
    } else {
      createUser.mutate({
        name: form.name,
        email: form.email,
        department: form.department || undefined,
        credential: form.credential || undefined,
      });
    }
  };

  const filtered = (users ?? []).filter(
    (u: { name: string; email: string; department: string | null }) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.department || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
            <Users className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Transfer Users</h1>
            <p className="text-sm text-gray-500">Manage the directory of users who receive transferred tickets</p>
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
            placeholder="Search by name, email, or department..."
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
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Department</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Credential</th>
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
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Users className="w-10 h-10 text-gray-300" />
                      <p className="text-gray-500 text-sm">{search ? "No users match your search" : "No transfer users yet. Add one to get started."}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((u: { id: string; name: string; email: string; department: string | null; credential: string | null }) => (
                  <tr
                    key={u.id}
                    className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                      removingId === u.id ? "opacity-0" : ""
                    }`}
                  >
                    <td className="py-3 px-4 text-sm font-medium text-gray-800">{u.name}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{u.email}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{u.department || "-"}</td>
                    <td className="py-3 px-4 text-sm text-gray-500 font-mono">{u.credential || "-"}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(u)}
                          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4 text-gray-500" />
                        </button>
                        <button
                          onClick={() => {
                            if (!confirm(`Delete ${u.name}?`)) return;
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

      {/* Modal */}
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <input
                  type="text"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                  placeholder="e.g. Marketing, IT, Finance"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Credential</label>
                <input
                  type="text"
                  value={form.credential}
                  onChange={(e) => setForm({ ...form, credential: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                  placeholder="Access code or identifier"
                />
              </div>
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
                  {editingId ? "Save Changes" : "Add User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
