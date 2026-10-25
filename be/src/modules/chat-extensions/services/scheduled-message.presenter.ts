import type { ScheduledMessageEntity, ScheduledMessageUpdatedPayload, ScheduledMessageView } from "../entities/chat-extensions.types";
import type { ChatAssetRef } from "../repositories/chat-directory.interface";

/**
 * Tin hẹn giờ cho TÁC GIẢ. `scopeLabel` tính theo quyền HIỆN TẠI (`null` khi không còn thấy phạm vi — không lộ tên kênh đã mất quyền); `attachments` chỉ là thông tin hiển thị
 * (tệp thiếu/đã xoá vẫn có `assetId`). Nội dung chỉ tồn tại khi còn cần (PENDING/FAILED không scrub) — tin đã phát hiển thị qua `Message`.
 */
export function toScheduledView(m: ScheduledMessageEntity, scopeLabel: string | null, files: Map<string, ChatAssetRef>): ScheduledMessageView {
  return {
    id: m.id,
    scopeType: m.scopeType,
    scopeId: m.scopeId,
    threadId: m.threadId,
    scopeLabel,
    content: m.content,
    mentions: m.mentions,
    attachments: m.attachmentAssetIds.map((id) => files.get(id) ?? { assetId: id, name: "", mime: "", size: 0 }),
    replyToId: m.replyToId,
    sendAt: m.sendAt,
    timezone: m.timezone,
    status: m.status,
    messageId: m.messageId,
    failReason: m.failReason,
    failCode: m.failCode,
    version: m.version,
    createdAt: m.createdAt,
  };
}

/** Payload `scheduled-message:updated` (tới `user:{authorId}`, đa thiết bị) — KHÔNG có nội dung/tệp. */
export function toScheduledUpdatedPayload(m: ScheduledMessageEntity): ScheduledMessageUpdatedPayload {
  return { id: m.id, status: m.status, sendAt: m.sendAt, messageId: m.messageId, failReason: m.failReason, version: m.version };
}
