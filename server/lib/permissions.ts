import { getSupabaseAdmin } from "./supabase.js";
import type { Profile, UnifiedUser } from "./db-types.js";

/**
 * Every feature that can be granted to (or revoked from) a specific user.
 * Keep this list in sync with src/lib/permissions.ts.
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

const PERMISSION_KEY_SET = new Set<string>(PERMISSION_KEYS);

export function isPermissionKey(value: string): value is PermissionKey {
  return PERMISSION_KEY_SET.has(value);
}

/**
 * Role-based defaults. These reproduce the behaviour the app had before the
 * per-user permission table existed, so nothing changes until an override is
 * saved from the Users & Access page.
 */
export function defaultPermissions(profile: Profile): PermissionMap {
  const isAdmin = profile.role === "admin";
  const isMainAdmin = isAdmin && !profile.adminRole;
  const isBranch = profile.role === "branch";
  const isTransfer = profile.role === "transfer";
  const monitorsDepartment = isTransfer && !!profile.monitorRole;
  const hasStationary = isTransfer && !!profile.stationaryAccess;

  return {
    raise_ticket: !!profile.canRaiseTicket,
    view_department_tickets: isAdmin || monitorsDepartment,
    stationary_order: isAdmin || isBranch || hasStationary,
    stationary_admin:
      isMainAdmin || (isAdmin && profile.adminRole === "Stationary Admin") || hasStationary,
    reports: isAdmin,
    audit_log: isMainAdmin,
    manage_users: isMainAdmin,
    manage_departments: isMainAdmin,
    manage_settings: isMainAdmin,
    email_notifications: isAdmin || monitorsDepartment,
  };
}

/** Explicit overrides stored in public.user_permissions for one user. */
export async function getExplicitPermissions(
  userId: string
): Promise<Partial<PermissionMap>> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("user_permissions")
    .select("permission, granted")
    .eq("userId", userId);

  const overrides: Partial<PermissionMap> = {};
  for (const row of (data ?? []) as { permission: string; granted: boolean }[]) {
    if (isPermissionKey(row.permission)) overrides[row.permission] = !!row.granted;
  }
  return overrides;
}

/** Explicit overrides for many users, loaded in one query. */
export async function getExplicitPermissionsFor(
  userIds: string[]
): Promise<Map<string, Partial<PermissionMap>>> {
  const result = new Map<string, Partial<PermissionMap>>();
  if (!userIds.length) return result;

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("user_permissions")
    .select("userId, permission, granted")
    .in("userId", userIds);

  for (const row of (data ?? []) as {
    userId: string;
    permission: string;
    granted: boolean;
  }[]) {
    if (!isPermissionKey(row.permission)) continue;
    const existing = result.get(row.userId) ?? {};
    existing[row.permission] = !!row.granted;
    result.set(row.userId, existing);
  }
  return result;
}

export function mergePermissions(
  defaults: PermissionMap,
  overrides: Partial<PermissionMap>
): PermissionMap {
  return { ...defaults, ...overrides };
}

export async function getEffectivePermissions(
  profile: Profile
): Promise<PermissionMap> {
  const overrides = await getExplicitPermissions(profile.id);
  return mergePermissions(defaultPermissions(profile), overrides);
}

/** Effective permissions for a batch of profiles (used by email routing). */
export async function getEffectivePermissionsFor(
  profiles: Profile[]
): Promise<Map<string, PermissionMap>> {
  const overrides = await getExplicitPermissionsFor(profiles.map((p) => p.id));
  const map = new Map<string, PermissionMap>();
  for (const profile of profiles) {
    map.set(
      profile.id,
      mergePermissions(defaultPermissions(profile), overrides.get(profile.id) ?? {})
    );
  }
  return map;
}

/** Department / role bucket a user belongs to (null when not scoped). */
export function getProfileDepartment(profile: Profile): string | null {
  if (profile.role === "admin") return profile.adminRole ?? null;
  if (profile.role === "branch") return profile.branchRole ?? null;
  if (profile.role === "transfer") return profile.monitorRole ?? null;
  return null;
}

export function getUserDepartment(user: UnifiedUser): string | null {
  if (user.type === "admin") return user.adminRole ?? null;
  if (user.type === "branch") return user.branchRole ?? null;
  if (user.type === "transfer") return user.monitorRole ?? null;
  return null;
}

export function hasPermission(
  permissions: PermissionMap | undefined,
  key: PermissionKey
): boolean {
  return !!permissions?.[key];
}
