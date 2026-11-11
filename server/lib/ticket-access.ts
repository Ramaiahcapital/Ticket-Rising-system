import { getSupabaseAdmin } from "./supabase.js";
import type { Profile } from "./db-types.js";
import type { PermissionMap } from "./permissions.js";

/**
 * Granular ticket access.
 *
 * Every user can be given access to specific departments:
 *   view = tickets routed to the department appear, but are read-only
 *   edit = tickets appear and can be acted on (reply, status, assignment, ...)
 *   none = explicitly hide tickets from that department
 *
 * Rows in public.user_ticket_access are *overrides*. When a user has no row
 * for a department we fall back to the role-based defaults below, so the
 * existing behaviour is preserved until the Super Admin changes something.
 */
export const ALL_DEPARTMENTS_KEY = "*";

export type TicketAccessLevel = "none" | "view" | "edit";

export type TicketAccessConfig = {
  /** Access that applies to every department. null = no explicit default. */
  all: TicketAccessLevel | null;
  /** Explicit per-department access levels. */
  departments: Record<string, TicketAccessLevel>;
};

export type TicketAccessRow = {
  department: string;
  level: TicketAccessLevel;
};

export function emptyTicketAccess(): TicketAccessConfig {
  return { all: null, departments: {} };
}

/**
 * Role-based defaults, matching the access rules the app had before this
 * feature existed:
 *   - main admin: every department, full edit
 *   - sub-admin: their own department, full edit
 *   - branch with "department tickets": own department, view only
 *   - transfer monitor with "department tickets": monitored department, view only
 */
export function defaultTicketAccess(
  profile: Profile,
  permissions: PermissionMap
): TicketAccessConfig {
  const viewDepartmentTickets = !!permissions.view_department_tickets;

  if (profile.role === "admin") {
    if (!profile.adminRole) return { all: "edit", departments: {} };
    return { all: null, departments: { [profile.adminRole]: "edit" } };
  }

  if (profile.role === "branch") {
    if (viewDepartmentTickets && profile.branchRole) {
      return { all: null, departments: { [profile.branchRole]: "view" } };
    }
    return emptyTicketAccess();
  }

  if (profile.role === "transfer") {
    if (viewDepartmentTickets && profile.monitorRole) {
      return { all: null, departments: { [profile.monitorRole]: "view" } };
    }
    return emptyTicketAccess();
  }

  return emptyTicketAccess();
}

export function mergeTicketAccess(
  defaults: TicketAccessConfig,
  explicit: TicketAccessConfig
): TicketAccessConfig {
  return {
    all: explicit.all ?? defaults.all,
    departments: { ...defaults.departments, ...explicit.departments },
  };
}

function rowsToConfig(rows: TicketAccessRow[]): TicketAccessConfig {
  const config = emptyTicketAccess();
  for (const row of rows) {
    if (row.department === ALL_DEPARTMENTS_KEY) {
      config.all = row.level;
    } else {
      config.departments[row.department] = row.level;
    }
  }
  return config;
}

/** Explicit overrides stored in public.user_ticket_access. */
export async function getExplicitTicketAccess(
  userId: string
): Promise<TicketAccessConfig> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("user_ticket_access")
    .select("department, level")
    .eq("userId", userId);

  // The table may not have been created yet on an older deployment. Falling
  // back to role defaults keeps the app usable until the migration is run.
  if (error || !data) return emptyTicketAccess();
  return rowsToConfig(data as TicketAccessRow[]);
}

/** Explicit overrides for many users, loaded in one query. */
export async function getExplicitTicketAccessFor(
  userIds: string[]
): Promise<Map<string, TicketAccessConfig>> {
  const result = new Map<string, TicketAccessConfig>();
  if (!userIds.length) return result;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("user_ticket_access")
    .select("userId, department, level")
    .in("userId", userIds);

  if (error || !data) return result;

  const grouped = new Map<string, TicketAccessRow[]>();
  for (const row of data as (TicketAccessRow & { userId: string })[]) {
    const list = grouped.get(row.userId) ?? [];
    list.push({ department: row.department, level: row.level });
    grouped.set(row.userId, list);
  }
  for (const [userId, rows] of grouped) {
    result.set(userId, rowsToConfig(rows));
  }
  return result;
}

export async function getEffectiveTicketAccess(
  profile: Profile,
  permissions: PermissionMap
): Promise<TicketAccessConfig> {
  const explicit = await getExplicitTicketAccess(profile.id);
  return mergeTicketAccess(defaultTicketAccess(profile, permissions), explicit);
}

/** Access level for one department after overrides are applied. */
export function departmentAccess(
  config: TicketAccessConfig | undefined,
  department: string | null | undefined
): TicketAccessLevel {
  if (!config) return "none";
  if (department) {
    const explicit = config.departments[department];
    if (explicit !== undefined) return explicit;
  }
  if (config.all !== null) return config.all;
  return "none";
}

/** True when the user can see every department. */
export function hasAllDepartmentAccess(config: TicketAccessConfig | undefined): boolean {
  return config?.all === "view" || config?.all === "edit";
}

/** Departments with any (view or edit) access. */
export function visibleDepartments(config: TicketAccessConfig | undefined): string[] {
  if (!config) return [];
  return Object.entries(config.departments)
    .filter(([, level]) => level !== "none")
    .map(([department]) => department);
}

export function canViewDepartment(
  config: TicketAccessConfig | undefined,
  department: string | null | undefined
): boolean {
  return departmentAccess(config, department) !== "none";
}

export function canEditDepartment(
  config: TicketAccessConfig | undefined,
  department: string | null | undefined
): boolean {
  return departmentAccess(config, department) === "edit";
}
