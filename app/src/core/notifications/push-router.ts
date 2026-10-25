import type { Href } from 'expo-router';

import { hrefOrActivity } from './notification-route';
import type { PushPayload } from './push-payload.types';

/**
 * Đổi payload push thành đường dẫn màn hình khi người dùng CHẠM thông báo (p0-06 `app.md` §4 "Tap").
 *
 * Bảng `type → route` nằm ở `notification-route.ts` (dùng chung với hộp thư Hoạt động, p1-07). Ở đây chỉ đổi `data`
 * của FCM (map chuỗi) thành `NotificationTarget` — kể cả quy ước riêng của push: `count` có mặt ⇒ tin GỘP ("N tin
 * nhắn mới"), không nhảy tới tin cụ thể.
 *
 * ⚠️ `app.md` p0-06 muốn đi qua deep-link resolver của p0-12 (`resolveDeepLink`) — resolver đó CHƯA có
 * (`src/shell/deeplink/*` không tồn tại). Đây là bản thay thế TẠM: hàm thuần, một điểm vào, trả `Href` của route ĐÃ
 * CÓ. Khi p0-12 xong thì thay thân hàm này — nơi gọi (`usePushTapRouting`) không đổi.
 *
 * Không kiểm quyền ở đây: màn đích tự gọi API và hiện trạng thái "không còn khả dụng" khi BE trả 403/404 (PUSH-12).
 * Loại chưa có màn đích hoặc loại lạ về `/activity`, nơi hộp thư thông báo ở.
 */
export function resolvePushHref(payload: PushPayload): Href {
  const count = Number(payload.count);
  return hrefOrActivity({
    applicationId: payload.applicationId,
    attemptId: payload.attemptId,
    boardId: payload.boardId,
    callId: payload.callId,
    coalesced: Number.isFinite(count) && count > 1,
    conversationId: payload.conversationId,
    documentId: payload.documentId,
    engagementId: payload.engagementId,
    exportId: payload.exportId,
    kind: payload.kind,
    lessonId: payload.lessonId,
    meetingId: payload.meetingId,
    messageId: payload.messageId,
    offerId: payload.offerId,
    orderId: payload.orderId,
    postId: payload.postId,
    reminderId: payload.reminderId,
    scheduledMessageId: payload.scheduledMessageId,
    // `thread.reply`: `threadId` = `rootMessageId` = id TIN GỐC (be.md p1-07 §15.4) — payload cũ chưa có `rootMessageId`.
    rootMessageId: payload.rootMessageId ?? payload.threadId,
    scopeId: payload.scopeId,
    scopeType: payload.scopeType,
    subjectId: payload.subjectId,
    taskId: payload.taskId,
    type: payload.type,
    unavailable: payload.unavailable === 'true' ? true : undefined, // FCM `data` là map chuỗi; vắng mặt (không phải `false`) khi không có
    workspaceId: payload.workspaceId,
  });
}

/** Kết quả xử lý một lượt chạm — để hook quyết định có `clearLastNotificationResponse` hay không, và để test. */
export type PushTapOutcome =
  | { href: Href; kind: 'navigate' }
  | { kind: 'ignored'; reason: 'not-authenticated' | 'other-user' | 'unrecognized' };

/**
 * Quyết định cho một lượt chạm. Thuần — `usePushTapRouting` lo phần `router.push`.
 *
 * `targetUserId` lệch người đang đăng nhập ⇒ bỏ (máy vừa đổi tài khoản, NT-07): mở màn của người cũ
 * cho người mới chỉ ra "không còn khả dụng" hoặc tệ hơn là lộ tên kênh.
 */
export function decidePushTap(
  payload: PushPayload | null,
  session: { authenticated: boolean; userId: string | null | undefined },
): PushTapOutcome {
  if (!payload) return { kind: 'ignored', reason: 'unrecognized' };
  if (!session.authenticated || !session.userId) {
    return { kind: 'ignored', reason: 'not-authenticated' };
  }
  if (payload.targetUserId !== session.userId) return { kind: 'ignored', reason: 'other-user' };
  return { href: resolvePushHref(payload), kind: 'navigate' };
}
