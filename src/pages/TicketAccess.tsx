import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import { Loader2, Search, Ticket, Users, CheckCircle2, XCircle } from "lucide-react";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  branch: "Branch",
  cluster: "Cluster",
  transfer: "Transfer",
};

const ROLE_CLS: Record<string, string> = {
  admin: "bg-blue-50 text-blue-700",
  branch: "bg-emerald-50 text-emerald-700",
  cluster: "bg-purple-50 text-purple-700",
  transfer: "bg-amber-50 text-amber-700",
};

export default function TicketAccess() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const { data: users, isLoading } = trpc.adminUser.listTicketAccess.useQuery({ search: search || undefined });

  const setTicketAccess = trpc.adminUser.setTicketAccess.useMutation({
    onSuccess: () => utils.adminUser.listTicketAccess.invalidate(),
    onError: (e) => alert(e.message),
  });

  const rows = useMemo(() => {
    const list = users ?? [];
    return roleFilter === "all" ? list : list.filter((u) => u.role === roleFilter);
  }, [users, roleFilter]);

  const enabledCount = (users ?? []).filter((u) => u.canRaiseTicket).length;

  const toggle = (id: string, next: boolean) => {
    setTicketAccess.mutate({ id, canRaiseTicket: next });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Ticket Access</h1>
          <p className="text-sm text-gray-500 mt-1">Control which users can raise tickets</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <CheckCircle2 className="w-4 h-4 text-green-500" />
          <span><strong>{enabledCount}</strong> of {users?.length ?? 0} users can raise tickets</span>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <Users className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-blue-700">
          Everyone is allowed to raise tickets by default. Turn a user off to block them from creating
          tickets. Raised tickets are routed to the admins responsible for the department selected on the ticket.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-3">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs font-medium text-gray-600 mb-1">Search</label>
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, email or branch"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
          >
            <option value="all">All roles</option>
            <option value="admin">Admins</option>
            <option value="branch">Branch</option>
            <option value="cluster">Cluster</option>
            <option value="transfer">Transfer</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">User</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Email</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Role</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Department / Scope</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Active</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Can Raise Tickets</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 px-4">
                    <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading users
                    </div>
                  </td>
                </tr>
              ) : !rows.length ? (
                <tr>
                  <td colSpan={6} className="py-10 px-4 text-center text-sm text-gray-500">No users match your filters</td>
                </tr>
              ) : (
                rows.map((u) => (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4 text-sm font-medium text-gray-800">{u.name}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{u.email || "-"}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ROLE_CLS[u.role] ?? "bg-gray-100 text-gray-600"}`}>
                        {u.isMainAdmin ? "Main Admin" : ROLE_LABEL[u.role] ?? u.role}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">{u.scope || (u.isMainAdmin ? "All departments" : "-")}</td>
                    <td className="py-3 px-4">
                      {u.isActive
                        ? <span className="inline-flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="w-3.5 h-3.5" /> Active</span>
                        : <span className="inline-flex items-center gap-1 text-xs text-gray-400"><XCircle className="w-3.5 h-3.5" /> Inactive</span>}
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => toggle(u.id, !u.canRaiseTicket)}
                        disabled={setTicketAccess.isPending}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                          u.canRaiseTicket
                            ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                            : "border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100"
                        }`}
                        title={u.canRaiseTicket ? "Click to disable" : "Click to enable"}
                      >
                        <Ticket className="w-3.5 h-3.5" />
                        {u.canRaiseTicket ? "Enabled" : "Disabled"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}