import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage } from 'zustand/middleware';
import type { PersistStorage } from 'zustand/middleware';

import { logger } from '@/shared/utils/logger';

/**
 * Kho lưu trữ THƯỜNG — thay cho `localStorage` của web.
 *
 * ⛔ KHÔNG mã hoá. Trên Android đây là một file SQLite trần trong thư mục app,
 * đọc được trên máy đã root hoặc qua bản sao lưu ADB. Chỉ để thứ mà lộ ra cũng
 * không sao: hồ sơ hiển thị, tuỳ chọn giao diện, bộ lọc gần nhất.
 * Token và mọi thứ nhạy cảm → `secure-storage.ts`.
 *
 * ── Khác biệt lớn nhất so với web: BẤT ĐỒNG BỘ ───────────────────────────────
 * `localStorage.getItem()` trả kết quả ngay. `AsyncStorage.getItem()` trả một
 * Promise. Hệ quả với `zustand/persist`: ở khung hình ĐẦU TIÊN store còn RỖNG,
 * dữ liệu đã lưu chỉ về sau một nhịp.
 *
 * ⛔ Vì vậy KHÔNG được quyết định điều hướng dựa trên store trước khi nạp xong.
 * Làm thế thì mỗi lần mở app, người đã đăng nhập nhìn thấy màn đăng nhập chớp
 * một cái rồi mới vào — trông như lỗi đăng xuất ngẫu nhiên. Cách chặn: giữ màn
 * hình chờ tới khi `hasHydrated` bật, xem `src/shell/store/slices/auth/auth.store.ts` và
 * `app/_layout.tsx`.
 */

/** Kho lưu trữ cho `zustand/persist`. */
export function createPersistStorage<T>(): PersistStorage<T> | undefined {
  return createJSONStorage<T>(() => AsyncStorage);
}

/** Đọc một giá trị JSON. `null` khi chưa có hoặc dữ liệu hỏng. */
export async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch (error) {
    // Bao gồm cả ca JSON hỏng do lần ghi trước bị cắt giữa chừng (app bị hệ
    // điều hành giết lúc đang ghi). Coi như chưa có — đọc tiếp một chuỗi hỏng
    // chỉ làm lỗi lan sang chỗ khác.
    if (__DEV__) logger.warn(`[app-storage] không đọc được "${key}":`, error);
    return null;
  }
}

/** Ghi một giá trị JSON. Trả `false` khi ghi hỏng (hết dung lượng máy). */
export async function writeJson(key: string, value: unknown): Promise<boolean> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    if (__DEV__) logger.warn(`[app-storage] không ghi được "${key}":`, error);
    return false;
  }
}

/** Xoá một khoá. */
export async function removeKey(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch (error) {
    if (__DEV__) logger.warn(`[app-storage] không xoá được "${key}":`, error);
  }
}
