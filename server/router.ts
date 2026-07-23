import { authRouter } from "./auth-router.js";
import { branchUserRouter } from "./branch-user-router.js";
import { branchRouter } from "./branch-router.js";
import { clusterRouter } from "./cluster-router.js";
import { ticketRouter } from "./ticket-router.js";
import { ticketCommentRouter } from "./ticket-comment-router.js";
import { ticketTimelineRouter } from "./ticket-timeline-router.js";
import { ticketStatusRouter } from "./ticket-status-router.js";
import { ticketCategoryRouter } from "./ticket-category-router.js";
import { ticketPriorityRouter } from "./ticket-priority-router.js";
import { notificationRouter } from "./notification-router.js";
import { auditLogRouter } from "./audit-log-router.js";
import { settingsRouter } from "./settings-router.js";
import { dashboardRouter } from "./dashboard-router.js";
import { reportRouter } from "./report-router.js";
import { stationaryRouter } from "./stationary-router.js";
import { googleAuthRouter } from "./google-auth-router.js";
import { createRouter, publicQuery } from "./middleware.js";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  branchUser: branchUserRouter,
  branch: branchRouter,
  cluster: clusterRouter,
  ticket: ticketRouter,
  ticketComment: ticketCommentRouter,
  ticketTimeline: ticketTimelineRouter,
  ticketStatus: ticketStatusRouter,
  ticketCategory: ticketCategoryRouter,
  ticketPriority: ticketPriorityRouter,
  notification: notificationRouter,
  auditLog: auditLogRouter,
  settings: settingsRouter,
  dashboard: dashboardRouter,
  report: reportRouter,
  stationary: stationaryRouter,
  googleAuth: googleAuthRouter,
});

export type AppRouter = typeof appRouter;
