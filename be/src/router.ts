import { Router } from "express";
import { env } from "./core/config";
import { runtimeConfig } from "./core/config/runtime-config";
import { MODULES } from "./core/constants/modules";
import { redis } from "./infrastructure/redis";
import { prisma } from "./infrastructure/database";
import { getQueue } from "./infrastructure/queue";
import authRoutes from "./modules/auth/auth.routes";
import userRoutes from "./modules/users/user.routes";
import meRoutes from "./modules/users/me.routes";
import auditLogRoutes from "./modules/audit-log/audit-log.routes";
import capabilitiesRoutes from "./modules/capabilities/capabilities.routes";
import assetsRoutes from "./modules/assets/assets.routes";
import devicesRoutes from "./modules/devices/devices.routes";
import notificationsRoutes from "./modules/notifications/notifications.routes";
import adminOverviewRoutes from "./modules/admin-overview/admin-overview.routes";
import adminJobsRoutes from "./modules/admin-jobs/admin-jobs.routes";
import adminStorageRoutes from "./modules/admin-storage/admin-storage.routes";
import adminPushRoutes from "./modules/admin-push/admin-push.routes";
import presenceRoutes from "./modules/presence/presence.routes";
import systemConfigRoutes from "./modules/system-config/system-config.routes";
import workspacesRoutes from "./modules/workspaces/workspaces.routes";
import adminWorkspacesRoutes from "./modules/workspaces/admin-workspaces.routes";
import membersRoutes from "./modules/members/members.routes";
import invitesRoutes from "./modules/members/invites.routes";
import invitationsRoutes from "./modules/members/invitations.routes";
import accessRoutes from "./modules/members/access.routes";
import adminMembersRoutes from "./modules/members/admin-members.routes";
import channelsRoutes from "./modules/channels/channels.routes";
import channelGrantsRoutes from "./modules/channels/channel-grants.routes";
import adminChannelsRoutes from "./modules/channels/admin-channels.routes";
import { registerChannelModule } from "./modules/channels";
import messagesRoutes, { createScopedMessageRouter } from "./modules/messages/messages.routes";
import conversationsRoutes from "./modules/conversations/conversations.routes";
import adminConversationsRoutes from "./modules/admin-conversations/admin-conversations.routes";
import { registerConversationModule } from "./modules/conversations";
import threadsRoutes from "./modules/threads/threads.routes";
import { registerThreadsModule } from "./modules/threads";
import mentionsRoutes from "./modules/mentions/mentions.routes";
import { registerMentionsModule } from "./modules/mentions";
import walletRoutes from "./modules/wallet/wallet.routes";
import adminWalletRoutes from "./modules/wallet/admin-wallet.routes";
import projectsRoutes from "./modules/projects/projects.routes";
import adminProjectsRoutes from "./modules/projects/admin-projects.routes";
import { registerProjectsModule } from "./modules/projects";
import readStateRoutes from "./modules/read-state/read-state.routes";
import { registerReadStateModule } from "./modules/read-state";
import adminNotificationsRoutes from "./modules/admin-notifications/admin-notifications.routes";
import savedRoutes from "./modules/discovery/saved.routes";
import scopeSearchRoutes, { createScopedSearchRouter } from "./modules/discovery/scope-search.routes";
import workspaceSearchRoutes from "./modules/workspace-search/workspace-search.routes";
import workspaceTemplatesRoutes from "./modules/workspace-templates/workspace-templates.routes";
import announcementsRoutes from "./modules/announcements/announcements.routes";
import chatExtensionsRoutes, { createScopedExtensionRouter } from "./modules/chat-extensions/chat-extensions.routes";
import { registerChatExtensionsModule } from "./modules/chat-extensions";
import reportsRoutes from "./modules/moderation/reports.routes";
import scopeReportsRoutes from "./modules/moderation/scope-reports.routes";
import adminModerationRoutes from "./modules/moderation/admin-moderation.routes";
import blocksRoutes from "./modules/blocks/blocks.routes";
import resourcesRoutes from "./modules/resources/resources.routes";
import adminResourcesRoutes from "./modules/resources/resources.admin.routes";
import studyRoutes from "./modules/study/study.routes";
import adminStudyRoutes from "./modules/study/study.admin.routes";
import roadmapRoutes from "./modules/roadmap/roadmap.routes";
import adminRoadmapRoutes from "./modules/roadmap/roadmap.admin.routes";
import { checkLiveKit } from "./infrastructure/media";
import { isDraining } from "./infrastructure/observability/drain";
import mediaAdminRoutes from "./modules/media-admin/media-admin.routes";
import adminMediaOpsRoutes from "./modules/admin-media-ops/admin-media-ops.routes";
import mediaDevRoutes from "./modules/media-dev/media-dev.routes";
import devToolsRoutes, { isDevToolsEnabled } from "./modules/dev-tools/dev-tools.routes";
import callsRoutes from "./modules/calls/calls.routes";
import { registerCallsModule } from "./modules/calls";
import meetingsRoutes from "./modules/meetings/meetings.routes";
import adminMeetingsRoutes from "./modules/meetings/admin-meetings.routes";
import { registerMeetingsModule } from "./modules/meetings";
import gamificationRoutes from "./modules/gamification/gamification.routes";
import adminGamificationRoutes from "./modules/gamification/gamification.admin.routes";
import contributionRoutes from "./modules/contribution/contribution.routes";
import adminContributionRoutes from "./modules/contribution/contribution.admin.routes";
import liveQuizRoutes from "./modules/live-quiz/live-quiz.routes";
import adminLiveQuizRoutes from "./modules/live-quiz/live-quiz.admin.routes";
import { registerLiveQuizModule } from "./modules/live-quiz";
import pomodoroRoutes from "./modules/pomodoro/pomodoro.routes";
import mentorRoutes from "./modules/mentor/mentor.routes";
import adminMentorRoutes from "./modules/mentor/mentor.admin.routes";
import { registerMentorModule } from "./modules/mentor";
import careerRoutes from "./modules/career/career.routes";
import adminCareerRoutes from "./modules/career/career.admin.routes";
import portfolioRoutes from "./modules/portfolio/portfolio.routes";
import adminPortfolioRoutes from "./modules/portfolio/admin-portfolio.routes";
import integrationsRoutes from "./modules/integrations/integrations.routes";
import adminIntegrationsRoutes from "./modules/integrations/admin-integrations.routes";
import o2oRoutes from "./modules/o2o/o2o.routes";
import partnerRoutes from "./modules/o2o/partner.routes";
import adminO2oRoutes from "./modules/o2o/admin-o2o.routes";
import { registerO2oModule } from "./modules/o2o";
import documentsRoutes from "./modules/documents/documents.routes";
import collabAdminRoutes from "./modules/documents/collab-admin.routes";
import { registerDocumentsApiHooks, registerDocumentsModule } from "./modules/documents";
import whiteboardsRoutes from "./modules/whiteboards/whiteboards.routes";
import { registerWhiteboardsApiHooks, registerWhiteboardsModule } from "./modules/whiteboards";
import recruiterRoutes from "./modules/recruiter/recruiter.routes";
import adminRecruiterRoutes from "./modules/recruiter/admin-recruiter.routes";
import coinsRoutes from "./modules/coins/coins.routes";
import marketplaceRoutes from "./modules/coins/marketplace.routes";
import adminEconomyRoutes from "./modules/coins/admin-economy.routes";
import burnoutRoutes from "./modules/burnout/burnout.routes";
import adminBurnoutRoutes from "./modules/burnout/admin-burnout.routes";
import { registerBurnoutModule, registerBurnoutPresenceCollector } from "./modules/burnout";
import { registerAuthNotificationTypes } from "./modules/auth/services/auth-notification-types";
import plagiarismRoutes from "./modules/plagiarism/plagiarism.routes";
import adminPlagiarismRoutes from "./modules/plagiarism/admin-plagiarism.routes";
import { registerPlagiarismModule } from "./modules/plagiarism";
import { getCollabClient } from "./shared/collab";

