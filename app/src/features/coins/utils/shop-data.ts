/**
 * Đọc `ShopItem.data` (token hiển thị theo loại vật phẩm) một cách PHÒNG THỦ. BE kiểm `.strict()` lúc admin nhập (`shop-item-data.ts`: màu `#RRGGBB`,
 * độ dày 1–8, danh sách emoji có trần) nhưng `data` là JSON tự do trong DB và đi tới MỌI thiết bị — hỏng/thiếu thì bỏ phần hỏng chứ không làm sập màn
 * cửa hàng. ⚠️ Màu ở đây là DỮ LIỆU do admin chọn (vật phẩm là hình minh hoạ của chính vật phẩm), không phải màu giao diện — nên không đi qua token.
 */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const hexOf = (value: unknown): string | null =>
  typeof value === 'string' && HEX_COLOR.test(value) ? value : null;

export interface FrameToken {
  color: string;
  /** Độ dày viền (dp), 1–8. */
  width: number;
}

/** `AVATAR_FRAME`: `{ color, width }`. Thiếu màu ⇒ `null` (không vẽ khung); độ dày lệch ⇒ kẹp về 1–8, mặc định 3 (như BE). */
export function frameOf(data: Record<string, unknown> | null): FrameToken | null {
  if (!isRecord(data)) return null;
  const color = hexOf(data.color);
  if (!color) return null;
  const width = typeof data.width === 'number' && Number.isFinite(data.width) ? data.width : 3;
  return { color, width: Math.min(8, Math.max(1, Math.round(width))) };
}

export interface ThemeToken {
  primary: string;
  accent: string;
}

/** `PROFILE_THEME`: `{ primary, accent }` — cả hai màu hợp lệ mới vẽ. */
export function themeOf(data: Record<string, unknown> | null): ThemeToken | null {
  if (!isRecord(data)) return null;
  const primary = hexOf(data.primary);
  const accent = hexOf(data.accent);
  return primary && accent ? { accent, primary } : null;
}

/** `EMOJI_PACK`: `{ emojis: string[] }` — bỏ phần tử không phải chuỗi; tối đa `limit` cái đầu để dòng xem trước không tràn. */
export function emojisOf(data: Record<string, unknown> | null, limit = 8): string[] {
  if (!isRecord(data) || !Array.isArray(data.emojis)) return [];
  return data.emojis
    .filter((emoji): emoji is string => typeof emoji === 'string' && emoji.length > 0)
    .slice(0, limit);
}
