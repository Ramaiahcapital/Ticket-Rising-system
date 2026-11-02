/**
 * Frontend mirror of server/lib/permissions.ts.
 * Keep the keys in sync with the server catalogue.
 */
export const PERMISSION_KEYS = [
  "raise_ticket",
  "view_department_tickets",
  "stationary_order",
  "stationary_admin",
  "reports",
  "audit_log",
  "manage_users",
  "manage_departments",
  "manage_settings",
  "email_notifications",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export type PermissionMap = Record<PermissionKey, boolean>;

export type PermissionDefinition = {
  key: PermissionKey;
  label: string;
  description: string;
};

export type PermissionGroup = {
  label: string;
  permissions: PermissionDefinition[];
};

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    label: "Tickets",
    permissions: [
      {
        key: "raise_ticket",
        label: "Raise tickets",
        description: "Create new support tickets from the portal.",
      },
      {
        key: "view_department_tickets",
        label: "Department tickets",
        description:
          "View tickets routed to the user's department (branch managers, monitors).",
      },
    ],
  },
  {
    label: "Stationary",
    permissions: [
      {
        key: "stationary_order",
        label: "Order stationary",
        description: "Open the stationary portal and place branch orders.",
      },
      {
        key: "stationary_admin",
        label: "Stationary admin",
        description:
          "Manage stationary items, orders, approvals and reports.",
      },
    ],
  },
  {
    label: "Administration",
    permissions: [
      {
        key: "reports",
        label: "Reports",
        description: "Generate and export ticket reports.",
      },
      {
        key: "audit_log",
        label: "Audit log",
        description: "View the system audit trail.",
      },
      {
        key: "manage_users",
        label: "Manage users",
        description:
          "Open Users & Access, assign departments and change permissions.",
      },
      {
        key: "manage_departments",
        label: "Manage departments",
        description: "Create and edit branch roles / departments.",
      },
      {
        key: "manage_settings",
        label: "Manage settings",
        description: "Change ticket, status, category and system settings.",
      },
    ],
  },
  {
    label: "Notifications",
    permissions: [
      {
        key: "email_notifications",
        label: "New ticket emails",
        description: "Receive an email whenever a new ticket is created.",
      },
    ],
  },
];

export const ALL_PERMISSIONS: PermissionDefinition[] = PERMISSION_GROUPS.flatMap(
  (group) => group.permissions
);

export function permissionLabel(key: string): string {
  return ALL_PERMISSIONS.find((p) => p.key === key)?.label ?? key;
}

export const ACCOUNT_ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  branch: "Branch",
  cluster: "Cluster",
  transfer: "Transfer",
};