const router = Router();

// ─── Health check (không versioned — luôn ở /api/health) ─────────────────────

/**
 * GET /api/health/live (p0-11) — liveness cho Docker/LB: chỉ cho biết tiến trình còn xử lý được request, KHÔNG kiểm phụ thuộc (DB/Redis lỗi không được làm
 * Docker restart api) và vẫn 200 khi đang drain (SIGTERM). `globalLimiter` bỏ qua đường dẫn này.
 */
router.get("/health/live", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

/**
 * GET /api/health
 * Health-check chi tiết: kiểm tra Redis, DB và queue; trả 503 nếu dịch vụ
 * thiết yếu (redis/db) down. Queue lỗi chỉ báo "error" trong `services.queue`,
 * không kéo status 503 — job có thể chờ Redis hồi phục.
 */
router.get("/health", async (_req, res) => {
  // p0-11 — đang drain (SIGTERM): 503 `draining` để LB/Docker/uptime monitor thấy replica sắp tắt; bỏ qua kiểm phụ thuộc (đang đóng kết nối).
  if (isDraining()) {
    res.status(503).json({ success: false, status: "draining", message: "Máy chủ đang tắt để cập nhật", timestamp: new Date().toISOString() });
    return;
  }
  const result: Record<string, "ok" | "error"> = {
    redis: "ok",
    db: "ok",
  };
  let hasError = false;

  // Kiểm tra Redis
  try {
    const ok = await redis.ping();
    if (!ok) {
      result["redis"] = "error";
      hasError = true;
    }
  } catch {
    result["redis"] = "error";
    hasError = true;
  }

  // Kiểm tra DB (Prisma MongoDB — dùng $runCommandRaw thay vì $queryRaw)
  try {
    await prisma.$runCommandRaw({ ping: 1 });
  } catch {
    result["db"] = "error";
    hasError = true;
  }

  // Kiểm tra queue (BullMQ) — không chặn health chính, chỉ báo trạng thái.
  // `queueConnection` (ioredis) cấu hình `maxRetriesPerRequest: null` (bắt
  // buộc cho BullMQ) nên `getJobCounts()` KHÔNG BAO GIỜ tự reject khi Redis
  // mất kết nối, nó xếp hàng chờ reconnect vô thời hạn — `Promise.race`
  // timeout ở đây tránh treo cả request `/api/health` (đã kiểm chứng: không
  // có timeout thì response treo đúng 30s tới khi `httpServer.timeout` cắt).
  const QUEUE_HEALTH_TIMEOUT_MS = 3000;
  let queue: { waiting: number; active: number; failed: number } | "error" = "error";
  try {
    const counts = await Promise.race([
      getQueue("cron").getJobCounts("waiting", "active", "failed"),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error("getJobCounts quá hạn")), QUEUE_HEALTH_TIMEOUT_MS).unref();
      }),
    ]);
    queue = {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      failed: counts.failed ?? 0,
    };
  } catch {
    queue = "error";
  }

  // Kiểm tra LiveKit (p0-08 §5.5) — `disabled` khi chưa cấu hình; `down` CHỈ kéo health về 503 khi voice/meeting bật.
  const livekit = await checkLiveKit();
  if (livekit.fatal) hasError = true;

  // Kiểm tra collab (p6-01 be.md §9) — CHỈ khi cờ `collab` bật + có COLLAB_INTERNAL_URL (không gọi mạng khi tắt). KHÔNG BAO GIỜ kéo health về 503: soạn tài liệu suy giảm không
  // được làm load balancer đá cả API. `disabled` | `ok` | `degraded` (collab chậm/lỗi/không phản hồi trong 1 giây, HOẶC từ chối `COLLAB_SHARED_SECRET` của BE — bí mật
  // lệch thì mọi token collab bị từ chối chữ ký dù `/health` của collab vẫn ok; xem `HttpCollabClient.health`).
  let collab: "ok" | "degraded" | "disabled" = "disabled";
  if (env.COLLAB_INTERNAL_URL && (await runtimeConfig.isFeatureEnabled(MODULES.COLLAB))) {
    collab = (await getCollabClient().health(1000)).status === "ok" ? "ok" : "degraded";
  }

  const statusCode = hasError ? 503 : 200;
  res.status(statusCode).json({
    success: !hasError,
    status: hasError ? "down" : "ok",
    message: hasError ? "Một số dịch vụ không khả dụng" : "API đang hoạt động bình thường",
    timestamp: new Date().toISOString(),
    version: env.APP_VERSION,
    uptime: Math.round(process.uptime()),
    environment: env.NODE_ENV,
    services: { ...result, queue, livekit: livekit.status, collab },
  });
});

