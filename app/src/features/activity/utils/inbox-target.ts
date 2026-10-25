import type { InboxItem, NotificationTarget } from '@/core/notifications';

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * `InboxItem` → đích điều hướng (p1-07 `be.md` §15.3). Bảng `type → route` là của app (`hrefForTarget`); BE chỉ bảo
 * đảm đủ id trong `refs`. `threadId` của mục là id TIN GỐC của luồng (KHÔNG phải `Thread.id`) — dùng cho
 * `/thread/[messageId]`.
 *
 * Mục `unavailable` (mất quyền) đã bị BE xoá `refs`/`scopeId` — không dựng đích, nơi gọi hiện thông báo trung tính.
 */
export function inboxItemTarget(item: InboxItem): NotificationTarget {
  const refs = item.refs ?? {};
  return {
    // p6-03: `mentor.*` mang id bài/đơn/đợt/nhóm chat ở `refs` — `mentor-route.ts` chọn màn đích theo loại.
    applicationId: text(refs.applicationId),
    // p4-02: `study.mock-auto-submitted` mang lượt thi ở `refs.attemptId` — mở đúng kết quả lượt đó.
    attemptId: text(refs.attemptId),
    boardId: text(refs.boardId),
    conversationId: text(refs.conversationId),
    // p6-01: `document.collaborator-added` mang `refs.documentId` (+ `role`) — mở thẳng tài liệu vừa được mời.
    documentId: text(refs.documentId),
    engagementId: text(refs.engagementId),
    // p4-06: `contribution.export-ready|failed` mang lượt xuất ở `refs.exportId` — mở màn "Đóng góp" của bảng kèm trạng thái lượt đó.
    exportId: text(refs.exportId),
    // p2-06: `meeting.recap-reminder` mang `refs.kind = "RECAP"`.
    kind: text(refs.kind),
    // p2-04: `meeting.*` mang `refs.meetingId` — mở chi tiết cuộc họp.
    meetingId: text(refs.meetingId),
    messageId: item.messageId ?? text(refs.messageId),
    // p6-08: `job-offer.*` mang `refs.offerId` (+ `companyId`, `companyName`) — mở chi tiết/thread của lời mời đó.
    offerId: text(refs.offerId),
    // p6-05: `print-order.*` mang `refs.orderId` (+ `code`) — mở vé đơn in.
    orderId: text(refs.orderId),
    postId: text(refs.postId),
    // p7-04: `message.reminder` mang `refs.reminderId` (+ `unavailable` khi tin đã gỡ); `scheduled-message.failed` mang `refs.scheduledMessageId`.
    reminderId: text(refs.reminderId),
    scheduledMessageId: text(refs.scheduledMessageId),
    // p2-06: `meeting.recording-ready` mang `refs.recordingId` — mở đúng bản ghi.
    recordingId: text(refs.recordingId),
    rootMessageId: item.threadId ?? text(refs.threadId),
    scopeId: item.scopeId ?? undefined,
    scopeType: item.scopeType,
    // p4-04: `task.rescheduled` mang thẻ NGUỒN ở `refs.sourceTaskId` (be.md §7) — mở thẻ đã đổi hạn.
    taskId: text(refs.taskId) ?? text(refs.sourceTaskId),
    type: item.type,
    unavailable: refs.unavailable === true || refs.unavailable === 'true' ? true : undefined,
    workspaceId: item.workspaceId ?? text(refs.workspaceId),
  };
}

/** Mục không còn mở được nội dung: BE đánh dấu mất quyền, hoặc ngữ cảnh tính lúc đọc báo không khả dụng. */
export function isInboxItemUnavailable(item: InboxItem): boolean {
  return item.unavailable || item.context?.available === false;
}
