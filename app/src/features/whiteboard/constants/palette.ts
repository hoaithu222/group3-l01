import type { ThemeColorKey } from '@/shared/theme';

/**
 * Bảng màu của bảng trắng: MÀU LƯU TRONG Y.DOC LÀ ID TOKEN (`ink`, `blue`, `yellow`…, be.md §2.1), không phải mã hex — để đổi sáng/tối không
 * vỡ tương phản. Mỗi id ánh xạ tới HAI token màu của app: `stroke` (nét/chữ) và `fill` (nền tô nhạt). Canvas Skia không nhận `className` nên
 * đọc hex qua `useThemeColors()` rồi tra bảng này (`resolveElementColor`).
 *
 * ⚠️ Id lạ (bản app khác/máy khác ghi) rơi về `ink` thay vì vẽ đen/trong suốt — dữ liệu từ máy khác không đáng tin.
 */
export interface PaletteEntry {
  fill: ThemeColorKey;
  id: string;
  label: string;
  stroke: ThemeColorKey;
}

export const WB_PALETTE: readonly PaletteEntry[] = [
  { fill: 'action-grey', id: 'ink', label: 'Đen', stroke: 'fg-1' },
  { fill: 'surface-error', id: 'red', label: 'Đỏ', stroke: 'error' },
  { fill: 'surface-warning', id: 'yellow', label: 'Vàng', stroke: 'action-accent' },
  { fill: 'surface-success', id: 'green', label: 'Xanh lá', stroke: 'success' },
  { fill: 'surface-info', id: 'blue', label: 'Xanh dương', stroke: 'info' },
  { fill: 'surface-primary', id: 'purple', label: 'Tím', stroke: 'action-base' },
];

const FALLBACK = WB_PALETTE[0] as PaletteEntry;
const BY_ID = new Map(WB_PALETTE.map((entry) => [entry.id, entry]));

export const paletteEntry = (id: string): PaletteEntry => BY_ID.get(id) ?? FALLBACK;

/** Mã hex thật của một id token màu ở theme đang hiển thị (`colors` = `useThemeColors()`). */
export function resolveElementColor(
  colors: Readonly<Record<ThemeColorKey, string>>,
  id: string,
  role: 'fill' | 'stroke',
): string {
  const entry = paletteEntry(id);
  return colors[role === 'fill' ? entry.fill : entry.stroke];
}

/** Bề dày nét cho người dùng chọn (khoảng cho phép của engine là 1–12). */
export const STROKE_WIDTHS: readonly number[] = [2, 4, 8];

/** Cỡ chữ cho người dùng chọn (khoảng cho phép của engine là 12–96). */
export const FONT_SIZES: readonly number[] = [16, 20, 28, 40];
