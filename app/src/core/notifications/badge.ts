import * as Notifications from 'expo-notifications';

/**
 * Số huy hiệu trên icon app (p0-06 `app.md` §4 "Badge").
 *
 * Đây chỉ là PRIMITIVE. Nguồn số (tổng chưa đọc) là `unread summary` của p1-07 — p1-07 nối `badgeTotal`
 * vào đây. iOS cần quyền `allowBadge` (đã xin cùng quyền thông báo); launcher Android không hỗ trợ
 * huy hiệu thì lời gọi trả `false` — bình thường, không phải lỗi.
 */
export async function setAppBadgeCount(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, Math.floor(count)));
  } catch {
    // Không đặt được huy hiệu không đáng làm hỏng luồng gọi (đăng xuất, đồng bộ đọc).
  }
}
