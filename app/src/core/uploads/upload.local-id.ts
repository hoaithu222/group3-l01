/**
 * Id CỤC BỘ cho một lượt upload — khoá của `upload.store` và
 * `Idempotency-Key` của `POST /assets`.
 *
 * ⛔ KHÔNG dùng `Crypto.randomUUID()` (`expo-crypto`): trong Jest nó lặng lẽ
 * trả `undefined` (đã đo ở `core/device/device-id.ts`, xem chú thích ở đó), và
 * ở đây không cần độ ngẫu nhiên cấp mật mã — chỉ cần KHÔNG TRÙNG trong một
 * phiên chạy app.
 */
let counter = 0;

export function newUploadLocalId(): string {
  counter += 1;
  const random = Math.random().toString(36).slice(2, 10);
  return `upl-${Date.now().toString(36)}-${counter}-${random}`;
}
