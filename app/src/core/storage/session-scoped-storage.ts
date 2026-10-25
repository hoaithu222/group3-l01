import AsyncStorage from '@react-native-async-storage/async-storage';

import { logger } from '@/shared/utils/logger';

import { readJson, removeKey, writeJson } from './app-storage';

/**
 * Kho `AsyncStorage` THEO NGƯỜI DÙNG — mọi khoá có tiền tố `u:<userId>:` (p0-12, NT-07).
 *
 * ── Vì sao ───────────────────────────────────────────────────────────────────
 * Máy dùng chung: người A đăng xuất, người B đăng nhập. Khoá `AsyncStorage` của A (nháp, bộ lọc gần
 * nhất, từ khoá tìm…) mà đặt tên tuỳ hứng thì (1) B có thể đọc nhầm, (2) không có cách nào dọn "mọi
 * thứ của A" — mỗi feature phải nhớ tự xoá, và store mới quên là rò rỉ. Gom về MỘT tiền tố thì
 * `removeAllForUser(A)` xoá sạch trong một lượt, và `wipeUserData()` (`shell/session`) gọi nó cho MỌI
 * đường rời phiên (đăng xuất, phiên chết, đổi tài khoản) — feature dùng kho này KHÔNG phải viết
 * thêm dòng dọn nào.
 *
 * ── Quy ước cho feature ──────────────────────────────────────────────────────
 * Dữ liệu sinh ra bởi MỘT người dùng và không được người khác thấy (nháp, tuỳ chọn cá nhân…) → dùng
 * `readScoped/writeScoped(userId, 'tên-khoá', …)`. Dữ liệu của MÁY/hệ thống (deviceId, cờ phân hệ,
 * giao diện sáng/tối) → `app-storage.ts` thường, KHÔNG nằm ở đây. Token/bí mật → `secure-storage.ts`.
 *
 * ⛔ KHÔNG mã hoá (cùng `app-storage.ts`): đừng ghi nội dung tin nhắn riêng tư ở dạng rõ nếu chưa có
 * quyết định sản phẩm (nháp bền có mã hoá là P1 của Communication Hub).
 *
 * `userId` phải khớp `USER_ID_PATTERN` (ObjectId, uuid…) — id chứa `:` sẽ làm tiền tố của người này
 * trùm lên khoá của người kia (`u:a:` khớp `u:a:b:…`), nên bị từ chối im lặng (đọc `null`, ghi `false`).
 */

const SCOPE_MARK = 'u:';
const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidScopedUserId(userId: string | null | undefined): userId is string {
  return typeof userId === 'string' && USER_ID_PATTERN.test(userId);
}

/** Tiền tố của MỘT người dùng — luôn kết thúc bằng `:` để `u:ab:` không khớp `u:abc:…`. */
export function scopePrefix(userId: string): string {
  return `${SCOPE_MARK}${userId}:`;
}

/** `u:<userId>:<name>`. */
export function scopedKey(userId: string, name: string): string {
  return `${scopePrefix(userId)}${name}`;
}

export async function readScoped<T>(
  userId: string | null | undefined,
  name: string,
): Promise<T | null> {
  return isValidScopedUserId(userId) ? readJson<T>(scopedKey(userId, name)) : null;
}

/** Trả `false` khi không ghi được (id không hợp lệ, hết dung lượng). */
export async function writeScoped(
  userId: string | null | undefined,
  name: string,
  value: unknown,
): Promise<boolean> {
  return isValidScopedUserId(userId) ? writeJson(scopedKey(userId, name), value) : false;
}

export async function removeScoped(userId: string | null | undefined, name: string): Promise<void> {
  if (isValidScopedUserId(userId)) await removeKey(scopedKey(userId, name));
}

/**
 * Xoá MỌI khoá `u:<userId>:*` — chỉ của người đó, khoá của người khác giữ nguyên. Trả số khoá đã xoá.
 * Không bao giờ ném lỗi: dọn phiên không được chết vì một lượt đọc danh sách khoá hỏng.
 */
export async function removeAllForUser(userId: string | null | undefined): Promise<number> {
  if (!isValidScopedUserId(userId)) return 0;
  try {
    const prefix = scopePrefix(userId);
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefix));
    if (keys.length > 0) await AsyncStorage.multiRemove(keys);
    return keys.length;
  } catch (error) {
    logger.warn('[session-scoped-storage] không xoá được khoá theo người dùng:', error);
    return 0;
  }
}
