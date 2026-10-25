import type { NotificationBehavior } from 'expo-notifications';

import {
  isDataOnlyPushType,
  isScopeSuppressiblePushType,
  type PushPayload,
} from './push-payload.types';

/**
 * Quyết định có hiện banner khi push tới LÚC APP ĐANG MỞ (p0-06 `app.md` §4 "Nhận push foreground").
 * Hàm thuần — `isViewing` và `currentUserId` do nơi gọi truyền vào nên test không cần socket.
 *
 * Push tới khi app ở NỀN/đã tắt do hệ điều hành hiển thị thẳng, handler này KHÔNG chạy — nên
 * chuyện "máy vừa đổi tài khoản" ở trạng thái nền được BE lo (gỡ token lúc logout), không phải chỗ này.
 */

/** Lý do ẩn — để log/test, không hiện cho người dùng. */
export type ForegroundHideReason =
  /** Loại data-only (`call.*`) — UI do p2-02 vẽ. */
  | 'data-only'
  /** `targetUserId` khác người đang đăng nhập (NT-07). */
  | 'other-user'
  /** Không phải push của BE này (thiếu `type`/`targetUserId`). */
  | 'unrecognized'
  /** Tin nhắn thuộc cuộc trò chuyện KHÁC: app tự vẽ banner riêng (p1-07 §4.4), không để hệ điều hành vẽ thêm bản thứ hai. */
  | 'in-app-banner'
  /** Đang mở đúng kênh/hội thoại — tin đã hiện ngay trên màn hình. */
  | 'viewing-scope';

export type ForegroundVerdict = { reason: ForegroundHideReason; show: false } | { show: true };

export interface ForegroundContext {
  /** `undefined`/`null` khi chưa biết người dùng — coi như KHÔNG khớp (ẩn), an toàn hơn hiện nhầm. */
  currentUserId: string | null | undefined;
  /** Người dùng đang mở đúng scope này (đã join room). */
  isViewing: (scopeType: string, scopeId: string) => boolean;
}

/** Loại push tin nhắn — banner do CHÍNH app vẽ khi foreground (`InAppMessageBannerHost`), thay banner hệ thống. */
const IN_APP_BANNER_TYPES: ReadonlySet<string> = new Set([
  'message.new',
  'mention',
  'mention.role',
  'thread.reply',
]);

export function usesInAppBanner(type: string): boolean {
  return IN_APP_BANNER_TYPES.has(type);
}

export function decideForeground(
  payload: PushPayload | null,
  context: ForegroundContext,
): ForegroundVerdict {
  // Mọi payload của BE đều có `targetUserId` (be.md §6.2). Thiếu = không xác minh được người nhận
  // ⇒ ẩn: hiện nhầm thông báo của người khác trên máy dùng chung tệ hơn bỏ lỡ một banner foreground
  // (tin vẫn tới qua socket + inbox).
  if (!payload) return { reason: 'unrecognized', show: false };
  if (!context.currentUserId || payload.targetUserId !== context.currentUserId) {
    return { reason: 'other-user', show: false };
  }
  if (isDataOnlyPushType(payload.type)) return { reason: 'data-only', show: false };

  /**
   * Chỉ push TIN NHẮN bị ẩn theo scope. `meeting.*`/`call.missed` luôn hiện: nhắc họp đúng lúc
   * người dùng đang chat trong hội thoại của cuộc họp vẫn là thứ họ cần thấy.
   *
   * ⚠️ `thread.reply` cố ý KHÔNG ẩn ở client: người nhận có thể đang xem KÊNH nhưng không xem luồng đó.
   * BE mới đủ dữ liệu (`viewing:*` có `threadId`, p1-07 §9) để quyết định — client chỉ biết scope.
   */
  if (
    isScopeSuppressiblePushType(payload.type) &&
    payload.scopeType &&
    payload.scopeId &&
    context.isViewing(payload.scopeType, payload.scopeId)
  ) {
    return { reason: 'viewing-scope', show: false };
  }

  return { show: true };
}

const SHOWN: NotificationBehavior = {
  shouldPlaySound: true,
  shouldSetBadge: false,
  shouldShowBanner: true,
  shouldShowList: true,
};

const HIDDEN: NotificationBehavior = {
  shouldPlaySound: false,
  shouldSetBadge: false,
  shouldShowBanner: false,
  shouldShowList: false,
};

/**
 * Đổi kết luận thành hành vi của expo-notifications.
 *
 * `shouldSetBadge: false` ở cả hai nhánh: khi app đang mở, số huy hiệu do unread summary phía
 * app (p1-07) nắm — để push đặt huy hiệu thì hai nguồn giật qua lại. Huy hiệu iOS lúc app ở nền
 * vẫn do `aps.badge` của BE đặt.
 */
export function toNotificationBehavior(verdict: ForegroundVerdict): NotificationBehavior {
  return verdict.show ? SHOWN : HIDDEN;
}
