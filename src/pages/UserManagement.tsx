import { useState } from "react";
import { trpc } from "@/providers/trpc";
import {
  Plus, Search, Pencil, KeyRound, Power, Trash2,
  ChevronLeft, ChevronRight, X, Loader2, UserCheck, UserX,
} from "lucide-react";

const BRANCH_ROLES = ["IT", "Branch Admin", "Manager"] as const;

export default function UserManagement() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<string | null>(null);
  const limit = 10;

  // Form state
  const [form, setForm] = useState<{
    branchId: string; contactPerson: string;
    email: string; mobile: string; address: string; username: string; password: string; branchRole: "" | "IT" | "Branch Admin" | "Manager";
  }>({
    branchId: "", contactPerson: "",
    email: "", mobile: "", address: "", username: "", password: "", branchRole: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.branchUser.list.useQuery({ page, limit, search: search || undefined, status });
  const { data: branches } = trpc.branch.listAll.useQuery();

  const createUser = trpc.branchUser.create.useMutation({
    onSuccess: () => { resetForm(); utils.branchUser.list.invalidate(); },
    onError: (e) => setFormErrors({ form: e.message }),
  });
  const updateUser = trpc.branchUser.update.useMutation({
    onSuccess: () => { resetForm(); utils.branchUser.list.invalidate(); },
    onError: (e) => setFormErrors({ form: e.message }),
  });
  const toggleStatus = trpc.branchUser.toggleStatus.useMutation({
    onSuccess: () => utils.branchUser.list.invalidate(),
  });
  const resetPassword = trpc.branchUser.resetPassword.useMutation({
    onSuccess: (data) => { setShowPassword(data.password); utils.branchUser.list.invalidate(); },
  });
  const deleteUser = trpc.branchUser.delete.useMutation({
    onSuccess: () => utils.branchUser.list.invalidate(),
  });

  const resetForm = () => {
    setForm({ branchId: "", contactPerson: "", email: "", mobile: "", address: "", username: "", password: "", branchRole: "" });
    setEditingId(null);
    setFormErrors({});
    setShowModal(false);
    setShowPassword(null);
  };

  const openEdit = (user: NonNullable<typeof data>["items"][0]) => {
    setForm({
      branchId: user.branchId ?? "",
      contactPerson: user.contactPerson ?? "", email: user.email ?? "",
      mobile: user.mobile || "", address: user.address || "",
      username: "", password: "", branchRole: user.branchRole ?? "",
    });
    setEditingId(user.id);
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!form.branchId) errors.branchId = "Select a branch";
    if (!form.contactPerson) errors.contactPerson = "Required";
    if (!form.email) errors.email = "Required";
    if (!editingId && !form.username) errors.username = "Required";
    if (!editingId && !form.password) errors.password = "Required";
    if (!form.branchRole) errors.branchRole = "Select a role";
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }

    const role = form.branchRole as "IT" | "Branch Admin" | "Manager";
    if (editingId) {
      updateUser.mutate({ id: editingId, branchId: form.branchId, contactPerson: form.contactPerson, email: form.email, mobile: form.mobile, address: form.address, branchRole: role });
    } else {
      createUser.mutate({ branchId: form.branchId, contactPerson: form.contactPerson, email: form.email, mobile: form.mobile, address: form.address, username: form.username, password: form.password, branchRole: role });
    }
  };

  const totalPages = data?.totalPages || 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Branch Users</h1>
          <p className="text-sm text-gray-500 mt-1">Manage branch accounts and access</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors self-start"
        >
          <Plus className="w-4 h-4" />
          Add Branch User
        </button>
      </div>

      {/* Mini Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Users", value: data?.total || 0, icon: UserCheck, color: "bg-blue-50 text-blue-600" },
          { label: "Active", value: data?.items?.filter(u => u.isActive).length || 0, icon: UserCheck, color: "bg-green-50 text-green-600" },
          { label: "Inactive", value: data?.items?.filter(u => !u.isActive).length || 0, icon: UserX, color: "bg-gray-100 text-gray-600" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>
              <s.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-800">{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name, branch, email..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-red-500"
          />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }}
          className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-red-500"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Name</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Email</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Branch</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Role</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="py-3 px-4"><div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" /></td>
                    ))}
                  </tr>
                ))
              ) : data?.items.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center text-gray-400 text-sm">No users found</td></tr>
              ) : (
                data?.items.map(user => (
                  <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4 text-sm font-medium text-gray-800">{user.contactPerson}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{user.email}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{user.branchName}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {user.branchRole ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          user.branchRole === "IT" ? "bg-blue-50 text-blue-700" :
                          user.branchRole === "Branch Admin" ? "bg-green-50 text-green-700" :
                          "bg-amber-50 text-amber-700"
                        }`}>{user.branchRole}</span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${user.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {user.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(user)} className="p-1.5 hover:bg-blue-50 rounded-lg text-gray-400 hover:text-blue-600 transition-colors"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => resetPassword.mutate({ id: user.id })} className="p-1.5 hover:bg-amber-50 rounded-lg text-gray-400 hover:text-amber-600 transition-colors" title="Reset Password"><KeyRound className="w-4 h-4" /></button>
                        <button onClick={() => toggleStatus.mutate({ id: user.id })} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors" title={user.isActive ? "Deactivate" : "Activate"}>
                          <Power className="w-4 h-4" />
                        </button>
                        <button onClick={() => { if (confirm("Delete this user?")) deleteUser.mutate({ id: user.id }); }} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">Page {page} of {totalPages}</p>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={resetForm} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800">{editingId ? "Edit Branch User" : "Add Branch User"}</h2>
              <button onClick={resetForm} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {formErrors.form && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{formErrors.form}</p>}
              <div className="grid grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Branch *</label>
                  <select value={form.branchId} onChange={e => setForm({...form, branchId: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none bg-white">
                    <option value="">— Select Branch —</option>
                    {branches?.map(b => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
                  </select>
                  {formErrors.branchId && <p className="text-[10px] text-red-500 mt-1">{formErrors.branchId}</p>}
                  {(!branches || branches.length === 0) && <p className="text-[10px] text-amber-600 mt-1">No branches yet — create one in Settings → Branches first.</p>}
                </div>
              </div>
              <div><label className="block text-xs font-medium text-gray-700 mb-1">Contact Person *</label><input value={form.contactPerson} onChange={e => setForm({...form, contactPerson: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" /></div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Branch Role</label>
                <select value={form.branchRole} onChange={e => setForm({...form, branchRole: e.target.value as "" | "IT" | "Branch Admin" | "Manager"})} className={`w-full px-3 py-2 border rounded-lg text-sm focus:border-red-500 outline-none bg-white ${formErrors.branchRole ? "border-red-500" : "border-gray-300"}`}>
                  <option value="">— Select Role —</option>
                  {BRANCH_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                {formErrors.branchRole && <p className="mt-1 text-xs text-red-600">{formErrors.branchRole}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-gray-700 mb-1">Email *</label><input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" /></div>
                <div><label className="block text-xs font-medium text-gray-700 mb-1">Mobile</label><input value={form.mobile} onChange={e => setForm({...form, mobile: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" /></div>
              </div>
              <div><label className="block text-xs font-medium text-gray-700 mb-1">Address</label><textarea value={form.address} onChange={e => setForm({...form, address: e.target.value})} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none resize-none" /></div>
              {!editingId && (
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-gray-700 mb-1">Username *</label><input value={form.username} onChange={e => setForm({...form, username: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" /></div>
                  <div><label className="block text-xs font-medium text-gray-700 mb-1">Password *</label><input type="text" value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="Min 6 characters" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" /></div>
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={resetForm} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={createUser.isPending || updateUser.isPending} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
                  {(createUser.isPending || updateUser.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingId ? "Update" : "Create")}
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
