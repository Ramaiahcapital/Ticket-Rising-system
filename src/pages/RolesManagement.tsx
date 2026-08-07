import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Plus, Pencil, Trash2, X, Loader2, ToggleLeft, ToggleRight, Users } from "lucide-react";

export default function RolesManagement() {
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", color: "#3B82F6", isActive: true });
  const [formError, setFormError] = useState("");

  const utils = trpc.useUtils();
  const { data: roles, isLoading } = trpc.branchRole.list.useQuery();

  const createRole = trpc.branchRole.create.useMutation({
    onSuccess: () => { reset(); utils.branchRole.list.invalidate(); },
    onError: (e) => setFormError(e.message),
  });
  const updateRole = trpc.branchRole.update.useMutation({
    onSuccess: () => { reset(); utils.branchRole.list.invalidate(); },
    onError: (e) => setFormError(e.message),
  });
  const deleteRole = trpc.branchRole.delete.useMutation({
    onSuccess: (_data, variables) => {
      setRemovingId(variables.id);
      setTimeout(() => {
        utils.branchRole.list.invalidate();
        setRemovingId(null);
      }, 300);
    },
    onError: (e) => { alert(e.message); },
  });

  const reset = () => { setForm({ name: "", color: "#3B82F6", isActive: true }); setEditingId(null); setShowModal(false); setFormError(""); };

  const openEdit = (r: NonNullable<typeof roles>[0]) => {
    setForm({ name: r.name, color: r.color, isActive: r.isActive });
    setEditingId(r.id);
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormError("Role name is required"); return; }
    if (editingId) {
      updateRole.mutate({ id: editingId, name: form.name, color: form.color, isActive: form.isActive });
    } else {
      createRole.mutate({ name: form.name, color: form.color, isActive: form.isActive, sortOrder: (roles?.length ?? 0) + 1 });
    }
  };

  const presetColors = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#6B7280", "#7C2D12", "#DC2626"];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Branch Roles</h1>
          <p className="text-sm text-gray-500 mt-1">Define the roles used by branch users across the system</p>
        </div>
        <button onClick={() => { reset(); setShowModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors self-start">
          <Plus className="w-4 h-4" /> Add Role
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <Users className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-amber-700">
          Renaming a role updates it everywhere (users, tickets, form configs, portal access).
          Deleting is only allowed when no user, ticket, or form config uses the role — otherwise deactivate it.
          Roles are used for ticket filtering, dashboards, form configuration, and stationary portal access.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="py-3 px-4 w-8"></th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">#</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Role Name</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Color</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Active</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="py-3 px-4"><div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" /></td>
                    ))}
                  </tr>
                ))
              ) : (
                roles?.map((r, idx) => (
                  <tr key={r.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${removingId === r.id ? "row-removing" : "fade-in-up"}`}>
                    <td className="py-3 px-2"></td>
                    <td className="py-3 px-4 text-sm text-gray-500">{idx + 1}</td>
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: `${r.color}20`, color: r.color }}>{r.name}</span>
                      {!r.isActive && <span className="ml-2 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">inactive</span>}
                    </td>
                    <td className="py-3 px-4"><div className="w-6 h-6 rounded-full border border-gray-200" style={{ backgroundColor: r.color }} /></td>
                    <td className="py-3 px-4">
                      <button onClick={() => updateRole.mutate({ id: r.id, isActive: !r.isActive })} className="transition-colors">
                        {r.isActive ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5 text-gray-300" />}
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-blue-50 rounded-lg text-gray-400 hover:text-blue-600"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => { if (confirm(`Delete role "${r.name}"?`)) deleteRole.mutate({ id: r.id }); }} disabled={removingId === r.id} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 disabled:opacity-50">
                          {removingId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
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
              <h2 className="text-lg font-semibold text-gray-800">{editingId ? "Edit Role" : "Add Role"}</h2>
              <button onClick={reset} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {formError && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{formError}</p>}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Role Name *</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Color</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {presetColors.map(c => (
                    <button key={c} type="button" onClick={() => setForm({...form, color: c})} className={`w-8 h-8 rounded-lg border-2 transition-colors ${form.color === c ? "border-gray-800 scale-110" : "border-transparent hover:scale-105"}`} style={{ backgroundColor: c }} />
                  ))}
                </div>
                <input type="color" value={form.color} onChange={e => setForm({...form, color: e.target.value})} className="w-full h-10 rounded-lg cursor-pointer" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="isActive" checked={form.isActive} onChange={e => setForm({...form, isActive: e.target.checked})} className="w-4 h-4 text-red-600 rounded" />
                <label htmlFor="isActive" className="text-sm text-gray-700">Active (role is assignable and shown in selects)</label>
              </div>
              {editingId && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                  Renaming this role will update existing users, tickets, form configs and portal access automatically.
                </p>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Preview:</span>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: `${form.color}20`, color: form.color }}>{form.name || "Role"}</span>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={reset} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={createRole.isPending || updateRole.isPending} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
                  {(createRole.isPending || updateRole.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
