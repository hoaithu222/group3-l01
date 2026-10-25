import * as Crypto from 'expo-crypto';

/**
 * UUID cho `clientCallId` (BE `z.string().uuid()`): sinh KHI BẤM gọi, giữ để thử lại dùng lại cùng id (CL-09).
 * `Crypto.randomUUID()` trả `undefined` ÊM trong Jest (không có module native) — có đường lui dạng UUID v4 hợp lệ.
 */
export function newClientCallId(): string {
  let id: string | undefined;
  try {
    id = Crypto.randomUUID();
  } catch {
    id = undefined;
  }
  if (typeof id === 'string' && id.length === 36) return id;
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r % 4) + 8).toString(16);
  });
}
