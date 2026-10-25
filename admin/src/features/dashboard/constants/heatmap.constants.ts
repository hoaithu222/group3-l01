/**
 * Hằng số bản đồ nhiệt "Hoạt động theo giờ" (thứ × giờ) — tách khỏi `breakdown.constants.ts` cho đủ giới hạn 250 dòng/file.
 */

export const HEATMAP_DAYS = 7;
export const HEATMAP_HOURS = 24;

/** Chỉ số hàng/cột dựng sẵn — để JSX `map` không phải `Array.from` lại mỗi lần render (mỗi lần rê chuột là một lần render). */
export const HEATMAP_DAY_INDEXES: readonly number[] = Array.from({ length: HEATMAP_DAYS }, (_, i) => i);
export const HEATMAP_HOUR_INDEXES: readonly number[] = Array.from(
  { length: HEATMAP_HOURS },
  (_, i) => i,
);

/** `cells[0]` = Thứ Hai … `cells[6]` = Chủ nhật (hợp đồng `InsightsHeatmap`). */
export const WEEKDAY_SHORT: readonly string[] = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
export const WEEKDAY_FULL: readonly string[] = [
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
  'Chủ nhật',
];

/** Cứ mỗi bấy nhiêu giờ ghi một nhãn trục giờ (0 · 3 · 6 … 21) — ghi đủ 24 nhãn thì chồng nhau trên panel hẹp. */
export const HEATMAP_HOUR_LABEL_STEP = 3;

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

/**
 * Thang 5 mức MỘT hue (`secondary-5`): mức 0 = nền trung tính (không có hoạt động), 1–4 đậm dần. ⛔ LITERAL vì Tailwind quét văn bản thuần.
 * Cố ý một hue lạnh, KHÔNG dùng tông nóng (cam/đỏ): heatmap này đo MỨC ĐỘ hoạt động chứ không phải tốt/xấu — đỏ sẽ đọc thành cảnh báo.
 */
export const HEAT_LEVEL_CLASS: Readonly<Record<HeatLevel, string>> = {
  0: 'bg-divider-1',
  1: 'bg-secondary-5/20',
  2: 'bg-secondary-5/40',
  3: 'bg-secondary-5/65',
  4: 'bg-secondary-5',
};

/** Các mức hiện ở chú giải "Ít → Nhiều" — cùng bảng class với ô thật nên chú giải không bao giờ lệch màu với lưới. */
export const HEAT_LEGEND_LEVELS: readonly HeatLevel[] = [0, 1, 2, 3, 4];
