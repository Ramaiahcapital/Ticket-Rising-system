import { createRouter, authedQuery } from "./middleware.js";
import type { UnifiedUser } from "./lib/db-types.js";
import type { PermissionMap } from "./lib/permissions.js";

export type MeResponse = UnifiedUser & {
  /** Effective feature permissions (role defaults + per-user overrides). */
  permissions: PermissionMap;
  /** Effective value, kept in sync with permissions.raise_ticket. */
  canRaiseTicket: boolean;
  /** Effective value, kept in sync with permissions.stationary_order. */
  stationaryAccess: boolean;
};

export const authRouter = createRouter({
  me: authedQuery.query((opts): MeResponse => {
    if (!opts.ctx.user) {
      throw new Error("Not authenticated");
    }

    const permissions = opts.ctx.permissions ?? ({} as PermissionMap);

    return {
      ...opts.ctx.user,
      permissions,
      canRaiseTicket: !!permissions.raise_ticket,
      stationaryAccess: !!permissions.stationary_order,
    } as MeResponse;
  }),
  logout: authedQuery.mutation(() => {
    return { success: true };
  }),
});
