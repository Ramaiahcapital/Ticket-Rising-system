import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { getSupabaseAdmin } from "./lib/supabase.js";
import { mapProfileToUnifiedUser, type Profile, type UnifiedUser } from "./lib/db-types.js";
import { getEffectivePermissions, type PermissionMap } from "./lib/permissions.js";
import {
  getEffectiveTicketAccess,
  type TicketAccessConfig,
} from "./lib/ticket-access.js";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: UnifiedUser;
  /** Effective feature permissions for the signed-in user. */
  permissions?: PermissionMap;
  /** Effective, per-department ticket visibility and editing rights. */
  ticketAccess?: TicketAccessConfig;
};

async function loadProfileByAuthId(
  authId: string
): Promise<{
  user: UnifiedUser;
  permissions: PermissionMap;
  ticketAccess: TicketAccessConfig;
} | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", authId)
    .maybeSingle();

  if (error || !data) return null;

  const profile = data as Profile;
  const permissions = await getEffectivePermissions(profile);
  return {
    user: mapProfileToUnifiedUser(profile),
    permissions,
    ticketAccess: await getEffectiveTicketAccess(profile, permissions),
  };
}

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const ctx: TrpcContext = { req: opts.req, resHeaders: opts.resHeaders };

  const authHeader = opts.req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (token) {
    try {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase.auth.getUser(token);
      if (data.user) {
        const loaded = await loadProfileByAuthId(data.user.id);
        if (loaded) {
          ctx.user = loaded.user;
          ctx.permissions = loaded.permissions;
          ctx.ticketAccess = loaded.ticketAccess;
        }
      }
    } catch {
      // Invalid token; leave user unauthenticated
    }
  }

  return ctx;
}
