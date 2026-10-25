import * as Crypto from 'expo-crypto';

/**
 * `clientMessageId` của tin trong lời mời (`offerMessageSchema`: chuỗi 8–64 ký tự, idempotent theo (người gửi, id)) — UUID v4 cho khó trùng.
 *
 * ⛔ Không gọi thẳng `Crypto.randomUUID()`: `jest-expo` không cài module native của `expo-crypto`, hàm trả `undefined` ÊM RU (đã đo THẬT ở
 * `features/chat/utils/client-message-id.ts` — file đó không import chéo được nên khai lại). Dự phòng `Math.random()` chỉ cần khác nhau
 * và đủ độ dài, không cần an toàn mật mã: đây là khoá chống nhân đôi khi gửi lại, không phải bí mật.
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
