import { UI_SCALE_VALUES } from './constants';
import type { DisplayMode, UiScale } from './types';

/**
 * Chuẩn hoá giá trị đọc từ URL về union hợp lệ.
 *
 * Trả `null` khi không nhận diện được — caller phân biệt được "không có param"
 * với "param rác", nên param rác không ghi đè giá trị đã lưu.
 */
export const parseDisplayMode = (raw: string | null | undefined): DisplayMode | null => {
  if (raw === 'tv' || raw === 'standard') return raw;
  return null;
};

/** `"1.2"` → `1.2`. Giá trị ngoài danh sách cho phép → `null`. */
export const parseUiScale = (raw: string | null | undefined): UiScale | null => {
  if (!raw) return null;
  const parsed = Number(raw);
  return UI_SCALE_VALUES.find((value) => value === parsed) ?? null;
};
