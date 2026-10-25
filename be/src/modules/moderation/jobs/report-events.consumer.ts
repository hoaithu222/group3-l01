import { withTransaction } from "../../../infrastructure/database";
import { registerJob } from "../../../infrastructure/queue";
import { emitToRoom } from "../../../infrastructure/socket/socket.emit";
import { ROOM } from "../../../infrastructure/socket";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { logger } from "../../../infrastructure/logger";
import { getReportTargetExtension } from "../../../shared/ports/report.port";
import { notify } from "../../notifications/public";
import { MODERATION_NOTIFICATION_TYPES, registerModerationNotificationTypes } from "../moderation.notification-types";
import { PrismaReportRepository } from "../repositories/report.repository.prisma";
import { PrismaModerationDirectory } from "../repositories/moderation-directory.repository.prisma";
import { listScopeHandlerIds } from "../services/report-handlers";
import { dayKey } from "./day-key";

registerModerationNotificationTypes();

const repo = new PrismaReportRepository();
const directory = new PrismaModerationDirectory();

type ReportEventPayload =
  | { event: "created"; reportId: string; groupKey: string }
  | {
      event: "resolved";
      groupKey: string;
      targetType: string;
      status: string;
      resolution: string;
      resolvedAt: string;
      reporterIds: string[];
      authorId: string | null;
      messageId: string | null;
      reason: string;
    }
  | { event: "content-removed"; messageId: string; authorId: string; reason: string };

async function onCreated(reportId: string): Promise<void> {
  const report = await repo.findById(reportId);
  if (!report) {
    logger.warn("[report.events] báo cáo không còn tồn tại, bỏ qua", { reportId });
    return;
  }
  const open = await repo.findByGroupKey(report.groupKey, "OPEN");
  // Socket cho admin nền tảng đang mở `admin:moderation` — CHỈ id + số đếm, không nội dung (be.md §6). Emit lặp vô hại.
  emitToRoom(ROOM.admin("moderation"), SocketEvent.MODERATION_REPORT_CREATED, {
    groupKey: report.groupKey,
    targetType: report.targetType,
    reportCount: open.length,
  });
  // Đích do module khác sở hữu (p4-01 `STUDY_SET`): cập nhật số liệu phi chuẩn hoá (`reportedCount`) — đặt tuyệt đối theo số báo cáo mở nên retry vô hại.
  await getReportTargetExtension(report.targetType)?.onReportCreated?.({ targetId: report.targetId, openCount: open.length });

  if (report.handlerLevel !== "SCOPE") return;
  // Người báo cáo không tự nhận thông báo "có báo cáo mới"; `actorId` KHÔNG truyền vào `notify()` để không lộ người báo cáo.
  const recipients = (await listScopeHandlerIds(directory, report)).filter((id) => id !== report.reporterId);
  if (recipients.length === 0) return;

  const day = dayKey(new Date());
  const dedupeKey = `moderation.request:${report.groupKey}:${day}`;
  if (await directory.notificationExists(dedupeKey)) return; // đã báo trong ngày cho nhóm này
  await withTransaction((tx) =>
    notify(tx, {
      type: MODERATION_NOTIFICATION_TYPES.REQUEST,
      scope: report.workspaceId ? { type: "WORKSPACE", id: report.workspaceId } : null,
      workspaceId: report.workspaceId ?? undefined,
      source: { type: "ReportGroup", id: `${report.groupKey}:${day}` },
      refs: {
        groupKey: report.groupKey,
        targetType: report.targetType,
        scopeType: report.scopeType,
        scopeId: report.scopeId,
        workspaceId: report.workspaceId,
      },
      recipients: recipients.map((userId) => ({ userId })),
      dedupeKey,
    })
  );
}

async function notifyAuthorRemoved(input: { messageId: string; authorId: string; reason: string }): Promise<void> {
  const dedupeKey = `moderation.content-removed:${input.messageId}`;
  if (await directory.notificationExists(dedupeKey)) return;
  await withTransaction((tx) =>
    notify(tx, {
      type: MODERATION_NOTIFICATION_TYPES.CONTENT_REMOVED,
      scope: null,
      source: { type: "Message", id: input.messageId },
      // `reason` = lý do do NGƯỜI KIỂM DUYỆT nhập (không phải nội dung tin) — hiện cho tác giả "bị gỡ vì …".
      refs: { messageId: input.messageId, reason: input.reason },
      recipients: [{ userId: input.authorId }],
      dedupeKey,
    })
  );
}

async function onResolved(p: Extract<ReportEventPayload, { event: "resolved" }>): Promise<void> {
  emitToRoom(ROOM.admin("moderation"), SocketEvent.MODERATION_REPORT_UPDATED, {
    groupKey: p.groupKey,
    status: p.status,
    resolution: p.resolution,
  });

  const stamp = new Date(p.resolvedAt).getTime();
  const reporterKey = `moderation.report-resolved:${p.groupKey}:${stamp}`;
  if (p.reporterIds.length > 0 && !(await directory.notificationExists(reporterKey))) {
    // Người báo cáo: "Báo cáo của bạn đã được xử lý" — KHÔNG chi tiết (không lý do/hành động), không nêu người xử lý.
    await withTransaction((tx) =>
      notify(tx, {
        type: MODERATION_NOTIFICATION_TYPES.REPORT_RESOLVED,
        scope: null,
        source: { type: "ReportGroup", id: `${p.groupKey}:${stamp}` },
        refs: { targetType: p.targetType, status: p.status },
        recipients: p.reporterIds.map((userId) => ({ userId })),
        dedupeKey: reporterKey,
      })
    );
  }

  if (p.resolution === "CONTENT_REMOVED" && p.authorId && p.messageId) {
    await notifyAuthorRemoved({ messageId: p.messageId, authorId: p.authorId, reason: p.reason });
  }
}

/**
 * `report.events` (queue `notifications`) — MỘT processor cho `report.created`/`report.resolved`/`content-removed` qua `payload.event`
 * (registry chỉ giữ 1 processor/(queue, jobName)). Idempotent: socket emit lặp vô hại; mỗi `notify()` chỉ chạy khi
 * `Notification.dedupeKey` chưa tồn tại (`notify()` không idempotent với outbox `deliver` nên phải kiểm trước).
 */
registerJob("notifications", "report.events", async (job) => {
  const payload = job.data as ReportEventPayload;
  switch (payload.event) {
    case "created":
      await onCreated(payload.reportId);
      break;
    case "resolved":
      await onResolved(payload);
      break;
    case "content-removed":
      await notifyAuthorRemoved(payload);
      break;
  }
});