// ─── API v1 routes ───────────────────────────────────────────────────────────
// Tất cả business routes nằm trong /api/v1/...
// Khi cần breaking changes, tạo v2 router song song mà không ảnh hưởng v1.
//
// Base chỉ có auth + users. Module nghiệp vụ mới: dùng `npm run gen:module`
// rồi mount router ở đây.

const v1 = Router();

v1.use("/auth", authRoutes);
v1.use("/users", userRoutes);
// `/me/*` (delete-request/delete-cancel/privacy — be.md p0-01 §4) — router
// riêng, KHÔNG lồng trong `userRoutes` vì `/me/delete-cancel` cố tình KHÔNG
// có `authenticateToken` (tài khoản PENDING_DELETION bị chặn đăng nhập).
v1.use("/me", meRoutes);
v1.use("/audit-logs", auditLogRoutes);
v1.use("/capabilities", capabilitiesRoutes);
v1.use("/assets", assetsRoutes);
v1.use("/me/devices", devicesRoutes);
// `notifications.routes.ts` tự khai đủ path tuyệt đối ("/notifications/*",
// "/me/notification-preferences") — mount ở root v1, không có prefix riêng
// (be.md p0-06 §4 chuyển 2 endpoint preference từ router.ts vào module).
v1.use(notificationsRoutes);
v1.use("/admin/overview", adminOverviewRoutes);
v1.use("/admin/jobs", adminJobsRoutes);
v1.use("/admin/storage", adminStorageRoutes);
v1.use("/admin/push", adminPushRoutes);
v1.use("/presence", presenceRoutes);
v1.use("/admin/system-config", systemConfigRoutes);
// `admin-media-ops` (p2-07 be.md §1/§4) — vận hành gọi & họp TOÀN NỀN TẢNG. Path tuyệt đối ("/admin/meetings*", "/admin/calls*", "/admin/media/health",
// "/admin/workspaces/:workspaceId/media-stats"), middleware gắn TỪNG route (cờ `meeting`, nhánh calls thêm `voice`). ⚠ PHẢI mount TRƯỚC `/admin/workspaces` bên dưới:
// `admin-workspaces.routes` có `router.use(requireFeature(COMMUNICATION))` chặn mọi `/admin/workspaces/*` (cờ `communication` tắt → `media-stats` 404 nhầm). Đăng ký cổng KPI
// `shared/ports/admin-overview-media.port` (khối `media` của `GET /admin/overview`); sink `admin:media-updated` nạp ở worker qua `register-jobs.ts`.
v1.use(adminMediaOpsRoutes);
v1.use("/workspaces", workspacesRoutes);
v1.use("/workspaces", membersRoutes);
// `invites.routes.ts` tự khai đủ path tuyệt đối ("/workspaces/:workspaceId/invites*",
// "/invites/:token*") — mount ở root v1, giống `notificationsRoutes` (p1-02).
v1.use(invitesRoutes);
// p3-04 — lời mời đích danh theo email + khách + duyệt tham gia: path tuyệt đối, mount ở root v1 (giống `invitesRoutes`).
v1.use(invitationsRoutes);
v1.use(accessRoutes);
v1.use("/admin/workspaces", adminWorkspacesRoutes);
v1.use("/admin/workspaces", adminMembersRoutes);
// `channels.routes.ts` tự khai đủ path tuyệt đối ("/workspaces/:workspaceId/channels*",
// "/channels/:channelId*") — mount ở root v1, giống `invitesRoutes` (p1-03 be.md §1).
v1.use(channelsRoutes);
v1.use("/channels", channelGrantsRoutes);
// `admin-channels.routes.ts` tự khai đủ path tuyệt đối ("/admin/workspaces/:workspaceId/channels",
// "/admin/channels/:channelId/archive|restore" — 2 prefix khác nhau) — mount ở root v1.
v1.use(adminChannelsRoutes);
// Đăng ký `MessageScope` CHANNEL vào registry của `messages` (p1-04 be.md
// §1) — side-effect boot, phải chạy TRƯỚC khi bất kỳ request nào chạm
// `requireMessageScope`/`registry.get("CHANNEL")`. `router.ts` (composition
// root) là nơi DUY NHẤT chắc chắn chạy trước khi server nhận request, nên gọi
// thẳng ở đây thay vì trông chờ thứ tự import module tình cờ đúng.
registerChannelModule();
// `conversations.routes.ts` tự khai đủ path tuyệt đối ("/conversations",
// "/conversations/:id*") — mount ở root v1, giống `channelsRoutes` (p1-05
// be.md §1). `admin-conversations.routes.ts` tương tự
// ("/admin/workspaces/:workspaceId/conversations", "/admin/conversations/:id/dissolve").
v1.use(conversationsRoutes);
v1.use(adminConversationsRoutes);
// Đăng ký `MessageScope` CONVERSATION + `ConversationHooks` (p1-05 be.md §1,
// §5.9) — side-effect boot, cùng nguyên tắc `registerChannelModule()` trên.
registerConversationModule();
// `messages.routes.ts` tự khai đủ path tuyệt đối ("/scopes/:scopeType/:scopeId/messages*",
// "/messages/:id*") — mount ở root v1 (p1-04 be.md §1).
v1.use(messagesRoutes);
// Alias đọc dễ (be.md p1-04 §1/§4): `/channels/:id/messages`,
// `/channels/:id/pins`, `/conversations/:id/messages` — router factory tái
// sử dụng đúng controller ở trên, KHÔNG lặp nghiệp vụ. Không xung đột path
// với `conversationsRoutes` ở trên (suffix `/messages`/`/pins` khác mọi route
// tự khai của module đó).
v1.use("/channels", createScopedMessageRouter("CHANNEL"));
v1.use("/conversations", createScopedMessageRouter("CONVERSATION"));
// `threads.routes.ts`/`mentions.routes.ts` tự khai đủ path tuyệt đối
// ("/messages/:id/thread", "/threads/:id*", "/channels/:id/threads",
// "/scopes/:scopeType/:scopeId/mentionables") — mount ở root v1, giống
// `messagesRoutes` (p1-06 be.md §1). Đăng ký `IThreadHook`/`IMentionValidator`
// (port `core/permission/message-hooks.port.ts`) NGAY SAU — side-effect boot,
// phải chạy trước request đầu tiên chạm `message.service.ts#send()`/`edit()`,
// cùng nguyên tắc `registerChannelModule()`/`registerConversationModule()` ở trên.
v1.use(threadsRoutes);
registerThreadsModule();
v1.use(mentionsRoutes);
registerMentionsModule();
// `wallet.routes.ts`/`admin-wallet.routes.ts` tự khai đủ path tuyệt đối ("/workspaces/:workspaceId/wallet*",
// "/workspaces/:workspaceId/expenses|settlements", "/expenses/:id*", "/settlements/:id/*", "/me/payment-profiles*",
// "/admin/workspaces/:workspaceId/wallet-stats") — mount ở root v1 (p6-04 be.md §1/§4). Cờ `wallet` gắn ở từng route.
v1.use(walletRoutes);
v1.use(adminWalletRoutes);
// `projects` (p3-02 Kanban; p3-03 chi tiết thẻ cùng module) — `projects.routes.ts` tự khai đủ path tuyệt đối
// ("/workspaces/:workspaceId/boards", "/boards/:id*", "/tasks/:id/move", "/labels/:id"), `admin-projects.routes.ts`
// ("/admin/workspaces/:id/project-stats") — mount ở root v1. Cờ `project` gắn ở từng route (`requireFeature`).
// `registerProjectsModule()` đăng ký resolver scope BOARD (+ `children()` cho revokeScope) và guard room `board:`;
// PHẢI chạy SAU khi `workspacesRoutes` (import ở trên) đã đăng ký resolver WORKSPACE.
v1.use(projectsRoutes);
v1.use(adminProjectsRoutes);
registerProjectsModule();
// `read-state.routes.ts` (p1-07 be.md §1) tự khai đủ path tuyệt đối ("/read-markers", "/me/read-all-conversations",
// "/me/unread*") — mount ở root v1, giống `messagesRoutes`. `registerReadStateModule()` đăng ký `IReadStateReader`
// cho `ThreadService` (myLastReadSeq/unreadReplies). `IReadReceiptPublisher` do `registerConversationModule()` đăng ký.
v1.use(readStateRoutes);
registerReadStateModule();
v1.use("/admin/notifications", adminNotificationsRoutes);
// `discovery` (p1-09 be.md §1) — tin đã lưu + tìm trong kênh/hội thoại. Tự khai path tuyệt đối
// ("/messages/:messageId/save", "/me/saved", "/scopes/:scopeType/:scopeId/search"), mount ở root v1;
// alias `/channels/:id/search`, `/conversations/:id/search` qua router factory giống `createScopedMessageRouter`.
// KHÔNG cần side-effect boot: tra `MessageScope` qua registry lúc có request (đã đăng ký ở trên).
// Danh sách ghim (`/…/pins`) nằm ở `messages.routes.ts` (p1-04) — không nhân đôi route.
v1.use(savedRoutes);
v1.use(scopeSearchRoutes);
v1.use("/channels", createScopedSearchRouter("CHANNEL"));
v1.use("/conversations", createScopedSearchRouter("CONVERSATION"));
// `workspace-search` (p5-04 be.md §1/§4) — tìm toàn workspace: "/workspaces/:workspaceId/search" (path tuyệt đối, mount ở root v1). Cờ phụ
// `workspaceSearch` gắn ở route (`requireSubFeature`, 404 `CFG_005` khi tắt). Chỉ ĐỌC — quyền từng scope tính lại ở mỗi lượt (DU-02).
v1.use(workspaceSearchRoutes);
// `workspace-templates` (p5-04): "/workspace-templates", "/workspaces/:workspaceId/templates/:code/apply", "/admin/workspace-templates*". Tạo nhóm
// từ mẫu (`templateCode` ở `POST /workspaces`) đi qua cổng `shared/ports/workspace-template.port.ts` do `workspaces.routes.ts` nối.
v1.use(workspaceTemplatesRoutes);
// `announcements` (p5-04): "/messages/:messageId/announcement*", "/channels/:channelId/announcements" — xác nhận đã đọc thông báo kênh
// ADMINS_ONLY. Cờ phụ `readConfirm`; fan-out thông báo chạy ở worker (`jobs/announcement.jobs.ts` qua `register-jobs.ts`).
v1.use(announcementsRoutes);
// `chat-extensions` (p7-04 be.md §1/§4) — khảo sát, tin hẹn giờ, nhắc lại tin, chuyển tin thành thẻ/tài liệu. `chat-extensions.routes.ts` tự khai path tuyệt đối ("/scopes/:scopeType/:scopeId/(polls|scheduled-messages)",
// "/polls/:pollId*", "/scheduled-messages/:id*", "/me/(scheduled-messages|reminders)", "/messages/:messageId/(reminders|to-task|to-resource)", "/reminders/:id") — mount ở root v1; alias `/channels/:id/(polls|scheduled-messages)`,
// `/conversations/:id/(…)` qua router factory (giống `createScopedMessageRouter`). Cờ phụ `polls`/`scheduledMessages`/`messageReminders`/`messageToTask`/`messageToResource` gắn từng route (404 `CFG_005` khi tắt).
// `registerChatExtensionsModule()` đăng ký cổng đọc khảo sát (`MessageView.poll`) + loại thông báo; job/cron ở worker (`jobs/chat-extensions.jobs.ts` qua `register-jobs.ts`). Cần `db push` model Poll/PollVote/ScheduledMessage/MessageReminder.
v1.use(chatExtensionsRoutes);
v1.use("/channels", createScopedExtensionRouter("CHANNEL"));
v1.use("/conversations", createScopedExtensionRouter("CONVERSATION"));
registerChatExtensionsModule();
// `moderation` + `blocks` (p1-08 be.md §1). `reportsRoutes`/`scopeReportsRoutes`/`adminModerationRoutes` tự khai path
// tuyệt đối ("/reports*", "/messages/:messageId/report", "/me/reports", "/workspaces/:workspaceId/reports",
// "/conversations/:conversationId/reports", "/admin/reports*", "/admin/messages/:messageId/remove") — mount ở root v1,
// không xung đột path với `messagesRoutes`/`conversationsRoutes` (suffix `/report`, `/reports` khác mọi route của họ).
// `blocksRoutes` mount `/me/blocks` (giống `/me/devices`) và đăng ký bộ lọc presence (BLOCK-06) lúc import.
v1.use(reportsRoutes);
v1.use(scopeReportsRoutes);
v1.use(adminModerationRoutes);
v1.use("/me/blocks", blocksRoutes);
// `resources` (p3-01 be.md §1) — kho tài liệu. `resources.routes.ts` tự khai path tuyệt đối ("/workspaces/:workspaceId/
// folders|resources|trash|storage", "/folders/:id*", "/resources/:id*") — mount ở root v1, giống `channelsRoutes`; cờ `project`
// gắn ở từng route (`requireFeature`). Import file này cũng đăng ký hook `POST /assets` scope RESOURCE (quyền + hạn mức
// `RSC_007`) vào `shared/ports/asset-scope-gate.port`. `resources.admin.routes.ts` mount `/admin/workspaces` (số liệu +
// hạn mức riêng), cùng prefix với `adminWorkspacesRoutes` nhưng path khác (`/:workspaceId/resource-stats|resource-quota`).
v1.use(resourcesRoutes);
v1.use("/admin/workspaces", adminResourcesRoutes);
// `study` (p4-01 be.md §1) — bộ học & flashcard. `study.routes.ts` tự khai path tuyệt đối ("/study-sets*", "/study-tags/popular"),
// `study.admin.routes.ts` ("/admin/study-sets/*") — mount ở root v1; cờ `study` gắn ở từng route (`requireFeature`, mặc định TẮT,
// `AVAILABLE_MODULES` chưa có "study" tới khi p4-02 xong). Import routes đăng ký quyền đọc asset `STUDY_ITEM`/`STUDY_SET_COVER` và đích
// báo cáo `STUDY_SET` (`shared/ports/asset-target-access.port`, `shared/ports/report.port`).
v1.use(studyRoutes);
v1.use(adminStudyRoutes);
v1.use(roadmapRoutes);
v1.use(adminRoadmapRoutes);
// `media-admin` (p0-08 be.md §4) — trạng thái máy chủ media (`system-config:view`). `media-dev` chỉ mount khi
// `NODE_ENV≠production` VÀ `MEDIA_SPIKE_ENABLED=true` (router còn tự chặn 404 lúc chạy). Route webhook LiveKit
// KHÔNG mount ở đây mà ở `app.ts` (RAW body TRƯỚC `express.json`).
v1.use("/admin/media", mediaAdminRoutes);
if (env.NODE_ENV !== "production" && env.MEDIA_SPIKE_ENABLED) v1.use("/dev/media", mediaDevRoutes);
// p0-11 — `POST /dev/sentry-test` (OPS-01): chỉ khi DEV_TOOLS_ENABLED=true và KHÔNG phải production thật (staging đặt SENTRY_ENVIRONMENT=staging).
if (isDevToolsEnabled()) v1.use("/dev/sentry-test", devToolsRoutes);
// `calls` (p2-01 be.md §1/§4) — lõi cuộc gọi 1-1/nhóm. `calls.routes.ts` tự khai path tuyệt đối ("/calls*", "/me/active-call",
// "/me/calls") — mount ở root v1. Cờ `voice` + LiveKit gắn ở từng route (`requireCallsEnabled` → 503 `CALL_012`, mặc định TẮT,
// `AVAILABLE_MODULES` CHƯA có "voice" tới khi điều phối viên `db push` + smoke). `registerCallsModule()` đăng ký resolver scope
// `CALL` (guard room `call:{id}`), loại thông báo cuộc gọi và listener thu hồi quyền — PHẢI chạy sau khi các module có
// resolver CONVERSATION/CHANNEL đã đăng ký (đã import ở trên).
v1.use(callsRoutes);
registerCallsModule();
// `meetings` (p2-04 be.md §1/§4) — lịch họp. `meetings.routes.ts` tự khai path tuyệt đối ("/workspaces/:workspaceId/meetings",
// "/me/meetings", "/meetings/*") — mount ở root v1; cờ `meeting` gắn ở từng route (`requireFeature`, mặc định TẮT, `AVAILABLE_MODULES`
// CHƯA có "meeting" tới khi điều phối viên `db push` + smoke). `registerMeetingsModule()` đăng ký resolver scope `MEETING` (guard
// room `meet:{id}`), loại thông báo cuộc họp và listener thu hồi quyền — PHẢI chạy sau khi resolver WORKSPACE đã đăng ký (import ở trên).
v1.use(meetingsRoutes);
registerMeetingsModule();
// `admin-meetings.routes.ts` (p2-04 admin.md §2.1) — "/admin/workspaces/:workspaceId/meetings": lịch họp của workspace cho admin, CHỈ metadata,
// `workspace:view` + cờ `meeting` (404 CFG_005 khi tắt). Path tuyệt đối, mount ở root v1 (cùng kiểu `adminChannelsRoutes`).
v1.use(adminMeetingsRoutes);
// `gamification` (p4-03 be.md §1/§4) — XP, cấp độ, chuỗi ngày, huy hiệu, bảng xếp hạng nhóm. `gamification.routes.ts` tự khai path tuyệt đối
// ("/me/gamification*", "/me/xp-events", "/badges", "/me/badges/showcase", "/workspaces/:id/leaderboard", "/users/:id/gamification/public"),
// `gamification.admin.routes.ts` ("/admin/xp-rules", "/admin/badges*", "/admin/gamification/*", "/admin/users/:id/(gamification|xp-adjust|badges)") — mount
// ở root v1; cờ `gamification` gắn ở từng route (`requireFeature`, mặc định TẮT, `AVAILABLE_MODULES` CHƯA có "gamification" tới khi điều phối viên
// `db push` + seed đã duyệt + smoke). Consumer XP chạy ở worker (`jobs/gamification.jobs.ts` qua `register-jobs.ts`).
v1.use(gamificationRoutes);
v1.use(adminGamificationRoutes);
// `contribution` (p4-06 be.md §1/§4) — báo cáo đóng góp + heatmap hoạt động. `contribution.routes.ts` tự khai path tuyệt đối ("/boards/:id/contribution*",
// "/boards/:id/contribution-config", "/boards/:id/heatmap", "/workspaces/:id/activity-heatmap", "/contribution-exports/:id") — mount ở root v1; cờ `project` gắn
// ở từng route (`requireFeature`). Báo cáo CHỈ ĐỌC: PATCH/PUT/POST/DELETE tới `/boards/:id/contribution*` → 405 CONTRIB_001. `contribution.admin.routes.ts`:
// "/admin/workspaces/:id/contribution-stats" (`workspace:view`, chỉ số đếm). Import routes đăng ký loại thông báo + quyền đọc asset `CONTRIBUTION_EXPORT`;
// fact/snapshot/heatmap/PDF chạy ở worker (`jobs/contribution.jobs.ts` qua `register-jobs.ts`).
v1.use(contributionRoutes);
v1.use(adminContributionRoutes);
// `live-quiz` (p5-01 be.md §1/§4) — thi trực tiếp theo PIN. `live-quiz.routes.ts` tự khai path tuyệt đối ("/live-quiz",
// "/live-quiz/join", "/live-quiz/:id", "/live-quiz/:id/(start|next|end|cancel|kick)") — mount ở root v1; cờ `live-quiz` gắn ở từng route
// (`requireFeature`, mặc định TẮT — bật bằng `FEATURE_FLAGS=study=true,live-quiz=true` hoặc admin; cần `db push` model LiveQuizSession/LiveQuizResult trước).
v1.use(liveQuizRoutes);
// Admin live quiz (p5-01 be.md §4): "/admin/live-quiz/sessions", "/admin/live-quiz/sessions/:id", "/admin/live-quiz/sessions/:id/end".
v1.use(adminLiveQuizRoutes);
// `registerLiveQuizModule()` — guard room `quiz:{id}` + bộ thực thi lệnh hẹn giờ (timer trong tiến trình + kênh pub/sub cho job ở worker riêng, vì
// worker thuần không có `getIO()`); worker không import router.ts nên chỉ `dispatch` (xem `modules/live-quiz/index.ts`).
registerLiveQuizModule();
// `pomodoro` (p5-02 be.md §1/§4) — phòng Pomodoro: đồng hồ theo SERVER trên `Call ROOM` của kênh POMODORO. `pomodoro.routes.ts` tự khai path tuyệt đối
// ("/channels/:channelId/pomodoro*", "/me/pomodoro/history") — mount ở root v1; cờ `pomodoro` gắn ở từng route (`requireFeature`, mặc định TẮT; `join`
// cần thêm cờ `voice` + LiveKit → 503 `CALL_012`). Cần `db push` model PomodoroSession/PomodoroPresence. `pomodoro:updated` phát thẳng bằng `emitToRoom` (cả API
// lẫn worker nhờ cầu nối socket); worker chỉ import `jobs/pomodoro.jobs.ts` (`register-jobs.ts`).
v1.use(pomodoroRoutes);
// `mentor` (p6-03 Mentor Connect) — bảng tin tìm cố vấn, đơn ứng tuyển, đợt cố vấn = khách có hạn (qua `WorkspaceMembershipPort`/`ConversationPort`).
// `mentor.routes.ts` tự khai path tuyệt đối ("/mentor/*", "/workspaces/:workspaceId/mentor/*", "/me/mentor/*"), `mentor.admin.routes.ts`
// ("/admin/mentor/*", "/admin/workspaces/:workspaceId/mentor") — mount ở root v1; cờ `mentor` gắn ở từng route (mặc định TẮT). `registerMentorModule()`
// đăng ký loại thông báo `mentor.*`, đích báo cáo `MENTOR_POST`, listener thu hồi quyền (worker nạp qua `jobs/mentor.jobs.ts`). Cần `db push` model Mentor*.
v1.use(mentorRoutes);
v1.use(adminMentorRoutes);
registerMentorModule();
// `career` (p6-06 huy hiệu kỹ năng xác thực — nền cho p6-07/p6-08). `career.routes.ts` tự khai path tuyệt đối ("/skills*", "/me/skills", "/users/:id/skills*",
// "/me/career*"), `career.admin.routes.ts` ("/admin/skills*", "/admin/users/:id/skills*") — mount ở root v1, TRƯỚC `/admin/users` bên dưới; cờ `career` gắn ở
// từng route (`requireFeature`, mặc định TẮT). Không có route cấp huy hiệu (CR-03). Tiến độ chạy ở worker (`jobs/career.jobs.ts` qua `register-jobs.ts`).
v1.use(careerRoutes);
v1.use(adminCareerRoutes);
// `portfolio` (p6-07 Portfolio một chạm). `portfolio.routes.ts` tự khai path tuyệt đối ("/me/portfolio*", "/portfolio/(slug-available|templates)", "/users/:userId/portfolio-link"), cờ `career` +
// công tắc `portfolio.enabled` gắn ở từng route (mặc định BẬT — xem `system-config.registry.ts`; cờ `career` mới là cổng chính, mặc định TẮT). `admin-portfolio.routes.ts`: "/admin/portfolios/:id(/takedown|/restore)" (`moderation:view|update`, không gắn cờ). Trang công khai
// `GET /p/:slug` KHÔNG mount ở đây mà ở `app.ts` (ngoài `/api`). Import routes đăng ký loại thông báo + đích báo cáo `PORTFOLIO`; job/sink ở worker (`jobs/portfolio.jobs.ts`). Cần `db push` model Portfolio*.
v1.use(portfolioRoutes);
v1.use(adminPortfolioRoutes);
// `integrations` (p5-03 be.md §1/§4) — GitHub/GitLab/Figma cấp nhóm + Google Calendar cá nhân. Path tuyệt đối ("/integrations/*", "/workspaces/:id/integrations*",
// "/me/integrations*", "/admin/integrations*", "/admin/workspaces/:id/integrations") — mount ở root v1; cờ `integration` gắn ở từng route (mặc định TẮT), trừ
// callback OAuth công khai. Import routes đăng ký handler `POST /webhooks/:provider` (registry của `webhooks`), loại thông báo `integration.error`, listener
// thu hồi quyền. Job/cron/sink lịch họp ở worker (`jobs/integrations.jobs.ts`). Cần `db push` model Integration/UserIntegration/CalendarEventLink.
v1.use(integrationsRoutes);
v1.use(adminIntegrationsRoutes);
// `o2o` (p6-05 in ấn O2O & địa điểm). Path tuyệt đối — người dùng ("/locations*", "/print-shops/*", "/print-orders*", cờ `o2o`), chủ tiệm
// ("/partner/*", cờ `o2o` + quyền THEO DỮ LIỆU `partner:*`), vận hành ("/admin/locations*", "/admin/location-reviews/*", "/admin/print-shops*",
// "/admin/print-orders*", quyền `o2o:*`, không gắn cờ để chuẩn bị tiệm trước khi bật). `registerO2oModule()` đăng ký loại thông báo
// `print-order.*`, provider quyền `print-shop`, resolver asset `PRINT_ORDER`, gate scope `LOCATION`. Cần `db push` + `npm run db:ensure-indexes`.
v1.use(o2oRoutes);
v1.use(partnerRoutes);
v1.use(adminO2oRoutes);
registerO2oModule();
// `documents` (p6-01 Real-time Docs). `documents.routes.ts` tự khai path tuyệt đối ("/workspaces/:workspaceId/documents", "/documents/:id*"), cờ `collab` gắn ở từng route (mặc định
// TẮT); `collab-admin.routes.ts` ("/admin/collab/*", `integration:view`/`system-config:update`, không gắn cờ). Endpoint NỘI BỘ của collab ("/api/internal/documents/*") KHÔNG mount ở đây
// mà ở `app.ts` (TRƯỚC `globalLimiter`/body parser). `registerDocumentsModule()` đăng ký resolver scope DOCUMENT + loại thông báo + listener thu hồi quyền (đóng kết nối collab);
// `registerDocumentsApiHooks()` (CHỈ API) đăng ký cổng upload `DOC` + quyền đọc asset `DOCUMENT`. PHẢI chạy sau `workspacesRoutes` (resolver WORKSPACE). Cần `db push` model Document*.
v1.use(documentsRoutes);
v1.use(collabAdminRoutes);
registerDocumentsModule();
registerDocumentsApiHooks();
// `whiteboards` (p6-02 Whiteboard, dùng chung service `collab/` + cờ `collab` với `documents`). `whiteboards.routes.ts` tự khai path tuyệt đối ("/workspaces/:workspaceId/whiteboards", "/whiteboards/:id*"),
// cờ `collab` gắn ở từng route (mặc định TẮT). Endpoint NỘI BỘ của collab ("/api/internal/whiteboards/*") KHÔNG mount ở đây mà ở `app.ts` (TRƯỚC `globalLimiter`/body parser). `registerWhiteboardsModule()`
// đăng ký resolver scope WHITEBOARD + listener thu hồi quyền (đóng kết nối collab); `registerWhiteboardsApiHooks()` (CHỈ API) đăng ký cổng upload `WHITEBOARD` (ảnh thu nhỏ) + quyền đọc asset `WHITEBOARD`.
// PHẢI chạy sau `workspacesRoutes` (resolver WORKSPACE). Cần `db push` model Whiteboard* + enum AssetScope/AssetLinkTarget `WHITEBOARD`.
v1.use(whiteboardsRoutes);
registerWhiteboardsModule();
registerWhiteboardsApiHooks();
// `recruiter` (p6-08 Recruiter board). `recruiter.routes.ts` tự khai path tuyệt đối — HR/doanh nghiệp ("/companies*", "/me/company", "/offers/:offerId/messages"), sinh viên ("/me/offers*", "/me/career",
// "/me/career/job-settings", "/me/company-blocks*", "/me/profile-views"); cờ `career` + công tắc `recruiter.enabled` (mặc định TẮT) gắn ở từng route, quyền HR qua resolver scope `COMPANY` (`companyScope`).
// `admin-recruiter.routes.ts`: "/admin/companies*", "/admin/recruiter/stats", "/admin/job-offers/:offerId/(reported|withdraw)" — quyền theo VAI HỆ THỐNG (`recruiter:*`), không gắn cờ. Import routes đăng ký loại thông báo
// `job-offer.*`/`company.*`, resolver COMPANY, provider quyền `company`, đích báo cáo COMPANY/JOB_OFFER, quyền đọc asset COMPANY_LOGO/JOB_OFFER; job/cron/sink ở worker (`jobs/recruiter.jobs.ts`). Cần `db push` model Company*/JobOffer*/Talent*.
v1.use(recruiterRoutes);
v1.use(adminRecruiterRoutes);
// `coins` (p7-02 Kinh tế ảo — XU ẢO, không quy đổi/nạp tiền thật; tách hẳn ví chi tiêu nhóm `wallet`). `coins.routes.ts` tự khai path tuyệt đối ("/me/wallet*", "/me/quests*", "/shop/items*", "/me/inventory*"),
// `admin-economy.routes.ts` ("/admin/economy/*", `gamification:view|update`) — mount ở root v1; cờ `coins` gắn ở từng route (`requireFeature`, mặc định TẮT; cần `gamification`). Số dư chỉ đổi qua `CoinLedgerService`.
// Thưởng xu theo `xp.awarded` + đối soát hằng đêm chạy ở worker (`jobs/coins.jobs.ts` qua `register-jobs.ts`, SAU `gamification.jobs`). Cần `db push` model Coin*/ShopItem/UserInventory/UserQuestProgress + seed `seedCoins`.
v1.use(coinsRoutes);
// Chợ tài liệu (p7-02 P1) — `marketplace.routes.ts` tự khai path tuyệt đối ("/marketplace/listings*", "/me/listings", "/me/purchases"); cờ `coins` + `SystemConfig economy.marketplaceEnabled`
// (mặc định TẮT — chờ điều khoản bản quyền được duyệt) gắn ở từng route/service. Model MarketplaceListing/MarketplacePurchase đã có trong schema (Wave 1).
v1.use(marketplaceRoutes);
v1.use(adminEconomyRoutes);
// `burnout` (p7-03 Sức khoẻ học tập / burnout radar — bộ luật, OPT-IN, DỮ LIỆU SỨC KHOẺ TINH THẦN riêng tư). `burnout.routes.ts` tự khai path tuyệt đối ("/me/wellbeing*"), `admin-burnout.routes.ts` ("/admin/wellbeing/*",
// `gamification:view|update`, chỉ số liệu ẨN DANH ≥ 20 người + luật) — mount ở root v1; cờ `burnout` (mặc định TẮT; cần `gamification`) gắn ở từng route TRỪ đường tắt/xoá dữ liệu của người dùng (luôn dùng được).
// `registerBurnoutModule()` đăng ký loại thông báo `wellbeing.alert`; `registerBurnoutPresenceCollector()` (CHỈ API) nghe nhịp presence `active` để ghi khe hoạt động của NGƯỜI ĐÃ BẬT. Job/cron/sink ở worker
// (`jobs/burnout.jobs.ts` qua `register-jobs.ts`). Cần `db push` model WellbeingSetting/WellbeingDaily/BurnoutAssessment.
v1.use(burnoutRoutes);
v1.use(adminBurnoutRoutes);
registerBurnoutModule();
registerBurnoutPresenceCollector();
// `auth.new-device` (cảnh báo đăng nhập thiết bị lạ, push + hộp thư) — cần `db push` model KnownDevice.
registerAuthNotificationTypes();
// `plagiarism` (p7-05 Quét trùng lặp nội bộ — k-gram + winnowing tự viết, KHÔNG gọi mô hình/API ngoài, D-13).
// `plagiarism.routes.ts` tự khai path tuyệt đối ("/workspaces/:workspaceId/plagiarism/*", "/plagiarism/scans/*"),
// `admin-plagiarism.routes.ts` ("/admin/plagiarism/*", `system-config:view|update`, KHÔNG bao giờ trả tên tệp/điểm theo
// tệp) — mount ở root v1; cờ `plagiarism` (mặc định TẮT) gắn ở từng route người dùng qua `requireFeature`. Lập chỉ mục
// nền + chạy lượt quét ở worker (`jobs/plagiarism-*.job.ts` qua `register-jobs.ts`). `registerPlagiarismModule()` đăng
// ký loại thông báo `plagiarism.scan-completed|failed`.
v1.use(plagiarismRoutes);
v1.use(adminPlagiarismRoutes);
registerPlagiarismModule();
// be.md p0-01 §1/§4 đặt `/admin/users/:id/anonymize(/cancel)` dưới namespace
// `/admin/users` — cùng router `userRoutes` (mỗi route đã tự
// `requirePermission`/`requireSelfOrPermission`/`requireRoles`, không có gì
// lộ thêm khi mount lần 2 dưới prefix khác).
v1.use("/admin/users", userRoutes);

router.use("/v1", v1);

export default router;
