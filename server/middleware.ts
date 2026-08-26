import { ErrorMessages } from "../contracts/constants.js";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context.js";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const createRouter = t.router;
export const publicQuery = t.procedure;

const requireAuth = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: ErrorMessages.unauthenticated,
    });
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

function requireRole(role: string) {
  return t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== role) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: ErrorMessages.insufficientRole,
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

export const authedQuery = t.procedure.use(requireAuth);
export const adminQuery = authedQuery.use(requireRole("admin"));
export const clusterQuery = authedQuery.use(requireRole("cluster"));
export const transferQuery = authedQuery.use(requireRole("transfer"));

// Admin OR transfer user with stationary portal access.
const requireStationaryAccess = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: ErrorMessages.unauthenticated });
  if (ctx.user.role === "admin") return next({ ctx: { ...ctx, user: ctx.user } });
  if (ctx.user.role === "transfer" && (ctx.user as any).stationaryAccess) {
    return next({ ctx: { ...ctx, user: ctx.user } });
  }
  throw new TRPCError({ code: "FORBIDDEN", message: ErrorMessages.insufficientRole });
});
export const stationaryAdminQuery = authedQuery.use(requireStationaryAccess);

// Main admins (role "admin", no adminRole bucket) only.
// Sub-admins are still type "admin" but are scoped to their bucket.
const requireMainAdmin = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user || ctx.user.type !== "admin" || !!ctx.user.adminRole) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: ErrorMessages.insufficientRole,
    });
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const mainAdminQuery = adminQuery.use(requireMainAdmin);
