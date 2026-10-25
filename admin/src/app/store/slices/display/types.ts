/**
 * Display mode — chế độ hiển thị của toàn app.
 *
 * `standard` : desktop/laptop bình thường (mặc định).
 * `tv`       : màn hình lớn nhìn từ xa (~3m) — CHỮ phóng theo `--ui-scale`,
 *              khung giữ nguyên. Header và Dock VẪN hiển thị: người dùng cần
 *              lối vào cài đặt để tắt chế độ này.
 *
 * Xem `docs/rules/tv-display-mode.md`.
 */
export type DisplayMode = 'standard' | 'tv';

/**
 * Hệ số phóng to CỠ CHỮ ở chế độ TV.
 *
 * ⛔ CHỈ tác động tới typography — nhân vào token chữ trong `generated-font.css`.
 * KHÔNG đụng root font-size, nên padding / chiều cao / bề rộng / bảng / header
 * giữ nguyên y hệt chế độ thường. Bố cục không thể vỡ vì bố cục không bị đụng.
 *
 * ⚠️ Trần là **1.3**, không mở rộng thêm. Vì khung KHÔNG giãn theo, mỗi bậc chữ
 * to lên là một bậc rủi ro chữ tràn khỏi nút / chip / ô bảng có bề rộng cố định.
 * 1.3 là mức cuối còn an toàn trên các màn dashboard hiện có. Bản đầu từng để
 * tới 2.2 (kèm phóng to cả bố cục) và làm vỡ giao diện.
 */
export type UiScale = 1 | 1.1 | 1.2 | 1.3;

export interface DisplayState {
  mode: DisplayMode;
  uiScale: UiScale;
}

export interface DisplayActions {
  setMode: (mode: DisplayMode) => void;
  setUiScale: (uiScale: UiScale) => void;
  toggleMode: () => void;
  resetDisplay: () => void;
}

export type DisplayStoreType = DisplayState & DisplayActions;
