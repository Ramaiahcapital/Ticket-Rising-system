import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import {
  PERMISSION_GROUPS,
  ALL_PERMISSIONS,
  ACCOUNT_ROLE_LABELS,
  type PermissionKey,
} from "@/lib/permissions";
import {
  Bell,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  Users,
  X,
  XCircle,
} from "lucide-react";

const ROLE_CLS: Record<string, string> = {
  admin: "bg-blue-50 text-blue-700",
  branch: "bg-emerald-50 text-emerald-700",
  cluster: "bg-purple-50 text-purple-700",
  transfer: "bg-amber-50 text-amber-700",
};

const ACCESS_CHIPS: { key: PermissionKey; label: string }[] = [
  { key: "raise_ticket", label: "Tickets" },
  { key: "stationary_order", label: "Ordering" },
  { key: "stationary_admin", label: "Stationary" },
  { key: "view_department_tickets", label: "Dept." },
  { key: "email_notifications", label: "Email" },
];

type PermissionMap = Record<string, boolean>;

type DirectoryUser = {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  role: string;
  accountType: string;
  department: string | null;
  adminRole: string | null;
  branchRole: string | null;
  monitorRole: string | null;
  branchName: string | null;
  branchCode: string | null;
  clusterName: string | null;
  isMainAdmin: boolean;
  isActive: boolean;
  permissions: PermissionMap;
  defaults: PermissionMap;
  overrides: PermissionMap;
  lastLoginAt?: string | null;
};

type NotificationForm = {
  enabled: boolean;
  mode: "department" | "all" | "custom";
  recipients: string;
};

type NotificationSettingsData = {
  enabled: boolean;
  mode: "department" | "all" | "custom";
  customRecipients: string[];
};

function defaultPermissionMap(defaults: PermissionMap): Record<PermissionKey, boolean> {
  return ALL_PERMISSIONS.reduce((acc, permission) => {
    acc[permission.key] = !!defaults[permission.key];
    return acc;
  }, {} as Record<PermissionKey, boolean>);
}

