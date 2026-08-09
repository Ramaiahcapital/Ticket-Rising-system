import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import {
  Ticket, Users, CheckCircle,
  UserPlus, FileBarChart,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { isMainAdmin, user } = useAuth();
  const { data: stats, isLoading } = trpc.dashboard.adminStats.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" />
      </div>
    );
  }

  const statCards = [
    { label: "Total Tickets", value: stats?.totalTickets || 0, icon: Ticket, color: "bg-blue-50 text-blue-600" },
    { label: "Total Branches", value: stats?.totalBranches || 0, icon: Users, color: "bg-purple-50 text-purple-600" },
    { label: "Active Branches", value: stats?.activeBranches || 0, icon: CheckCircle, color: "bg-green-50 text-green-600" },
  ];

  const statusData = stats?.statusDistribution
    ?.filter(s => s.count > 0)
    .map(s => ({ name: s.name, value: s.count, color: s.color })) || [];

  const budgetData = stats?.stationaryBudget || [];
  const branchData = stats?.branchPerformance || [];
  const departmentCounts = stats?.departmentCounts || [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            {user?.type === "admin" && user.adminRole
              ? `Overview of ${user.adminRole} tickets in your system`
              : "Overview of your ticket management system"}
          </p>
        </div>
        <div className="flex gap-2">
          {isMainAdmin && (
            <button
              onClick={() => navigate("/branches")}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Branches & Users
            </button>
          )}
          <button
            onClick={() => navigate("/reports")}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors"
          >
            <FileBarChart className="w-4 h-4" />
            Reports
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
          >
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

      {/* Department Buckets */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {departmentCounts.map((dept) => {
          return (
            <button
              key={dept.name}
              onClick={() => navigate(`/tickets?department=${encodeURIComponent(dept.name)}`)}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-gray-300 transition-all text-left group"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${dept.color}15` }}>
                  <Ticket className="w-5 h-5" style={{ color: dept.color }} />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-800">{dept.count}</p>
                  <p className="text-xs text-gray-500">{dept.name}</p>
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: `${stats?.totalTickets ? (dept.count / stats.totalTickets) * 100 : 0}%`,
                    backgroundColor: dept.color,
                  }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-2 group-hover:text-gray-500 transition-colors">
                {stats?.totalTickets ? Math.round((dept.count / stats.totalTickets) * 100) : 0}% of all tickets
              </p>
            </button>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Distribution */}
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
            {statusData.slice(0, 6).map(s => (
              <div key={s.name} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-xs text-gray-600">{s.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stationary Budget */}
        {isMainAdmin && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Stationary Budget</h3>
            {budgetData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={budgetData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => `₹${v}`} />
                  <YAxis dataKey="branchName" type="category" width={140} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value: number) => [`₹${value.toLocaleString()}`, "Total Spent"]} />
                  <Bar dataKey="total" fill="#DC2626" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">
                No stationary orders yet
              </div>
            )}
          </div>
        )}
      </div>

      {/* Branch Performance */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Branch Performance</h3>
        {branchData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={branchData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" />
              <YAxis dataKey="branchName" type="category" width={140} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#DC2626" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">
            No data available
          </div>
        )}
      </div>

      {/* Recent Tickets */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Recent Tickets</h3>
          <button
            onClick={() => navigate("/tickets")}
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
                  <td className="py-3 px-4">
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                      {ticket.statusId ? "Active" : "New"}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-500">
                    {new Date(ticket.createdAt ?? new Date()).toLocaleDateString()}
                  </td>
                </tr>
              )) || (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-gray-400 text-sm">
                    No tickets yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
