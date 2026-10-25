import * as Crypto from 'expo-crypto';

/**
 * `clientMessageId` PHẢI là UUID v4 THẬT — `sendMessageSchema.clientMessageId`
 * phía BE dùng `z.string().uuid()` (be.md §3), khác `newIdempotencyKey()`/
 * `newUploadLocalId()` của các feature khác (chuỗi tuỳ ý, BE không kiểm định dạng).
 *
 * ⛔ Không gọi thẳng `Crypto.randomUUID()`: đã đo THẬT trong Jest của chính repo
 * này (`core/device/device-id.ts`) — `jest-expo` không cài module native của
 * `expo-crypto`, hàm trả `undefined` ÊM RU, không ném lỗi. Dự phòng bằng một bộ
 * sinh UUID v4 thuần `Math.random()` — không cần an toàn mật mã cho một khoá
 * chống trùng gửi tin, chỉ cần ĐÚNG ĐỊNH DẠNG để qua được `.uuid()`.
 */
function fallbackUuidV4(): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

export function newClientMessageId(): string {
  try {
    const id = Crypto.randomUUID();
    if (id) return id;
  } catch {
    // rơi xuống dự phòng
  }
  return fallbackUuidV4();
}
