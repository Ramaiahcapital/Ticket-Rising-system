import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { Ticket, Users, Eye, LayoutDashboard, List } from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
} from "recharts";
import { useBranchRoles } from "@/hooks/useBranchRoles";
import { useState } from "react";

export default function MonitorDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getColor } = useBranchRoles();
  const [view, setView] = useState<"overview" | "tickets">("overview");

  const { data: stats, isLoading } = trpc.dashboard.monitorStats.useQuery();
  const { data: tickets } = trpc.ticket.list.useQuery({ limit: 50 });

  const departmentName = (user as any)?.monitorRole || "Monitored";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" />
      </div>
    );
  }

  const statusData = stats?.statusDistribution
    ?.filter((s) => s.count > 0)
    .map((s) => ({ name: s.name, value: s.count, color: s.color })) || [];

  const statCards = [
    { label: "Total Tickets", value: stats?.totalTickets || 0, icon: Ticket, color: "bg-blue-50 text-blue-600" },
    { label: "Total Branches", value: stats?.totalBranches || 0, icon: Users, color: "bg-purple-50 text-purple-600" },
    { label: "View Only", value: "Yes", icon: Eye, color: "bg-green-50 text-green-600" },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Monitor Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            View-only overview of{" "}
            <span
              className="px-1.5 py-0.5 rounded text-xs font-medium"
              style={{ backgroundColor: `${getColor(departmentName)}1A`, color: getColor(departmentName) }}
            >
              {departmentName}
            </span>{" "}
            tickets
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView("overview")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors border ${
              view === "overview"
                ? "bg-red-600 text-white border-red-600"
                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
            }`}
          >
            <LayoutDashboard className="w-4 h-4" /> Overview
          </button>
          <button
            onClick={() => setView("tickets")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors border ${
              view === "tickets"
                ? "bg-red-600 text-white border-red-600"
                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
            }`}
          >
            <List className="w-4 h-4" /> Tickets
          </button>
        </div>
      </div>

      {view === "overview" ? (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {statCards.map((card) => (
              <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${card.color}`}>
                    <card.icon className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-800">{card.value}</p>
                    <p className="text-sm text-gray-500">{card.label}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Status Distribution</h3>
            {statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-gray-400 text-sm">
                No data available
              </div>
            )}
            <div className="flex flex-wrap gap-3 mt-4">
              {statusData.slice(0, 6).map((s) => (
                <div key={s.name} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-xs text-gray-600">{s.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Tickets */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Recent Tickets</h3>
              <button
                onClick={() => setView("tickets")}
                className="text-sm text-red-600 hover:text-red-700 font-medium"
              >
                View All
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Ticket</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Subject</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {stats?.recentTickets?.slice(0, 5).map((ticket) => (
                    <tr
                      key={ticket.id}
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/tickets/${ticket.id}`)}
                    >
                      <td className="py-3 px-4 text-sm font-mono text-red-600">{ticket.ticketNumber}</td>
                      <td className="py-3 px-4 text-sm text-gray-800 truncate max-w-[200px]">{ticket.subject}</td>
                      <td className="py-3 px-4 text-sm text-gray-500">{ticket.statusId ? "Active" : "New"}</td>
                      <td className="py-3 px-4 text-sm text-gray-500">
                        {new Date(ticket.createdAt ?? new Date()).toLocaleDateString()}
                      </td>
                    </tr>
                  )) || (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-gray-400 text-sm">No tickets yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* Tickets list — view only */
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800">
              {departmentName} Tickets
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              View only — you cannot reply, notify, or change status on these tickets.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Ticket</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Subject</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Created</th>
                </tr>
              </thead>
              <tbody>
                {(tickets?.items ?? []).map((ticket) => (
                  <tr
                    key={ticket.id}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/tickets/${ticket.id}`)}
                  >
                    <td className="py-3 px-4 text-sm font-mono text-red-600">{ticket.ticketNumber}</td>
                    <td className="py-3 px-4 text-sm text-gray-800 truncate max-w-[250px]">{ticket.subject}</td>
                    <td className="py-3 px-4">
                      {(ticket as any).status?.name ? (
                        <span
                          className="px-2.5 py-1 rounded-full text-xs font-medium"
                          style={{ backgroundColor: `${(ticket as any).status.color}20`, color: (ticket as any).status.color }}
                        >
                          {(ticket as any).status.name}
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">New</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500">
                      {new Date(ticket.createdAt ?? new Date()).toLocaleDateString()}
                    </td>
                  </tr>
                )) || (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-gray-400 text-sm">No tickets found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