function permissionMapOf(permissions: PermissionMap): Record<PermissionKey, boolean> {
  return ALL_PERMISSIONS.reduce((acc, permission) => {
    acc[permission.key] = !!permissions[permission.key];
    return acc;
  }, {} as Record<PermissionKey, boolean>);
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  icon: typeof Users;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-800">{value}</p>
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function NotificationSettingsCard({ initial }: { initial: NotificationSettingsData }) {
  const utils = trpc.useUtils();

  const [form, setForm] = useState<NotificationForm>({
    enabled: initial.enabled,
    mode: initial.mode,
    recipients: initial.customRecipients.join("\n"),
  });
  const [saved, setSaved] = useState(false);

  const updateNotifications = trpc.settings.updateTicketNotifications.useMutation({
    onSuccess: () => {
      setSaved(true);
      utils.settings.getTicketNotifications.invalidate();
      window.setTimeout(() => setSaved(false), 2500);
    },
    onError: (e) => alert(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateNotifications.mutate({
      enabled: form.enabled,
      mode: form.mode,
      customRecipients: form.recipients
        .split(/[\n,;]+/)
        .map((value) => value.trim())
        .filter(Boolean),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600">
          <Bell className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-gray-800">New-ticket email routing</h2>
          <p className="text-sm text-gray-500">Choose who is emailed whenever a new ticket is created.</p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
          className="h-4 w-4 rounded text-red-600"
        />
        Send an email when a new ticket is created
      </label>

      <div className="grid gap-3 md:grid-cols-3">
        {(
          [
            {
              value: "department" as const,
              title: "Department admins",
              description: "Notify the admins and monitors responsible for the ticket's department.",
            },
            {
              value: "all" as const,
              title: "All users",
              description: "Notify every active user who has new-ticket emails enabled.",
            },
            {
              value: "custom" as const,
              title: "Custom recipients",
              description: "Send only to the email addresses listed below.",
            },
          ]
        ).map((option) => (
          <button
            type="button"
            key={option.value}
            onClick={() => setForm((f) => ({ ...f, mode: option.value }))}
            className={`rounded-lg border p-3 text-left transition-colors ${
              form.mode === option.value ? "border-red-400 bg-red-50" : "border-gray-200 hover:bg-gray-50"
            }`}
          >
            <p className="text-sm font-medium text-gray-800">{option.title}</p>
            <p className="mt-1 text-xs text-gray-500">{option.description}</p>
          </button>
        ))}
      </div>

      {form.mode === "custom" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Custom recipients (one email per line or comma separated)
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <textarea
              value={form.recipients}
              onChange={(e) => setForm((f) => ({ ...f, recipients: e.target.value }))}
              rows={3}
              placeholder="ops@example.com, manager@example.com"
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-red-500"
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={updateNotifications.isPending}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {updateNotifications.isPending ? "Saving…" : "Save email routing"}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" /> Saved
          </span>
        )}
      </div>
    </form>
  );
}

export default function AllUsersPage() {
  const utils = trpc.useUtils();
  const { user: authUser, isMainAdmin } = useAuth();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [accessFilter, setAccessFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const limit = 20;

  const { data, isLoading } = trpc.userDirectory.list.useQuery({
    page,
    limit,
    search: search.trim() || undefined,
    role: roleFilter as "all" | "admin" | "branch" | "cluster" | "transfer",
    department: departmentFilter === "all" ? undefined : departmentFilter,
    access: accessFilter,
    status: statusFilter as "all" | "active" | "inactive",
  });

  const rows = (data?.items ?? []) as DirectoryUser[];
  const departments = data?.departments ?? [];
  const stats = data?.stats;

  // ---- Manage dialog -------------------------------------------------------
  const [managing, setManaging] = useState<DirectoryUser | null>(null);
  const [manageDepartment, setManageDepartment] = useState("");
  const [managePermissions, setManagePermissions] = useState<Record<PermissionKey, boolean>>(
    defaultPermissionMap({})
  );
  const [manageError, setManageError] = useState("");
  const [saving, setSaving] = useState(false);

  // ---- Add transfer user dialog -------------------------------------------
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    email: "",
    password: "",
    monitorRole: "",
    stationaryAccess: false,
    isActive: true,
  });
  const [addError, setAddError] = useState("");

  // ---- Password / delete state --------------------------------------------
  const [tempPassword, setTempPassword] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const assignDepartment = trpc.userDirectory.assignDepartment.useMutation({
    onError: (e) => setManageError(e.message),
  });
  const setPermissions = trpc.userDirectory.setPermissions.useMutation({
    onError: (e) => setManageError(e.message),
  });
  const resetPermissions = trpc.userDirectory.resetPermissions.useMutation({
    onError: (e) => setManageError(e.message),
  });
  const toggleActive = trpc.userDirectory.toggleActive.useMutation({
    onSuccess: () => utils.userDirectory.list.invalidate(),
    onError: (e) => alert(e.message),
  });
  const resetPassword = trpc.userDirectory.resetPassword.useMutation({
    onSuccess: (result) => setTempPassword(result.password),
    onError: (e) => alert(e.message),
  });
  const deleteUser = trpc.userDirectory.deleteUser.useMutation({
    onSuccess: () => utils.userDirectory.list.invalidate(),
    onError: (e) => alert(e.message),
  });
  const createTransfer = trpc.transferUser.create.useMutation({
    onSuccess: () => {
      setShowAdd(false);
      setAddForm({
        name: "",
        email: "",
        password: "",
        monitorRole: "",
        stationaryAccess: false,
        isActive: true,
      });
      utils.userDirectory.list.invalidate();
      utils.transferUser.list.invalidate();
    },
    onError: (e) => setAddError(e.message),
  });

  // ---- New-ticket email routing ------------------------------------------
  const { data: notificationSettings } = trpc.settings.getTicketNotifications.useQuery(
    undefined,
    { enabled: isMainAdmin }
  );

  const departmentNames = new Set(departments.map((d) => d.name));
  if (managing?.department) departmentNames.add(managing.department);
  const departmentOptions = Array.from(departmentNames).sort((a, b) => a.localeCompare(b));

  const openManage = (row: DirectoryUser) => {
    setManaging(row);
    setManageError("");
    setManageDepartment(row.department ?? "");
    setManagePermissions(permissionMapOf(row.permissions));
  };

  const closeManage = () => {
    setManaging(null);
    setManageError("");
  };

  const refreshAfterManage = async () => {
    await utils.userDirectory.list.invalidate();
  };

  const handleSaveManage = async () => {
    if (!managing) return;
    setManageError("");
    setSaving(true);
    try {
      const currentDepartment = managing.department ?? null;
      const nextDepartment = manageDepartment.trim() || null;
      if (currentDepartment !== nextDepartment) {
        await assignDepartment.mutateAsync({
          id: managing.id,
          department: nextDepartment,
        });
      }

      // Only persist values that differ from the role defaults; everything else
      // is sent as null so the user follows the (dynamic) default again.
      const payload: Record<string, boolean | null> = {};
      let hasChanges = false;
      for (const permission of ALL_PERMISSIONS) {
        const key = permission.key;
        const nextValue = managePermissions[key];
        const defaultValue = !!managing.defaults[key];
        const override = managing.overrides[key];
        const nextOverride = nextValue === defaultValue ? null : nextValue;
        const currentOverride = override === undefined ? null : !!override;
        payload[key] = nextOverride;
        if (nextOverride !== currentOverride) hasChanges = true;
      }
      if (hasChanges) {
        await setPermissions.mutateAsync({ id: managing.id, permissions: payload });
      }

      await refreshAfterManage();
      closeManage();
    } catch {
      // errors are surfaced through the mutation onError handlers
    } finally {
      setSaving(false);
    }
  };

  const handleResetPermissions = async () => {
    if (!managing) return;
    if (!confirm(`Reset ${managing.name} back to the role defaults?`)) return;
    setManageError("");
    try {
      await resetPermissions.mutateAsync({ id: managing.id });
      setManagePermissions(defaultPermissionMap(managing.defaults));
      await refreshAfterManage();
    } catch {
      // handled by onError
    }
  };

  const handleToggleActive = (row: DirectoryUser) => {
    setBusyId(row.id);
    toggleActive.mutate(
      { id: row.id },
      {
        onSuccess: (result) => {
          setManaging((current) =>
            current && current.id === row.id ? { ...current, isActive: result.isActive } : current
          );
        },
        onSettled: () => setBusyId(null),
      }
    );
  };

  const handleDelete = (row: DirectoryUser) => {
    if (!confirm(`Delete "${row.name}"? This cannot be undone.`)) return;
    setBusyId(row.id);
    deleteUser.mutate(
      { id: row.id },
      {
        onSuccess: () => {
          if (managing?.id === row.id) closeManage();
        },
        onSettled: () => setBusyId(null),
      }
    );
  };

  const handleResetPassword = (row: DirectoryUser) => {
    if (!confirm(`Generate a new temporary password for "${row.name}"?`)) return;
    setBusyId(row.id);
    resetPassword.mutate({ id: row.id }, { onSettled: () => setBusyId(null) });
  };

  const handleAddTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    setAddError("");
    if (!addForm.name.trim()) return setAddError("Name is required");
    if (!addForm.email.trim()) return setAddError("Email is required");
    if (addForm.password.length < 6) {
      return setAddError("Password must be at least 6 characters");
    }
    createTransfer.mutate({
      name: addForm.name.trim(),
      email: addForm.email.trim(),
      password: addForm.password,
      isActive: addForm.isActive,
      stationaryAccess: addForm.stationaryAccess,
      monitorRole: addForm.monitorRole || null,
    });
  };

  const totalPages = data?.totalPages ?? 1;

  const updateFilter = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Users &amp; Access</h1>
          <p className="mt-1 text-sm text-gray-500">
            Every account in one place — assign departments, grant portal access and
            control who receives new-ticket emails.
          </p>
        </div>
        <button
          onClick={() => {
            setAddError("");
            setShowAdd(true);
          }}
          className="flex items-center gap-2 self-start rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
        >
          <Plus className="h-4 w-4" /> Add Transfer User
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total users" value={stats?.total ?? 0} icon={Users} tone="bg-gray-100 text-gray-600" />
        <StatCard label="Active" value={stats?.active ?? 0} icon={CheckCircle2} tone="bg-green-50 text-green-600" />
        <StatCard
          label="Can raise tickets"
          value={stats?.raiseTicket ?? 0}
          icon={ShieldCheck}
          tone="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Stationary admin"
          value={stats?.stationaryAdmin ?? 0}
          icon={Shield}
          tone="bg-amber-50 text-amber-600"
        />
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-3">
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-600">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => updateFilter(setSearch)(e.target.value)}
              placeholder="Name, email, branch, department"
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-red-500"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Account type</label>
          <select
            value={roleFilter}
            onChange={(e) => updateFilter(setRoleFilter)(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">All types</option>
            <option value="admin">Admin</option>
            <option value="branch">Branch</option>
            <option value="cluster">Cluster</option>
            <option value="transfer">Transfer</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Department</label>
          <select
            value={departmentFilter}
            onChange={(e) => updateFilter(setDepartmentFilter)(e.target.value)}
            className="max-w-[200px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">All departments</option>
            {departments.map((department) => (
              <option key={department.name} value={department.name}>
                {department.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Access</label>
          <select
            value={accessFilter}
            onChange={(e) => updateFilter(setAccessFilter)(e.target.value)}
            className="max-w-[190px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">Any access</option>
            {ALL_PERMISSIONS.map((permission) => (
              <option key={permission.key} value={permission.key}>
                {permission.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => updateFilter(setStatusFilter)(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">User</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Department / scope</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Access</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10">
                    <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading users
                    </div>
                  </td>
                </tr>
              ) : !rows.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                    No users match your filters
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-50 transition-colors hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-800">{row.name}</p>
                      <p className="text-xs text-gray-500">{row.email || row.username || "-"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          ROLE_CLS[row.role] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {row.isMainAdmin ? "Main Admin" : ACCOUNT_ROLE_LABELS[row.role] ?? row.accountType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {row.role === "cluster"
                        ? row.clusterName || "-"
                        : row.department || (row.isMainAdmin ? "All departments" : "-")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {ACCESS_CHIPS.map((chip) =>
                          row.permissions[chip.key] ? (
                            <span
                              key={chip.key}
                              className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600"
                            >
                              {chip.label}
                            </span>
                          ) : null
                        )}
                        {!ACCESS_CHIPS.some((chip) => row.permissions[chip.key]) && (
                          <span className="text-xs text-gray-400">No access</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {row.isActive ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                          <XCircle className="h-3.5 w-3.5" /> Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openManage(row)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                          title="Manage access"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleResetPassword(row)}
                          disabled={busyId === row.id}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-amber-50 hover:text-amber-600 disabled:opacity-40"
                          title="Reset password"
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleToggleActive(row)}
                          disabled={busyId === row.id || row.id === authUser?.id}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
                          title={row.isActive ? "Deactivate" : "Activate"}
                        >
                          {row.isActive ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <XCircle className="h-4 w-4" />
                          )}
                        </button>
                        {!row.isMainAdmin && (
                          <button
                            onClick={() => handleDelete(row)}
                            disabled={busyId === row.id || row.id === authUser?.id}
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                            title="Delete user"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-2 border-t border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-500">
            Showing {rows.length} of {data?.total ?? 0} users
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-xs text-gray-500">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {isMainAdmin && notificationSettings && (
        <NotificationSettingsCard
          key={`${notificationSettings.enabled}|${notificationSettings.mode}|${notificationSettings.customRecipients.join(",")}`}
          initial={notificationSettings}
        />
      )}

      {/* Manage user dialog */}
      {managing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closeManage} />
          <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 p-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Manage access</h2>
                <p className="text-sm text-gray-500">
                  {managing.name} · {managing.email || managing.username}
                </p>
              </div>
              <button onClick={closeManage} className="rounded-lg p-1 hover:bg-gray-100">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {manageError && (
                <p className="rounded bg-red-50 p-2 text-sm text-red-600">{manageError}</p>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  {managing.role === "admin"
                    ? "Admin role / department"
                    : managing.role === "transfer"
                      ? "Monitored department"
                      : "Department"}
                </label>
                {managing.role === "cluster" ? (
                  <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500">
                    Cluster users are scoped to {managing.clusterName || "their cluster"}. Edit it
                    from Cluster Management.
                  </p>
                ) : (
                  <select
                    value={manageDepartment}
                    onChange={(e) => setManageDepartment(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                  >
                    {managing.role === "admin" && (
                      <option value="">Main Admin (all departments)</option>
                    )}
                    {!(managing.role === "admin") && (
                      <option value="">No department</option>
                    )}
                    {managing.role === "admin" && (
                      <option value="Stationary Admin">Stationary Admin</option>
                    )}
                    {departmentOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="rounded-lg border border-gray-200">
                <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Portal access
                  </p>
                  <button
                    type="button"
                    onClick={handleResetPermissions}
                    className="text-xs font-medium text-red-600 hover:underline"
                  >
                    Reset to defaults
                  </button>
                </div>
                <div className="space-y-4 p-4">
                  {PERMISSION_GROUPS.map((group) => (
                    <div key={group.label}>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        {group.label}
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {group.permissions.map((permission) => {
                          const key = permission.key;
                          const isDefault = managePermissions[key] === !!managing.defaults[key];
                          return (
                            <label
                              key={key}
                              className="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-100 p-2 hover:bg-gray-50"
                            >
                              <input
                                type="checkbox"
                                checked={managePermissions[key]}
                                onChange={(e) =>
                                  setManagePermissions((state) => ({
                                    ...state,
                                    [key]: e.target.checked,
                                  }))
                                }
                                className="mt-0.5 h-4 w-4 rounded text-red-600"
                              />
                              <span>
                                <span className="block text-sm font-medium text-gray-700">
                                  {permission.label}
                                  {!isDefault && (
                                    <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                                      custom
                                    </span>
                                  )}
                                </span>
                                <span className="block text-xs text-gray-500">
                                  {permission.description}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
                <button
                  type="button"
                  onClick={() => handleToggleActive(managing)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  {managing.isActive ? "Deactivate account" : "Activate account"}
                </button>
                <button
                  type="button"
                  onClick={() => handleResetPassword(managing)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Reset password
                </button>
                {!managing.isMainAdmin && managing.id !== authUser?.id && (
                  <button
                    type="button"
                    onClick={() => handleDelete(managing)}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Delete user
                  </button>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-200 p-4">
              <button
                onClick={closeManage}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveManage}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add transfer user dialog */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAdd(false)} />
          <div className="relative w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 p-5">
              <h2 className="text-lg font-semibold text-gray-800">Add transfer user</h2>
              <button
                onClick={() => setShowAdd(false)}
                className="rounded-lg p-1 hover:bg-gray-100"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleAddTransfer} className="space-y-4 p-5">
              {addError && (
                <p className="rounded bg-red-50 p-2 text-sm text-red-600">{addError}</p>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Name *</label>
                <input
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Email *</label>
                <input
                  type="email"
                  value={addForm.email}
                  onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Temporary password *
                </label>
                <input
                  type="password"
                  value={addForm.password}
                  onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Monitored department (optional)
                </label>
                <select
                  value={addForm.monitorRole}
                  onChange={(e) => setAddForm({ ...addForm, monitorRole: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">None</option>
                  {departments.map((department) => (
                    <option key={department.name} value={department.name}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={addForm.stationaryAccess}
                  onChange={(e) =>
                    setAddForm({ ...addForm, stationaryAccess: e.target.checked })
                  }
                  className="h-4 w-4 rounded text-red-600"
                />
                Give stationary portal access
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={addForm.isActive}
                  onChange={(e) => setAddForm({ ...addForm, isActive: e.target.checked })}
                  className="h-4 w-4 rounded text-red-600"
                />
                Active
              </label>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createTransfer.isPending}
                  className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {createTransfer.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create user
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Temporary password dialog */}
      {tempPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setTempPassword("")} />
          <div className="relative w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-gray-800">Password reset</h3>
            <p className="mb-3 text-sm text-gray-600">New temporary password:</p>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center font-mono text-sm">
              {tempPassword}
            </div>
            <p className="mt-3 text-xs text-amber-600">
              Share this password securely with the user. They can change it after signing in.
            </p>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setTempPassword("")}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
