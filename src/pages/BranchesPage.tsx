import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useBranchRoles } from "@/hooks/useBranchRoles";
import { Plus, Pencil, Trash2, X, Loader2, Save, Users, Building2 } from "lucide-react";

export default function BranchesPage() {
  const utils = trpc.useUtils();
  const { getColor } = useBranchRoles();
  const { data, isLoading } = trpc.branch.list.useQuery({ page: 1, limit: 100 });
  const createBranch = trpc.branch.create.useMutation({ onSuccess: () => { utils.branch.list.invalidate(); utils.branch.listAll.invalidate(); close(); } });
  const updateBranch = trpc.branch.update.useMutation({ onSuccess: () => { utils.branch.list.invalidate(); utils.branch.listAll.invalidate(); close(); } });
  const deleteBranch = trpc.branch.delete.useMutation({ onSuccess: () => { utils.branch.list.invalidate(); utils.branch.listAll.invalidate(); } });

  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", code: "", contactPerson: "", address: "" });
  const [selected, setSelected] = useState<string | null>(null);

  const { data: users } = trpc.branch.users.useQuery({ branchId: selected! }, { enabled: !!selected });

  const open = (b?: any) => {
    if (b) {
      setEditing(b.id);
      setForm({ name: b.name, code: b.code, contactPerson: b.contactPerson || "", address: b.address || "" });
      setSelected(b.id);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Branches</h1>
          <p className="text-sm text-gray-500 mt-1">Create branches, then assign IT / Branch Admin / Manager users to each.</p>
        </div>
        <button onClick={() => open()} className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700"><Plus className="w-3 h-3" /> Add Branch</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b border-gray-200"><h3 className="font-semibold text-gray-800">All Branches <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full ml-2">{data?.total || 0}</span></h3></div>
          <div className="divide-y divide-gray-50">
            {isLoading ? <div className="p-8 text-center text-gray-400 text-sm">Loading…</div> :
              data?.items.map((b) => (
                <div key={b.id} onClick={() => setSelected(b.id)} className={`flex items-center justify-between p-4 cursor-pointer ${selected === b.id ? "bg-red-50 border-l-[3px] border-red-600" : "hover:bg-gray-50"}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 flex items-center gap-2"><Building2 className="w-4 h-4 text-gray-400" />{b.name}</p>
                    <p className="text-xs text-gray-500 font-mono">{b.code}{b.contactPerson ? ` · ${b.contactPerson}` : ""}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={(e) => { e.stopPropagation(); open(b); }} className="p-1.5 hover:bg-blue-50 rounded-lg text-gray-400 hover:text-blue-600"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete branch "${b.name}"?`)) deleteBranch.mutate({ id: b.id }); }} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b border-gray-200"><h3 className="font-semibold text-gray-800 flex items-center gap-2"><Users className="w-4 h-4" /> Users in Branch</h3></div>
          {!selected ? (
            <div className="p-8 text-center text-gray-400 text-sm">Select a branch to view its users</div>
          ) : users?.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No users assigned to this branch yet.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {users?.map((u) => (
                <div key={u.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm text-gray-800">{u.contactPerson} <span className="text-gray-400 text-xs">({u.username})</span></p>
                    <p className="text-xs text-gray-500">{u.email}</p>
                  </div>
                  {u.branchRole && <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: `${getColor(u.branchRole)}1A`, color: getColor(u.branchRole) }}>{u.branchRole}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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
    </div>
  );
}
