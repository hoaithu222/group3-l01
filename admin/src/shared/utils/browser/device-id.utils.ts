/**
 * @file device-id.utils.ts
 * @description Định danh thiết bị ổn định cho admin web — BE dùng để phân biệt
 * nhiều tab/trình duyệt của CÙNG một user trong registry kết nối Socket.IO đa
 * thiết bị (`docs/plans/phase-0-common/p0-03-realtime-core/README.md` §4
 * `conn:{userId}` HASH `socketId → {deviceId, platform, instanceId}`).
 *
 * ⚠️ KHÔNG phải định danh bảo mật/chống gian lận — chỉ để gộp nhóm kết nối
 * hiển thị phía vận hành. Mất giá trị này (xoá `localStorage`, chế độ ẩn danh)
 * chỉ khiến BE thấy như "một thiết bị mới", không ảnh hưởng gì tới xác thực.
 */
const DEVICE_ID_KEY = 'device.id';

/**
 * Đọc `device.id` khỏi `localStorage`; sinh UUID mới (lưu lại) nếu chưa có.
 *
 * `localStorage` có thể ném lỗi ở chế độ duyệt web riêng tư nghiêm ngặt — vẫn
 * trả về một UUID hợp lệ cho phiên hiện tại, chỉ là không nhớ được qua lần tải
 * trang sau (chấp nhận được, đây không phải định danh bắt buộc bền vững).
 */
export function getOrCreateDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_ID_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}
