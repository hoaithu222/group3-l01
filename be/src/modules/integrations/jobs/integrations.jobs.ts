import type { Job } from "bullmq";
import { defineCron, registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { registerMeetingEventSink } from "../../meetings";
import { getIntegrationsContainer } from "../integrations.container";
import type { CalendarSyncJob } from "../services/integration.ports";
import {
  CALENDAR_CLEANUP_JOB,
  CALENDAR_SYNC_JOB,
  INTEGRATIONS_QUEUE,
  TARGET_RECHECK_JOB,
  TOKEN_REFRESH_JOB,
  WEBHOOK_PROCESS_JOB,
  type TokenRefreshJobData,
  type WebhookProcessJobData,
} from "../services/integration-jobs";
import { registerIntegrationNotificationTypes } from "../services/integration-notification-types";
import { registerIntegrationRevokeListener } from "./integration-revoke-listener";

/**
 * Job của module tích hợp (p5-03 be.md §7) — file side-effect nạp qua `register-jobs.ts` (worker riêng không import `router.ts`). Queue `integrations`
 * (p0-04 đã có); cron TĨNH ở queue `cron` (không scheduler theo thực thể). Đăng ký lại loại thông báo + listener thu hồi quyền để giữ parity API ↔ worker.
 */
registerIntegrationNotificationTypes();
registerIntegrationRevokeListener();

/** Sink của `meeting.events` (p2-04): chỉ XẾP job `calendar.sync-meeting` cho từng người — gọi Google ở job riêng (retry riêng, không kéo sink khác). */
registerMeetingEventSink("p5-03.calendar", async (payload) => {
  await getIntegrationsContainer().calendarSync.onMeetingEvent(payload);
});

/** Webhook đã ghi nhận → tin hệ thống `INTEGRATION`. Lỗi tạm thời ném lên (retry theo outbox/BullMQ); lỗi đích → FAILED + kết nối ERROR (không ném). */
registerJob(INTEGRATIONS_QUEUE, WEBHOOK_PROCESS_JOB, async (job: Job) => {
  const { webhookEventId } = job.data as WebhookProcessJobData;
  if (!webhookEventId) return;
  const outcome = await getIntegrationsContainer().webhookProcess.process(webhookEventId);
  logger.debug("[integrations.webhook-process] xong", { webhookEventId, outcome });
});

/** Làm mới token trước hạn (`tokenExpiresAt − 5 phút`); job cũ (token đã sang mốc khác) tự bỏ qua; `invalid_grant` → REVOKED + thông báo. */
registerJob(INTEGRATIONS_QUEUE, TOKEN_REFRESH_JOB, async (job: Job) => {
  const data = job.data as TokenRefreshJobData;
  if (!data?.id) return;
  const tokens = getIntegrationsContainer().deps.tokens;
  const outcome = data.kind === "USER" ? await tokens.refreshUser(data.id, data.expiresAtMs) : await tokens.refreshWorkspace(data.id, data.expiresAtMs);
  logger.debug("[integration.token-refresh] xong", { id: data.id, kind: data.kind, outcome });
});

/** Đẩy MỘT cuộc họp lên lịch Google của MỘT người (idempotent theo `syncedVersion`). */
registerJob(INTEGRATIONS_QUEUE, CALENDAR_SYNC_JOB, async (job: Job) => {
  const data = job.data as CalendarSyncJob;
  if (!data?.meetingId || !data.userId) return;
  await getIntegrationsContainer().calendarSync.syncMeeting(data);
});

/** Sau khi ngắt Google Calendar: xoá sự kiện tương lai, thu hồi token, xoá kết nối. */
registerJob(INTEGRATIONS_QUEUE, CALENDAR_CLEANUP_JOB, async (job: Job) => {
  const { userIntegrationId } = job.data as { userIntegrationId?: string };
  if (!userIntegrationId) return;
  await getIntegrationsContainer().calendarSync.cleanupUser(userIntegrationId);
});

/** INT-06: sau thu hồi quyền, kiểm lại đích của các kết nối do người bị thu hồi cấu hình. */
registerJob(INTEGRATIONS_QUEUE, TARGET_RECHECK_JOB, async (job: Job) => {
  const data = job.data as { scopeType?: string; scopeId?: string; userIds?: string[] };
  if (!data?.scopeType || !data.scopeId || !Array.isArray(data.userIds)) return;
  const changed = await getIntegrationsContainer().maintenance.recheckTargets({ scopeType: data.scopeType, scopeId: data.scopeId, userIds: data.userIds });
  if (changed > 0) logger.info("[integrations.target-recheck] kết nối chuyển ERROR", { scope: `${data.scopeType}:${data.scopeId}`, changed });
});

/** Cron TĨNH 03:00: xoá payload quá `eventsLogRetentionDays` (không phát lại được nữa) + dòng log quá `eventsRowRetentionDays`. */
registerJob("cron", "integrations.events-retention", async () => {
  const result = await getIntegrationsContainer().maintenance.pruneEvents();
  if (result.cleared > 0 || result.deleted > 0) logger.info("[integrations.events-retention] đã dọn", result);
});
defineCron({ schedulerId: "integrations.events-retention", queue: "cron", jobName: "integrations.events-retention", pattern: "0 3 * * *", opts: { attempts: 1 } });

/** Cron TĨNH mỗi giờ: kết nối ACTIVE lâu không có sự kiện → kiểm cài đặt/hook còn tồn tại (REVOKED/HOOK_MISSING → thông báo). */
registerJob("cron", "integrations.health-check", async () => {
  const result = await getIntegrationsContainer().maintenance.healthCheck();
  if (result.changed > 0) logger.info("[integrations.health-check] kết nối đổi trạng thái", result);
});
defineCron({ schedulerId: "integrations.health-check", queue: "cron", jobName: "integrations.health-check", pattern: "17 * * * *", opts: { attempts: 1 } });
