import { withTransaction } from "../../../infrastructure/database";
import { registerJob } from "../../../infrastructure/queue";
import { notify } from "../../notifications/public";
import { MODERATION_NOTIFICATION_TYPES, registerModerationNotificationTypes } from "../moderation.notification-types";
import { PrismaModerationDirectory } from "../repositories/moderation-directory.repository.prisma";
import { dayKey } from "./day-key";

registerModerationNotificationTypes();

const directory = new PrismaModerationDirectory();

interface PrivateViewedPayload {
  reportId: string;
  scopeType: "CHANNEL" | "CONVERSATION";
  scopeId: string;
  workspaceId: string | null;
  isDirect: boolean;
  participantIds: string[];
  viewedAt: string;
}

interface AuthorWarnedPayload {
  groupKey: string;
  authorId: string;
  reason: string;
  resolvedAt: string;
}

/**
 * `moderation.private-viewed.notify` (D-06, be.md p1-08 §5.5) — mỗi lần moderator xem nội dung riêng tư đều có audit, nhưng
 * THÔNG BÁO tối đa 1/report/ngày: kênh private/nhóm chat → OWNER workspace; 1-1 → hai người trong hội thoại ("Đội kiểm duyệt
 * đã xem nội dung bị báo cáo trong cuộc trò chuyện"). Không nêu danh tính moderator, không chứa nội dung.
 */
registerJob("notifications", "moderation.private-viewed.notify", async (job) => {
  const p = job.data as PrivateViewedPayload;
  const day = dayKey(new Date(p.viewedAt));
  const dedupeKey = `moderation.private-viewed:${p.reportId}:${day}`;
  if (await directory.notificationExists(dedupeKey)) return;

  const ownerId = p.isDirect || !p.workspaceId ? null : await directory.findWorkspaceOwnerId(p.workspaceId);
  const recipientIds = p.isDirect ? p.participantIds : ownerId ? [ownerId] : [];
  if (recipientIds.length === 0) return;

  await withTransaction((tx) =>
    notify(tx, {
      type: MODERATION_NOTIFICATION_TYPES.PRIVATE_VIEWED,
      scope: !p.isDirect && p.workspaceId ? { type: "WORKSPACE", id: p.workspaceId } : null,
      workspaceId: p.workspaceId ?? undefined,
      source: { type: "Report", id: `${p.reportId}:${day}` },
      refs: { scopeType: p.scopeType, scopeId: p.scopeId, isDirect: p.isDirect },
      recipients: recipientIds.map((userId) => ({ userId })),
      dedupeKey,
    })
  );
});

/** `moderation.author-warned` — hộp thư tác giả `MODERATION_WARNING`, KHÔNG nêu người báo cáo (be.md p1-08 §5.4 bước 3). */
registerJob("notifications", "moderation.author-warned", async (job) => {
  const p = job.data as AuthorWarnedPayload;
  const stamp = new Date(p.resolvedAt).getTime();
  const dedupeKey = `moderation.author-warned:${p.groupKey}:${stamp}`;
  if (await directory.notificationExists(dedupeKey)) return;

  await withTransaction((tx) =>
    notify(tx, {
      type: MODERATION_NOTIFICATION_TYPES.WARNING,
      scope: null,
      source: { type: "ReportGroup", id: `${p.groupKey}:${stamp}` },
      refs: { reason: p.reason },
      recipients: [{ userId: p.authorId }],
      dedupeKey,
    })
  );
});
