import { useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { useBranchRoles } from "@/hooks/useBranchRoles";
import { Search, Filter, Eye, Ticket, Building2, AlertTriangle } from "lucide-react";

export default function ClusterBranchTickets() {
  const navigate = useNavigate();
  const { activeRoles, getColor } = useBranchRoles();
  const limit = 10;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusId, setStatusId] = useState<string | undefined>();
  const [branchRole, setBranchRole] = useState<string | undefined>();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const { data: ticketsData, isLoading } = trpc.cluster.branchTickets.useQuery({
    page,
    limit,
    search: search || undefined,
    statusId,
    branchRole: branchRole || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });
  const { data: statuses } = trpc.ticketStatus.listEnabled.useQuery();

  const getStatusBadge = (statusName: string, color: string) => (
    <span
      className="px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ backgroundColor: `${color}20`, color }}
    >
      {statusName}
    </span>
  );

  const getBranchRoleBadge = (role: string) => {
    const color = getColor(role);
    return (
      <span
        className="px-2 py-0.5 rounded text-xs font-medium"
        style={{ backgroundColor: `${color}1A`, color }}
      >
        {role}
      </span>
    );
  };

  const clearFilters = () => {
    setStatusId(undefined);
    setBranchRole(undefined);
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const statusMap = new Map((statuses ?? []).map((s) => [s.id, s]));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Branches Tickets</h1>
        <p className="text-sm text-gray-500 mt-1">
          View-only access to tickets raised by branches assigned to your cluster
        </p>
      </div>

      {(ticketsData?.total ?? 0) === 0 && !isLoading ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-700">
            No branch tickets found. Tickets raised by branches assigned to your cluster will appear here.
          </p>
        </div>
      ) : (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <Building2 className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-blue-700">
            You can <strong>view</strong> these tickets and their full details, but you cannot reply or change
            their status. You can only reply to and manage tickets you raised yourself.
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by ID, subject, or keyword"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>
        </div>

        {showFilters && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-3">
            <select
              value={statusId || ""}
              onChange={(e) => { setStatusId(e.target.value || undefined); setPage(1); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-red-500"
            >
              <option value="">All Statuses</option>
              {statuses?.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select
              value={branchRole || ""}
              onChange={(e) => { setBranchRole(e.target.value || undefined); setPage(1); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-red-500"
            >
              <option value="">All Departments</option>
              {activeRoles.map(r => (
                <option key={r.id} value={r.name}>{r.name}</option>
              ))}
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-red-500"
              placeholder="From"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-red-500"
              placeholder="To"
            />
            <button
              onClick={clearFilters}
              className="px-3 py-2 text-sm text-gray-500 hover:text-red-600 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Ticket ID</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Subject</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Branch</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Department</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Created</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="py-3 px-4">
                        <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : ticketsData?.items?.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Ticket className="w-10 h-10 text-gray-300" />
                      <p className="text-gray-500 text-sm">No branch tickets found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                ticketsData?.items?.map((ticket: any) => {
                  const status = statusMap.get(ticket.statusId ?? "") || null;
                  return (
                    <tr
                      key={ticket.id}
                      className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <button
                          onClick={() => navigate(`/tickets/${ticket.id}`)}
                          className="text-sm font-mono text-red-600 hover:underline"
                        >
                          {ticket.ticketNumber}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-800 max-w-[200px] truncate">
                        {ticket.subject}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {ticket.branch?.branchName || "-"}
                      </td>
                      <td className="py-3 px-4">
                        {status
                          ? getStatusBadge(status.name, status.color)
                          : <span className="text-gray-400 text-sm">-</span>
                        }
                      </td>
                      <td className="py-3 px-4">
                        {ticket.branchRole
                          ? getBranchRoleBadge(ticket.branchRole)
                          : <span className="text-gray-400 text-sm">-</span>
                        }
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500">
                        {new Date(ticket.createdAt ?? new Date()).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => navigate(`/tickets/${ticket.id}`)}
                          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-red-600 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {ticketsData && ticketsData.total > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-4 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Showing {(ticketsData.page - 1) * limit + 1}–
              {Math.min(ticketsData.page * limit, ticketsData.total)} of {ticketsData.total} tickets
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ‹
              </button>
              {Array.from({ length: ticketsData.totalPages }).map((_, i) => {
                const p = i + 1;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`min-w-[2rem] px-2.5 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                      p === page
                        ? "bg-red-600 text-white"
                        : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(ticketsData.totalPages, p + 1))}
                disabled={page >= ticketsData.totalPages}
                className="px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ›
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}