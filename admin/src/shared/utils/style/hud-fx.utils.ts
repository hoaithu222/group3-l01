/**
 * hud-fx — công thức màu/bóng dùng chung cho THẺ HUD vát góc (BigDataView).
 *
 * Trích ra từ `progress-management/constants/plan-card-fx.ts` (PlanCard) để mọi
 * feature dùng chung MỘT công thức: thẻ ở org-hub và ở tiến độ phải nét/chói
 * như nhau, chỉnh một chỗ là đổi hết.
 *
 * ⛔ Ba cái bẫy đã trả giá để biết — đừng lặp lại:
 *  1. `clip-path` XÉN `box-shadow`. Bóng đổ phải là `filter: drop-shadow` đặt ở
 *     lớp BỌC NGOÀI element có clip-path (xem `hudCardShadow`).
 *  2. Viền cũng không dùng `inset box-shadow`/`ring`/`outline` — cả ba chạy theo
 *     hình chữ nhật nên hai cạnh vát chéo sẽ mất viền. Dùng lớp nền-làm-viền +
 *     `p-px` (xem `hudBorder`).
 *  3. Chữ ăn màu tone KHÔNG dùng tone nguyên chất — bảng tone giống nhau ở cả
 *     hai theme nên trên nền sáng chỉ đạt ~1.7:1. Dùng `hudInk`.
 */

/** Góc vát chuẩn của thẻ HUD — dùng CHUNG cho lớp viền và lớp thân. */
export const HUD_NOTCH_10 =
  'polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)';

/** Pha tone với `transparent` — dùng cho nền / quầng sáng. */
export function hudMix(toneVar: string, percent: number): string {
  return `color-mix(in srgb, ${toneVar} ${percent}%, transparent)`;
}

/**
 * Pha tone với `border-2` (màu ĐẶC) — dùng cho đường viền. Cố tình không pha
 * với `transparent`: viền trong suốt trên nền tối luôn bị đọc thành "mờ".
 */
export function hudBorder(toneVar: string, percent: number): string {
  return `color-mix(in srgb, ${toneVar} ${percent}%, var(--color-border-2))`;
}

/**
 * Pha tone với `fg-1` — dùng cho CHỮ ăn màu tone. Theme tối → tone sáng rực;
 * theme sáng → tone đậm lại vừa đủ ngưỡng tương phản, vẫn giữ đúng hue.
 */
export function hudInk(toneVar: string, percent: number): string {
  return `color-mix(in srgb, ${toneVar} ${percent}%, var(--color-fg-1))`;
}

/** Pha tone với một biến nền bất kỳ — vd thân thẻ pha vào `--color-bg-2`. */
export function hudSurface(toneVar: string, percent: number, baseVar: string): string {
  return `color-mix(in srgb, ${toneVar} ${percent}%, ${baseVar})`;
}

const LIFT = 'drop-shadow(0 1px 2px var(--color-popup-shadow))';

/**
 * Bóng nghỉ của thẻ. 4 hàm `drop-shadow` chứ không phải 2 — hai hàm cuối cố ý
 * vô hình: `filter` chỉ nội suy được khi hai đầu transition có CÙNG danh sách
 * hàm theo cùng thứ tự, thiếu hàm là trình duyệt nhảy phắt sang trạng thái hover.
 */
export const HUD_CARD_SHADOW = `${LIFT} drop-shadow(0 6px 14px var(--color-popup-shadow)) drop-shadow(0 0 0 transparent) drop-shadow(0 0 0 transparent)`;

/** Bóng khi hover: nâng cao hơn + quầng tone để thẻ "bật" khỏi lưới. */
export function hudCardShadowHover(toneVar: string, glowPercent = 34): string {
  return `${LIFT} drop-shadow(0 8px 16px var(--color-popup-shadow)) drop-shadow(0 14px 28px var(--color-popup-shadow)) drop-shadow(0 0 12px ${hudMix(toneVar, glowPercent)})`;
}
