import { useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useBranchRoles } from "@/hooks/useBranchRoles";
import {
  Plus, Search, Filter, Eye, Ticket, Download, Loader2,
} from "lucide-react";
import * as XLSX from "xlsx";

export default function TicketList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const deptParam = searchParams.get("department");
  const { isAdmin, isTransfer } = useAuth();
  const { activeRoles, getColor } = useBranchRoles();
  const [displayLimit, setDisplayLimit] = useState(10);
  const [search, setSearch] = useState("");
  const [statusId, setStatusId] = useState<string | undefined>();
  const [branchId, setBranchId] = useState<string | undefined>();
  const [branchRole, setBranchRole] = useState<string | undefined>(deptParam ?? undefined);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [activeBucket, setActiveBucket] = useState<string>(deptParam ?? "all");
  const limit = 10;

  const { data: ticketsData, isLoading } = trpc.ticket.list.useQuery({
    page: 1,
    limit: displayLimit,
    search: search || undefined,
    statusId,
    branchId,
    branchRole: branchRole || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const { data: statuses } = trpc.ticketStatus.listEnabled.useQuery();
  const { data: branches } = trpc.branch.listAll.useQuery();
  const { data: deptCounts } = trpc.ticket.departmentCounts.useQuery(undefined, { enabled: isAdmin });

  const exportQuery = trpc.ticket.listExport.useQuery({
    search: search || undefined,
    statusId,
    branchId,
    branchRole: branchRole || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  }, { enabled: false });

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const result = await exportQuery.refetch();
      const data = result.data;
      if (!data || data.length === 0) return;

      const wsData = data.map(t => ({
        "Ticket Number": t.ticketNumber,
        "Subject": t.subject,
        "Branch": t.branch,
        "Progress": t.status,
        "Department": t.branchRole,
        "Created": new Date(t.createdAt ?? new Date()).toLocaleDateString(),
      }));

      const ws = XLSX.utils.json_to_sheet(wsData);
      ws["!cols"] = [
        { wch: 18 }, { wch: 40 }, { wch: 20 }, { wch: 15 }, { wch: 18 }, { wch: 14 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Tickets");
      XLSX.writeFile(wb, "tickets.xlsx");
    } finally {
      setIsExporting(false);
    }
  }, [exportQuery]);

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
    setBranchId(undefined);
    setBranchRole(undefined);
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setDisplayLimit(10);
  };

  const handleBucketClick = (bucket: string) => {
    setActiveBucket(bucket);
    if (bucket === "all") setBranchRole(undefined);
    else setBranchRole(bucket);
    setDisplayLimit(10);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            {isTransfer ? "Transferred Tickets" : "Tickets"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAdmin ? "Manage and track all support tickets" : isTransfer ? "Tickets assigned to you" : "View and manage your tickets"}
          </p>
        </div>
        <div className="flex gap-2">
          {!isTransfer && (
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {isExporting ? "Exporting..." : "Export Excel"}
            </button>
          )}
          {!isAdmin && !isTransfer && (
            <button
              onClick={() => navigate("/tickets/new")}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Ticket
            </button>
          )}
        </div>
      </div>

      {/* Department Bucket Tabs (admin only) */}
      {isAdmin && (
        <div className="flex gap-2 flex-wrap">
          {[
            { key: "all", name: "All", color: "#6B7280", count: ticketsData?.total ?? 0 },
            ...(deptCounts ?? []).map(d => ({ ...d, key: d.name })),
          ].map((bucket) => {
            const highlight = activeBucket === bucket.key;
            return (
              <button
                key={bucket.key}
                onClick={() => handleBucketClick(bucket.key)}
                className={`relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                  highlight
                    ? "border-gray-800 bg-gray-800 text-white shadow-sm"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: bucket.color || "#6B7280" }}
                />
                {bucket.name}
                <span className={`ml-1 px-1.5 py-0.5 rounded text-xs font-semibold ${
                  highlight ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
                }`}>
                  {bucket.count ?? 0}
                </span>
                {bucket.count > 0 && bucket.key !== "all" && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white animate-pulse" />
                )}
              </button>
            );
          })}
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
              onChange={(e) => { setSearch(e.target.value); setDisplayLimit(10); }}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
            />
          </div>
          {!isTransfer && (
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Filter className="w-4 h-4" />
              Filters
            </button>
          )}
        </div>

        {showFilters && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-3">
            <select
              value={statusId || ""}
              onChange={(e) => { setStatusId(e.target.value || undefined); setDisplayLimit(10); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-red-500"
            >
              <option value="">All Statuses</option>
              {statuses?.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {isAdmin && (
              <select
                value={branchId || ""}
                onChange={(e) => { setBranchId(e.target.value || undefined); setDisplayLimit(10); }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-red-500"
              >
                <option value="">All Branches</option>
                {branches?.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}
            {isAdmin && (
              <select
                value={branchRole || ""}
                onChange={(e) => { setBranchRole(e.target.value || undefined); setDisplayLimit(10); }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-red-500"
              >
                <option value="">All Departments</option>
                {activeRoles.map(r => (
                  <option key={r.id} value={r.name}>{r.name}</option>
                ))}
              </select>
            )}
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setDisplayLimit(10); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-red-500"
              placeholder="From"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setDisplayLimit(10); }}
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
                {isAdmin && <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Branch</th>}
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                {isAdmin && <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Department</th>}
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Created</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: isAdmin ? 7 : 5 }).map((_, j) => (
                      <td key={j} className="py-3 px-4">
                        <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : ticketsData?.items?.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 7 : 5} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Ticket className="w-10 h-10 text-gray-300" />
                      <p className="text-gray-500 text-sm">
                        {isTransfer ? "No tickets assigned to you" : "No tickets found"}
                      </p>
                      {!isAdmin && !isTransfer && (
                        <button
                          onClick={() => navigate("/tickets/new")}
                          className="text-red-600 text-sm hover:underline"
                        >
                          Create a ticket
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                ticketsData?.items?.map((ticket) => (
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
                    {isAdmin && (
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {(ticket as any).branch?.branchName || (ticket as any).branch?.name || "-"}
                      </td>
                    )}
                    <td className="py-3 px-4">
                      {ticket.status
                        ? getStatusBadge(ticket.status.name, ticket.status.color)
                        : <span className="text-gray-400 text-sm">-</span>
                      }
                    </td>
                    {isAdmin && (
                      <td className="py-3 px-4">
                        {ticket.branchRole
                          ? getBranchRoleBadge(ticket.branchRole)
                          : <span className="text-gray-400 text-sm">-</span>
                        }
                      </td>
                    )}
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
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Load More */}
        {ticketsData && ticketsData.total > 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-4 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Showing {Math.min(displayLimit, ticketsData.total)} of {ticketsData.total} tickets
            </p>
            {ticketsData.total > displayLimit && (
              <button
                onClick={() => setDisplayLimit(d => d + limit)}
                className="px-6 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Load More
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
