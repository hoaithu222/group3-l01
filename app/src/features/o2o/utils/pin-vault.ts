import { deleteSecure, readSecure, writeSecure } from '@/core/storage';

/**
 * Két PIN nhận hàng trong kho khoá của hệ điều hành (`expo-secure-store`). PIN 6 số chỉ được BE trả DUY NHẤT lúc gửi đơn / tạo PIN mới
 * (README p6-05 §2: server chỉ lưu HMAC), nên nếu không cất thì lần mở lại sau đó chỉ còn cách "Tạo PIN mới".
 *
 * ⚠️ Khoá `o2o.pin.<userId>.<orderId>` — `SecureStore` chỉ nhận chữ, số, `.`, `-`, `_` (KHÔNG có `:` như app.md ghi `o2o:pin:…`; khoá có `:`
 * bị từ chối và `writeSecure` nuốt lỗi ⇒ PIN "lưu được" mà không bao giờ đọc lại). Có `userId` trong khoá để máy dùng chung không lộ PIN cho
 * người khác. ⛔ KHÔNG dùng `AsyncStorage`: PIN là thứ ai cầm được là nhận được tài liệu của người khác.
 */
const SAFE_PART = /^[A-Za-z0-9_-]{1,64}$/;
const PIN_PATTERN = /^\d{6}$/;

/**
 * Bản nhớ tạm TRONG PHIÊN chạy — dự phòng khi kho khoá từ chối ghi (Keystore hỏng…): vừa gửi đơn xong mà màn vé hiện "Tạo PIN mới" trong khi
 * PIN vừa nhận còn nằm trong tay app thì vô lý. Mất khi tắt app (đúng — chỉ kho khoá mới được sống lâu hơn phiên).
 */
const session = new Map<string, string>();

export function pinKey(userId: string, orderId: string): string | null {
  if (!SAFE_PART.test(userId) || !SAFE_PART.test(orderId)) return null;
  return `o2o.pin.${userId}.${orderId}`;
}

/** `null` khi chưa có, kho khoá không đọc được, hoặc giá trị hỏng (không phải 6 số). */
export async function readPin(userId: string, orderId: string): Promise<string | null> {
  const key = pinKey(userId, orderId);
  if (!key) return null;
  const value = (await readSecure(key)) ?? session.get(key) ?? null;
  return value !== null && PIN_PATTERN.test(value) ? value : null;
}

/** Trả `false` khi KHO KHOÁ không ghi được (PIN vẫn còn trong phiên) — nơi gọi nên nhắc người dùng tự ghi nhớ PIN. */
export async function savePin(userId: string, orderId: string, pin: string): Promise<boolean> {
  const key = pinKey(userId, orderId);
  if (!key || !PIN_PATTERN.test(pin)) return false;
  session.set(key, pin);
  return writeSecure(key, pin);
}

export async function clearPin(userId: string, orderId: string): Promise<void> {
  const key = pinKey(userId, orderId);
  if (!key) return;
  session.delete(key);
  await deleteSecure(key);
}
