/**
 * Cỡ chữ cụm nhãn ở TÂM donut/gauge — chọn BẬC TOKEN lớn nhất còn LỌT LỖ.
 *
 * Vì sao cần: lỗ donut là hình học px (không đổi ở TV), còn token typography là
 * `rem × --ui-scale` (to thêm 10-30% ở TV). Ghim cứng một token — kiểu
 * `text-h2-bold` cho mọi cỡ donut — hỏng theo cả hai chiều:
 *   · donut nhỏ (laptop 14"): chữ TO HƠN lỗ → số vẽ đè lên vành màu;
 *   · donut to (TV/4K): chữ đứng yên giữa lỗ rộng gấp mấy lần → trống huơ.
 *
 * Cách làm: dò bảng bậc từ TO xuống NHỎ, lấy bậc đầu tiên mà bề rộng chuỗi số
 * (đã nhân `uiScale`) và chiều cao cả cụm còn nằm trong lỗ. Trả về TOKEN chứ
 * không phải px — token vẫn tự phóng ở TV (`font-system.md`), đặt px cứng là mất
 * luôn phần đó (xem `chart-conventions.md §1.5`).
 *
 * Anh em với `arcLabelFontSize()` (nhãn % NẰM TRÊN cung): cùng nguyên tắc "cỡ chữ
 * suy ra từ hình học đo được", khác chỗ đặt chữ nên khác đơn vị trả về.
 */

/** Cặp token cho cụm nhãn ở tâm. */
export interface CenterLabelFont {
  /** Token cho con số chính (đã kèm weight). */
  value: string;
  /** Token cho dòng phụ bên dưới (tỉ lệ, đơn vị…). */
  caption: string;
  /** Cỡ px của bậc — TRƯỚC `--ui-scale`. Dùng khi cần tính chỗ thêm. */
  valuePx: number;
  /** Cỡ px dòng phụ — TRƯỚC `--ui-scale`. */
  captionPx: number;
}

export interface CenterLabelFitOptions {
  /** Hệ số TV đang có hiệu lực (`useChartMetrics().uiScale`). Mặc định 1. */
  uiScale?: number;
  /**
   * Số ký tự cần CHỪA CHỖ cho con số ở tâm. Mặc định 4 (`'100%'`).
   *
   * ⛔ TRUYỀN BỀ RỘNG LỚN NHẤT CÓ THỂ CỦA CHUỖI ĐÓ, KHÔNG PHẢI `label.length`
   *    của lần render này. Nhãn `%` dài 2–4 ký tự tuỳ giá trị, nên đo theo
   *    chuỗi thật thì cùng một hàng thẻ giống hệt nhau lại ra ba cỡ chữ khác
   *    nhau: ở lỗ ~60px, `'100%'` (4 ký tự) rơi bậc 20px còn `'0%'` (2 ký tự)
   *    được tận 32px — thẻ 0% đọc ra như bị phóng to, và cụm chữ cao thêm nên
   *    đè cả lên vành màu. Dùng `PERCENT_LABEL_CHARS` cho mọi nhãn phần trăm.
   */
  valueChars?: number;
  /** Số dòng phụ dưới con số (0-2). Mặc định 0. */
  captionLines?: number;
}

/**
 * Bề rộng cần chừa cho nhãn phần trăm ở tâm — LUÔN đo theo `'100%'`.
 *
 * Đây là hằng số dùng chung để mọi donut/gauge phần trăm trong cùng một hàng
 * cho ra CÙNG một bậc chữ, bất kể giá trị là `0%`, `5%` hay `100%`.
 */
export const PERCENT_LABEL_CHARS = 4;

/**
 * Bảng bậc, TO → NHỎ. Bậc sàn `body-14` là ngưỡng còn đọc được trên nền tối;
 * dưới mức đó thà để chữ chạm mép còn hơn thu nhỏ tới mức vô nghĩa.
 */
const CENTER_LABEL_STEPS: readonly CenterLabelFont[] = [
  { value: 'text-h1-bold', valuePx: 40, caption: 'text-body-16', captionPx: 16 },
  { value: 'text-h2-bold', valuePx: 32, caption: 'text-body-14', captionPx: 14 },
  { value: 'text-h3-bold', valuePx: 24, caption: 'text-caption-12', captionPx: 12 },
  { value: 'text-h4-bold', valuePx: 20, caption: 'text-caption-12', captionPx: 12 },
  { value: 'text-body-18-bold', valuePx: 18, caption: 'text-caption-10', captionPx: 10 },
  { value: 'text-body-16-bold', valuePx: 16, caption: 'text-caption-10', captionPx: 10 },
  { value: 'text-body-14-bold', valuePx: 14, caption: 'text-caption-10', captionPx: 10 },
];

/**
 * Bề rộng 1 CHỮ SỐ tính theo em.
 *
 * Số hiển thị bằng font sans của app kèm `tabular-nums` — mọi chữ số rộng bằng
 * nhau nên vẫn ước lượng được bề rộng cụm số bằng một hằng số. Giữ 0.6 (mức của
 * JetBrains Mono cũ) vì đây là ước lượng THEO HƯỚNG AN TOÀN: chữ số sans hẹp hơn
 * một chút, đoán rộng hơn thực tế chỉ khiến chọn bậc chữ nhỏ hơn — thà chữ nhỏ
 * hơn một bậc còn hơn tràn ra khỏi lỗ donut.
 */
