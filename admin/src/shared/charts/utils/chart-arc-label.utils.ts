/**
 * chart-arc-label.utils — nhãn `%` vẽ NGAY TRÊN cung donut.
 *
 * Gom về một chỗ vì 4 donut (nghiệm thu × 2, sản lượng × 2) đều tự tính lại toạ
 * độ + cỡ chữ, mỗi nơi một hằng số → cùng một dashboard mà chữ mỗi vòng một cỡ.
 *
 * ── Ba quyết định, mỗi cái sửa một lỗi đọc được ──────────────────────────────
 *
 * 1. **Chữ TRẮNG phẳng (`neutral-0`), KHÔNG tô theo màu lát.** Nhãn nằm ĐÈ LÊN
 *    chính cung đó → cùng màu là tàng hình. Trắng KHÔNG phụ thuộc theme vì
 *    tương phản ở đây là với MÀU CUNG, không phải với nền trang
 *    (`chart-conventions.md §1.7` chỉ cấm tô chữ bằng màu series trên nền panel).
 *
 * 2. **Cỡ chữ co theo BỀ DÀY VÀNH, không phải hằng số.** Hằng số `fontSize={10}`
 *    làm nhãn dính cứng ở mức khó đọc dù vòng có to lên. Sàn 11px theo
 *    `chart-conventions.md §1.5`; trần 18px để chữ không chạm mép vành.
 *
 * 3. **Bóng đổ MỀM thay cho viền stroke.** Lát sáng (`accent-5` #FFB700,
 *    `lime-5` #A3E635) làm chữ trắng chìm hẳn. Cách cũ trong repo là
 *    `paintOrder="stroke"` + viền tối — nhưng viền cứng vẽ ra một đường kẻ đen
 *    quanh từng chữ số, nhìn như border và làm chữ NHOÈ thêm (đã bị gỡ khỏi
 *    `site-resources/DonutChart`). `drop-shadow` bám theo alpha của glyph nên
 *    tách chữ khỏi nền mà không sinh viền.
 */

/** Toạ độ tâm nhãn — giữa bề dày vành, tại góc giữa cung. */
export interface ArcLabelPoint {
  x: number;
  y: number;
}

/**
 * Đổi `midAngle` của Recharts sang toạ độ vẽ SVG.
 *
 * ⚠️ Recharts đo góc NGƯỢC chiều trục y của SVG (y hướng xuống) → phải đảo dấu,
 * quên là nhãn lật đối xứng qua trục ngang và rơi sang lát khác.
 */
export function arcLabelPoint(
  cx: number,
  cy: number,
  midAngle: number,
  innerRadius: number,
  outerRadius: number,
): ArcLabelPoint {
  const rad = -midAngle * (Math.PI / 180);
  const r = (innerRadius + outerRadius) / 2;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** Sàn / trần cỡ chữ nhãn cung ở chế độ thường. */
const ARC_LABEL_MIN = 11;
export const ARC_LABEL_MAX = 18;

/** Hệ số mặc định: chữ chiếm ~nửa bề dày, còn lại là lề trên/dưới trong cung. */
const ARC_LABEL_RATIO_DEFAULT = 0.46;

/**
 * Cỡ chữ nhãn theo bề dày vành (px).
 * Hệ số mặc định 0.46: chữ chiếm ~nửa bề dày, còn lại là lề trên/dưới trong cung.
 *
 * @param uiScale Hệ số TV. Nhân vào CẢ SÀN LẪN TRẦN chứ không đổi công thức —
 *   giữ nguyên 100% hành vi ở `uiScale = 1`.
 *
 *   Phải dời TRẦN chứ không chỉ dời sàn: nhiều donut đã **chạm trần 18** ở cỡ
 *   bình thường, giữ nguyên trần thì nhãn % là thứ DUY NHẤT không to lên khi bật
 *   TV, trông như bị bỏ quên.
 *
 *   An toàn dù vành KHÔNG to ra ở TV: `arcLabelFits()` vẫn bỏ nhãn khi vành mỏng
 *   hơn `fontSize + 2`, nên chữ không thể tràn ra ngoài cung.
 *
 * @param max Trần riêng (px, TRƯỚC khi nhân `uiScale`). Mặc định `ARC_LABEL_MAX`
 *   — giữ nguyên hành vi mọi caller cũ. Donut CỠ LỚN (vành ≥ 50px, vd panel nhân
 *   sự / phân bổ nhà thầu ở `site-resources`) chạm trần 18 từ rất sớm nên nhãn %
 *   nhỏ hẳn so với vành; những chỗ đó truyền trần cao hơn. `arcLabelFits()` vẫn
 *   là chốt chặn cuối, nên nới trần KHÔNG thể làm chữ tràn khỏi cung.
 *
 * @param ratio Tỷ lệ chữ / bề dày vành. Mặc định 0.46 (giữ hành vi cũ). Giảm
 *   xuống (vd 0.34) khi caller muốn NHIỀU lề trên/dưới hơn — chữ trông nhỏ và
 *   không chạm sát mép cung. Chỉ ảnh hưởng bước "co theo bề dày", sàn / trần vẫn
 *   được clamp như trước.
 */
export function arcLabelFontSize(
  innerRadius: number,
  outerRadius: number,
  uiScale = 1,
  max = ARC_LABEL_MAX,
  ratio = ARC_LABEL_RATIO_DEFAULT,
): number {
  const thickness = Math.max(0, outerRadius - innerRadius);
  return Math.max(ARC_LABEL_MIN * uiScale, Math.min(max * uiScale, Math.round(thickness * ratio)));
}

/**
 * Vành mỏng hơn `fontSize + 2` thì KHÔNG còn chỗ đặt chữ trong cung — thà bỏ
 * nhãn còn hơn để chữ tràn ra ngoài vành.
 */
export function arcLabelFits(innerRadius: number, outerRadius: number, fontSize: number): boolean {
  return outerRadius - innerRadius >= fontSize + 2;
}

/** Màu chữ nhãn — xem §1 ở đầu file. */
export const ARC_LABEL_FILL = 'var(--color-neutral-0)';

/**
 * Style dùng chung cho `<text>` nhãn cung.
 * `paintOrder`/`stroke` CỐ Ý không có — xem §3 ở đầu file.
 */
export const ARC_LABEL_STYLE = {
  fontWeight: 700,
  letterSpacing: '-0.01em',
  paintOrder: 'normal',
  filter: 'drop-shadow(0 1px 1.5px color-mix(in srgb, var(--color-neutral-10) 70%, transparent))',
} as const;
