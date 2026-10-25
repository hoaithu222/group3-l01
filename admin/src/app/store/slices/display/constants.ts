import type { DisplayState, UiScale } from './types';

/** Các mức phóng chữ cho phép ở chế độ TV — nguồn cho UI chọn mức. */
export const UI_SCALE_VALUES = [1.1, 1.2, 1.3] as const satisfies readonly UiScale[];

/**
 * Mức mặc định khi BẬT chế độ TV lần đầu.
 *
 * Chọn mức thấp nhất làm mặc định có chủ đích: chữ to thêm là thứ dễ nhận ra
 * ngay, còn chữ tràn khỏi ô thì phải cuộn hết màn mới thấy. Để user tự nâng lên
 * khi thấy cần, an toàn hơn là mặc định cao rồi họ gặp lỗi hiển thị trước.
 */
export const DEFAULT_TV_UI_SCALE: UiScale = 1.1;

/** Hệ số dùng cho test/khung tham chiếu. Giữ tên cũ để không phải sửa nơi gọi. */
export const TV_UI_SCALE = DEFAULT_TV_UI_SCALE;

export const DISPLAY_INITIAL_STATE: DisplayState = {
  mode: 'standard',
  uiScale: DEFAULT_TV_UI_SCALE,
};

/** Khoá localStorage của zustand persist. */
export const DISPLAY_STORAGE_KEY = 'display-storage';

/**
 * Bản của dữ liệu đã lưu. Tăng số này khi đổi hình dạng state để zustand gọi
 * `migrate` — bản 1 từng lưu `uiScale: 1.8` và `overscan`, đều không còn hợp lệ.
 */
export const DISPLAY_STORAGE_VERSION = 2;

/** Tên query param trên URL — xem `api-patterns.md §URL-synced Filters`. */
export const DISPLAY_PARAM = 'display';
export const SCALE_PARAM = 'scale';