const MONO_ADVANCE_EM = 0.6;
/** Khoảng cách dọc giữa dòng số và mỗi dòng phụ (px, `mt-1`/`mt-0.5`). */
const LINE_GAP = 4;
/**
 * Phần dây cung dùng được ở giữa lỗ tròn. Lỗ là HÌNH TRÒN nên bề rộng khả dụng
 * hẹp dần khi rời tâm — 0.82 là mức an toàn cho dòng số nằm quanh trục ngang.
 */
const WIDTH_SAFE = 0.82;
/** Phần chiều cao lỗ dành cho cả cụm chữ (chừa hở trên/dưới). */
const HEIGHT_SAFE = 0.9;

/**
 * Bậc token lớn nhất còn lọt lỗ donut.
 *
 * @param holeDiameter Đường kính LỖ GIỮA (= 2 × innerRadius), px đo được.
 */
export function centerLabelFont(
  holeDiameter: number,
  options: CenterLabelFitOptions = {},
): CenterLabelFont {
  const { uiScale = 1, valueChars = 4, captionLines = 0 } = options;
  const floor = CENTER_LABEL_STEPS[CENTER_LABEL_STEPS.length - 1];
  if (!(holeDiameter > 0)) return floor;

  const widthBudget = holeDiameter * WIDTH_SAFE;
  const heightBudget = holeDiameter * HEIGHT_SAFE;

  const fitted = CENTER_LABEL_STEPS.find((step) => {
    const valueWidth = step.valuePx * uiScale * MONO_ADVANCE_EM * valueChars;
    const stackHeight =
      step.valuePx * uiScale + captionLines * (step.captionPx * uiScale + LINE_GAP);
    return valueWidth <= widthBudget && stackHeight <= heightBudget;
  });

  return fitted ?? floor;
}

/**
 * Bề rộng tối đa cho phép của một dòng phụ ở tâm (px) — dùng làm `maxWidth` để
 * `truncate` cắt ĐÚNG chỗ. `max-w-full` theo khung ngoài donut là sai: khung
 * rộng gấp 2-3 lần lỗ nên `truncate` gần như không bao giờ kích hoạt và chữ vẽ
 * thẳng qua vành màu.
 *
 * @param offsetFromCenter Khoảng cách từ tâm tới dòng chữ (px). Càng xa tâm, dây
 *   cung càng ngắn.
 */
export function centerLabelMaxWidth(holeDiameter: number, offsetFromCenter = 0): number {
  const radius = holeDiameter / 2;
  if (!(radius > 0)) return 0;
  const half = Math.max(0, radius ** 2 - offsetFromCenter ** 2);
  return Math.round(2 * Math.sqrt(half) * WIDTH_SAFE);
}

/**
 * Bề rộng trung bình 1 ký tự của dòng phụ, theo em.
 *
 * ⛔ ĐO THEO CHỮ HOA, không phải chữ thường. Cả hai chỗ dùng hàm này đều render
 *    `uppercase tracking-wide` ("17 ĐỐI TƯỢNG", "TRỤ/MỐ"), mà chữ HOA rộng hơn
 *    chữ thường ~0.06em và `tracking-wide` cộng thêm 0.025em mỗi ký tự. Hằng số
 *    cũ (0.58 — mức của chữ thường) ước lượng THIẾU ~15%, nên dòng phụ được cho
 *    là "vừa" rồi mới bị `truncate` cắt thành `TRỤ…` / `17 Đ…` — đúng thứ mà
 *    `centerCaptionFits` sinh ra để ngăn.
 *
 * Chọn 0.70 (chữ HOA ~0.65-0.72em + `tracking-wide` 0.025em) chứ không phải mức
 * trung bình 0.64: sai số ở đây KHÔNG đối xứng. Ước lượng THỪA thì cùng lắm bỏ
 * một dòng phụ vốn đã có ở badge header và hàng chú giải; ước lượng THIẾU thì
 * chữ vẽ đè lên vành màu — hỏng hẳn hình. Ở dải nhạy nhất (lỗ ~85-95px, TV từ
 * ×1.2) chính 0.06em chênh này quyết định "đè lên vành" hay "ẩn gọn".
 */
const TEXT_ADVANCE_EM = 0.7;

/**
 * Dòng phụ ở tâm có đáng hiện không.
 *
 * Khi lỗ quá hẹp, `truncate` sẽ cắt còn `"11 đ…"` — vừa vô nghĩa vừa vẫn chiếm
 * chỗ. Thà BỎ HẲN dòng đó và nhường lỗ cho con số chính: thông tin ấy luôn có
 * sẵn ở badge trên header thẻ và ở hàng chú giải bên cạnh.
 */
export function centerCaptionFits(
  maxWidth: number,
  captionPx: number,
  chars: number,
  uiScale = 1,
): boolean {
  if (chars <= 0) return false;
  return captionPx * uiScale * TEXT_ADVANCE_EM * chars <= maxWidth;
}
