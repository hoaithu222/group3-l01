import * as Crypto from 'expo-crypto';

import { readSecure, writeSecure } from '@/core/storage/secure-storage';

/**
 * Định danh thiết bị ỔN ĐỊNH, sinh MỘT LẦN mỗi lượt cài app.
 *
 * Dùng cho ba việc, cả ba đọc CHUNG một `deviceId`:
 *  · handshake Socket.IO (`socket.client.ts`, p0-03) — registry đa thiết bị
 *    phân biệt "user này có mấy kết nối, từ máy nào".
 *  · header `X-Device-Id` của `POST /auth/refresh` (`core/api/session.ts`) và
 *    của `apiClient` — BE cần nó để trả `refreshToken` mới trong BODY thay vì
 *    `Set-Cookie` (đường dành cho web).
 *  · `POST /auth/biometric/enroll`/`login` — BE ghép `activeKey =
 *    "<userId>:<deviceId>"`, thiếu field này sinh trắc học không hoạt động
 *    được (p0-06/p0-13).
 *
 * ⛔ CHỈ MỘT nguồn sinh `deviceId` trong toàn app — đừng viết một bản khác ở
 * feature nào đó "cho tiện", hai `deviceId` khác nhau trên cùng máy làm BE
 * tưởng đó là hai thiết bị.
 *
 * ── Vì sao SecureStore, KHÔNG phải AsyncStorage ──────────────────────────────
 * `deviceId` tự nó không phải bí mật, nhưng nó là một phần khoá xác thực sinh
 * trắc học (`activeKey`) và là định danh registry kết nối realtime — đổi/giả
 * mạo được thì một máy có thể MẠO DANH một thiết bị khác trong hai luồng đó.
 * `AGENTS.md` điều 5 cấm để bất cứ thứ gì liên quan xác thực ngoài kho khoá hệ
 * điều hành; `AsyncStorage` trên Android là SQLite trần, đọc được trên máy đã
 * root hoặc qua bản sao lưu ADB.
 */

const DEVICE_ID_STORAGE_KEY = 'device.id.v1';

/** Giữ trong bộ nhớ để không phải đọc `SecureStore` lại ở mỗi lượt gọi (kho khoá chậm hơn `AsyncStorage`). */
let cached: string | null = null;
let inflight: Promise<string> | null = null;

/**
 * Đường lui khi `Crypto.randomUUID()` không dùng được.
 *
 * ⚠️ Không chỉ là phòng xa lý thuyết — đã đo THẬT trong môi trường Jest của
 * chính repo này: `jest-expo` không cài mô-đun native cho `expo-crypto`, và
 * `Crypto.randomUUID()` trả về `undefined` một cách ÊM RU (không ném lỗi). Một
 * `deviceId` là `undefined` sẽ lọt thẳng vào body `enroll`/`biometric/login`
 * dưới dạng thiếu trường, và vào `auth` handshake Socket.IO dưới dạng
 * `deviceId: undefined` — lỗi khó lần vì payload "trông như đúng" lúc log.
 * `deviceId` không phải bí mật nên KHÔNG cần độ ngẫu nhiên cấp mật mã;
 * `Math.random()` là đủ cho một nhãn định danh máy.
 */
function generateFallbackId(): string {
  const random = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  return `dev-${Date.now().toString(36)}-${random}`.slice(0, 40);
}

async function createAndPersist(): Promise<string> {
  let id: string | undefined;
  try {
    id = Crypto.randomUUID();
  } catch {
    id = undefined;
  }
  if (!id || typeof id !== 'string') id = generateFallbackId();

  await writeSecure(DEVICE_ID_STORAGE_KEY, id);
  return id;
}

/**
 * Lấy `deviceId` ổn định của máy — sinh mới đúng MỘT LẦN, các lượt sau đọc lại
 * y nguyên giá trị đã lưu trong kho khoá hệ điều hành.
 *
 * An toàn khi gọi đồng thời nhiều nơi lúc khởi động (chỉ một lượt tạo mới thật
 * sự chạy, nhờ `inflight` single-flight — cùng kiểu chặn đua với `refreshSession()`
 * ở `core/api/session.ts`).
 */
export function getDeviceId(): Promise<string> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;

  inflight = (async () => {
    const existing = await readSecure(DEVICE_ID_STORAGE_KEY);
    const id = existing && existing.length >= 8 ? existing : await createAndPersist();
    cached = id;
    inflight = null;
    return id;
  })();

  return inflight;
}

/** CHỈ dùng trong test: xoá cache trong bộ nhớ để mỗi test bắt đầu từ đầu. */
export function __resetDeviceIdCacheForTests(): void {
  cached = null;
  inflight = null;
}
