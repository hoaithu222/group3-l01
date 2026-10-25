import * as SecureStore from 'expo-secure-store';

import { logger } from '@/shared/utils/logger';

/**
 * Kho khoá của hệ điều hành — Keychain (iOS) / Keystore (Android).
 *
 * ⛔ CHỈ dùng cho thứ mà lộ ra là mất phiên hoặc mất tài khoản: refresh token,
 * mã PIN, khoá thiết bị. Dữ liệu thường (hồ sơ, tuỳ chọn giao diện) để ở
 * `app-storage.ts` — kho này chậm hơn nhiều vì mỗi lượt đọc/ghi phải đi qua
 * lớp mã hoá của hệ điều hành.
 *
 * ── Vì sao mọi hàm đều nuốt lỗi ──────────────────────────────────────────────
 * `SecureStore` ném lỗi trong những ca có thật và ngoài tầm kiểm soát của app:
 *
 *   · Android — Keystore hỏng sau khi người dùng đổi/gỡ khoá màn hình, hoặc sau
 *     khi khôi phục máy từ bản sao lưu (khoá cũ ràng vào máy cũ, không giải mã
 *     được ở máy mới).
 *   · iOS — đọc Keychain trước khi máy được mở khoá lần đầu sau khi khởi động.
 *   · Cả hai — bản build thiếu module native (chạy trong Expo Go bản cũ).
 *
 * Để lỗi bay lên là app CRASH ngay lúc khởi động, ở đúng những người dùng đó, và
 * họ không có cách nào tự thoát ra. Nuốt lỗi ở đây biến ca đó thành "coi như
 * chưa đăng nhập" — người dùng đăng nhập lại một lần là xong.
 *
 * Đổi lại, `read` không phân biệt được "chưa có" với "có mà đọc hỏng". Đó là
 * đánh đổi CÓ CHỦ Ý: cả hai đều dẫn tới cùng một hành động là bắt đăng nhập lại.
 */

/** Đọc một giá trị. `null` khi chưa có, hoặc khi kho khoá không đọc được. */
export async function readSecure(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    if (__DEV__) logger.warn(`[secure-storage] không đọc được "${key}":`, error);
    return null;
  }
}

/** Ghi một giá trị. Trả `false` khi kho khoá từ chối. */
export async function writeSecure(key: string, value: string): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(key, value, {
      /**
       * Chỉ đọc được SAU KHI máy đã mở khoá lần đầu kể từ lúc bật máy, và
       * KHÔNG theo bản sao lưu sang máy khác (`ThisDeviceOnly`).
       *
       * Vì sao không dùng mức chặt hơn (`WHEN_UNLOCKED`): app cần làm mới token
       * trong nền — đồng bộ nền, xử lý thông báo đẩy — những lúc màn hình đang
       * khoá. Ở mức chặt hơn thì các lượt đó đọc không ra token và phiên chết
       * oan trong lúc người dùng không hề đụng vào máy.
       */
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
    return true;
  } catch (error) {
    if (__DEV__) logger.warn(`[secure-storage] không ghi được "${key}":`, error);
    return false;
  }
}

/** Xoá một giá trị. Không ném lỗi kể cả khi khoá chưa từng tồn tại. */
export async function deleteSecure(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (error) {
    if (__DEV__) logger.warn(`[secure-storage] không xoá được "${key}":`, error);
  }
}
