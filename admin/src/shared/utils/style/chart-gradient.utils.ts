/**
 * chart-gradient.utils — công thức gradient cho MẢNG LỚN trong chart
 * (cung donut, thân bar, area fill). Chuẩn hoá theo `chart-conventions.md §1.3`.
 *
 * Vì sao cung donut KHÔNG tô màu phẳng token `-5`:
 * trên nền navy (`bg-chart` / `bg-1`), token `-5` có lightness OKLCH ~0.72–0.85
 * (`teal-5` 0.785 · `secondary-5` 0.717 · `accent-5` 0.825) — vượt xa dải an
 * toàn 0.48–0.67 của dark mode. Mảng lớn ở độ sáng đó gây **bloom/halation**:
 * nhoè cạnh, chói, mỏi mắt. Gradient `-6 → -5` giữ nguyên danh tính màu nhưng
 * kéo phần lõi tối xuống → cung đọc "có khối", cạnh sắc.
 *
 * ⛔ Gradient CHỈ đổi BẬC, KHÔNG đổi HUE. Gradient đa hue (vd xanh → cyan) phá
 * vỡ danh tính series: ô màu legend không còn khớp cung trên biểu đồ.
 *
 * KHÔNG vi phạm `chart-conventions.md §1.2` (chỉ dùng scale `-5`): config vẫn
 * khai `-5`, `-6` chỉ là biến thể RENDER sinh ra từ chính token đó.
 */

/** Vị trí + bậc token của từng điểm dừng gradient cung. */
const ARC_GRADIENT_STOPS = [
  { offset: '62%', step: 6 },
  { offset: '100%', step: 5 },
] as const;

/** Bỏ hậu tố bậc để lấy họ màu: `'info-5'` → `'info'`. Token không có bậc giữ nguyên. */
export function colorFamily(token: string): string {
  return token.replace(/-\d+$/, '');
}

export interface ArcGradientStop {
  /** Vị trí điểm dừng, truyền thẳng vào `<stop offset>`. */
  offset: string;
  /** Giá trị màu CSS, truyền thẳng vào `<stop stopColor>`. */
  color: string;
}

/**
 * Tỉ lệ trộn tối cho điểm dừng trong cùng khi màu là HEX tự do.
 * 82% màu gốc + 18% `neutral-10` ≈ đúng khoảng cách 1 bậc `-5` → `-6` của
 * palette generated, nên donut hex và donut token nhìn cùng một "độ khối".
 */
const HEX_INNER_MIX = 82;

/** Màu do người dùng cấu hình (`Department.color`) lưu dạng hex 6 ký tự. */
function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{3,8}$/.test(value.trim());
}

/**
 * Nhiều chart lưu màu ở dạng CSS var dựng sẵn (`'var(--color-teal-5)'`) thay vì
 * token trần. Bóc lấy token bên trong để vẫn hạ bậc được; không khớp → `null`.
 */
function tokenFromCssVar(value: string): string | null {
  return value.trim().match(/^var\(\s*--color-([a-zA-Z0-9-]+)\s*\)$/)?.[1] ?? null;
}

/**
 * Họ màu CHROME — nền/viền/chữ, KHÔNG phải series dữ liệu.
 *
 * Bắt buộc loại trừ dù chúng vẫn có bậc: `chart-conventions.md §1.2` xếp
 * `bg-*` / `fg-*` / `border-*` vào chrome, và với hai thang `bg`/`fg` bậc CAO
 * hơn lại SÁNG hơn (`bg-4` sáng hơn `bg-3`) — hạ bậc sẽ cho lõi sáng hơn mép,
 * ngược hẳn ý đồ chống bloom. Track ring / lát "trống" phải tô PHẲNG.
 */
const CHROME_FAMILIES = new Set([
  'bg',
  'fg',
  'border',
  'divider',
  'neutral',
  'disabled',
  'cell',
  'header',
  'footer',
  'button',
]);

/**
 * Màu có hạ bậc được không? Cần đồng thời: có bậc `-1..-10` VÀ thuộc họ series
 * (không phải chrome). Sai một trong hai → tô phẳng.
 */
function canStepDown(token: string): boolean {
  return /-\d+$/.test(token) && !CHROME_FAMILIES.has(colorFamily(token));
}

/**
 * Cặp điểm dừng cho gradient của MẢNG LỚN (thân bar, area fill, vành tiến độ
 * dày chiếm gần trọn vòng).
 *
 * ⛔ KHÔNG DÙNG CHO VÀNH DONUT NHIỀU LÁT — đây là cái bẫy đã cắn 2 lần.
 *
 * `<radialGradient>` mặc định chạy ở `gradientUnits="objectBoundingBox"`, và
 * bounding box đó là của **PHẦN TỬ THAM CHIẾU gradient** — tức từng `<path>`
 * sector, KHÔNG phải cả vòng donut. Hệ quả:
 *
 *   - Mỗi lát có tâm gradient riêng, đặt ở tâm bbox của CHÍNH NÓ (lệch hẳn khỏi
 *     tâm donut), lại còn bị kéo giãn phi tỉ lệ theo tỉ lệ bbox → hình tròn
 *     thành hình elip.
 *   - Lát rộng (> 90°) bắt trọn dải `-6 → -5`: đậm ở GIỮA cung, nhạt ở HAI ĐẦU.
 *     Lát hẹp chỉ bắt được một đoạn ngẫu nhiên → gần như một màu.
 *   - Kết quả: mỗi lát một độ đậm khác nhau → vành nhìn **LOANG LỔ**, và màu
 *     trung bình của cung KHÔNG còn khớp ô màu chú thích (legend nói dối).
 *
 * Ý đồ đúng của `chart-conventions.md §1.3` là gradient hướng tâm ĐỒNG NHẤT cho
 * cả vòng (mép trong tối `-6` → mép ngoài `-5`) — muốn vậy phải khai
 * `gradientUnits="userSpaceOnUse"` với tâm + bán kính THẬT của donut (xem
 * `site-resources/_shared/components/charts/DonutChart.tsx`, nơi có sẵn `size`
 * bằng px nên tính được toạ độ).
 *
 * Vành donut chỉ dày ~20-40px: dải quá hẹp để đọc ra chuyển sắc, nên chi phí
 * dựng userSpaceOnUse không đáng. **Vành donut TÔ PHẲNG `tokenVar(token)`** —
 * tiền lệ này từng chốt ở donut "Máy thiết bị" của `dashboard-project`; box đó
 * nay đã chuyển sang biểu đồ cột (`EquipmentChart`), nhưng kết luận về gradient
 * cho VÀNH donut vẫn nguyên giá trị cho mọi donut còn lại.
 *
 * ── Còn dùng được ở đâu ──────────────────────────────────────────────────────
 * Nơi phần tử tham chiếu gradient CHÍNH LÀ (gần) cả hình tròn, lúc đó bbox ≈
 * bbox donut nên objectBoundingBox cho ra đúng kết quả mong muốn: đĩa nền ở tâm
 * (`<Pie>` 360° đặc), hoặc mảng chữ nhật (bar / area).
 *
 * @param color Nhận cả BA dạng đang tồn tại trong codebase:
 *   - Token trần, vd `'info-5'` → dùng `-6` / `-5` cùng hue.
 *   - CSS var dựng sẵn, vd `'var(--color-teal-5)'` → bóc token rồi hạ bậc.
 *   - Hex tự do, vd `'#22C55E'` (màu nhà thầu cấu hình trong org-departments,
 *     xem `contractor-color-system.md`) → trộn tối 18% cho điểm dừng trong.
 *     KHÔNG map hex về token: rule đó yêu cầu giữ nguyên hex legacy ngoài palette.
 *
 * Màu chrome (`var(--color-bg-3)`, `neutral-7`, `border-1`), `color-mix(...)`
 * và mọi chuỗi không hạ bậc được → trả 2 stop CÙNG màu, tức tô PHẲNG. Nhờ vậy
 * gọi được cho mọi lát, kể cả track ring / lát "trống", mà không cần rẽ nhánh
 * ở phía component.
 *
 * @example
 * <radialGradient id={id} cx="50%" cy="50%" r="50%">
 *   {arcGradientStops(slice.color).map((s) => (
 *     <stop key={s.offset} offset={s.offset} stopColor={s.color} />
 *   ))}
 * </radialGradient>
 * <Cell fill={`url(#${id})`} />
 */
export function arcGradientStops(color: string): ArcGradientStop[] {
  if (isHexColor(color)) {
    return ARC_GRADIENT_STOPS.map(({ offset, step }) => ({
      offset,
      // step 6 = điểm dừng trong (tối hơn) · step 5 = mép ngoài (màu gốc)
      color:
        step === 6
          ? `color-mix(in srgb, ${color} ${HEX_INNER_MIX}%, var(--color-neutral-10))`
          : color,
    }));
  }

  const token = tokenFromCssVar(color) ?? color;

  // Không hạ bậc được (chrome / không có bậc / color-mix) → giữ phẳng.
  if (!canStepDown(token)) {
    return ARC_GRADIENT_STOPS.map(({ offset }) => ({ offset, color }));
  }

  const family = colorFamily(token);
  return ARC_GRADIENT_STOPS.map(({ offset, step }) => ({
    offset,
    color: `var(--color-${family}-${step})`,
  }));
}

/**
 * Điểm dừng cho gradient của CỘT DỌC CAO — 3 stop, `-7 → -6 → -5` (chân → đỉnh).
 *
 * Vì sao cần bản riêng thay vì dùng `arcGradientStops`: cung donut chỉ dày
 * 20-40px nên 2 stop là quá đủ (xem ghi chú ở trên — dải hẹp tới mức không đọc
 * ra chuyển sắc). Cột dọc của bar chart thì chạy 100-400px, gấp cả chục lần. Ở
 * quãng đó, gradient 2 stop `-6 → -5` trải ra thành gần như MỘT MÀU PHẲNG: mắt
 * không bắt được chênh lệch 1 bậc khi nó bị kéo dài đến thế, nên cột mất chiều
 * sâu và trông bệt.
 *
 * 3 stop, biên độ 2 bậc — đúng trần mà `chart-conventions.md §1.3` cho phép
 * ("biên độ tối đa 2 bậc `-7`→`-5`") và KHÔNG đổi hue, nên danh tính series giữ
 * nguyên: ô màu chú thích vẫn khớp phần sáng nhất của cột.
 *
 * Stop giữa đặt ở 55% chứ không phải 50%: nửa dưới cột là phần bị nhãn trục và
 * lưới cắt ngang nhiều nhất, kéo dài vùng tối ở đó giúp nét lưới không bị lẫn
 * vào thân cột.
 *
 * @param color Nhận cả ba dạng như `arcGradientStops`: token trần, `var(...)`,
 *              hex tự do. Màu chrome / không hạ bậc được → 3 stop CÙNG màu, tức
 *              tô phẳng, nên gọi được cho mọi cột kể cả cột gộp "Khác".
 *
 * @example
 * // Vector đi từ ĐÁY lên ĐỈNH → stop 0% là chân cột.
 * <linearGradient gradientUnits="userSpaceOnUse" x1={x} y1={baseY} x2={x} y2={topY}>
 *   {columnGradientStops(color).map((s) => (
 *     <stop key={s.offset} offset={s.offset} stopColor={s.color} />
 *   ))}
 * </linearGradient>
 */
const COLUMN_GRADIENT_STOPS = [
  { offset: '0%', step: 7 },
  { offset: '55%', step: 6 },
  { offset: '100%', step: 5 },
] as const;

/**
 * Tỉ lệ trộn tối cho từng bậc khi màu là HEX tự do (`Department.color`).
 * Chọn sao cho khoảng cách nhìn thấy xấp xỉ đúng 1 và 2 bậc của palette
 * generated, để cột tô bằng hex và cột tô bằng token có cùng "độ khối".
 */
const HEX_MIX_BY_STEP: Record<number, number> = { 6: HEX_INNER_MIX, 7: 68 };

export function columnGradientStops(color: string): ArcGradientStop[] {
  if (isHexColor(color)) {
    return COLUMN_GRADIENT_STOPS.map(({ offset, step }) => ({
      offset,
      color:
        step === 5
          ? color
          : `color-mix(in srgb, ${color} ${HEX_MIX_BY_STEP[step]}%, var(--color-neutral-10))`,
    }));
  }

  const token = tokenFromCssVar(color) ?? color;

  // Không hạ bậc được (chrome / không có bậc / color-mix) → giữ phẳng.
  if (!canStepDown(token)) {
    return COLUMN_GRADIENT_STOPS.map(({ offset }) => ({ offset, color }));
  }

  const family = colorFamily(token);
  return COLUMN_GRADIENT_STOPS.map(({ offset, step }) => ({
    offset,
    color: `var(--color-${family}-${step})`,
  }));
}

/**
 * Nền CSS cho MẢNG CHỮ NHẬT (thân bar ngang/dọc, thanh tiến độ, chip khối đặc).
 *
 * Đây là dạng dùng ĐÚNG của `arcGradientStops`: phần tử tham chiếu là một hình
 * chữ nhật nên không dính bẫy bounding-box của cung donut (xem ghi chú dài ở
 * trên). Trả thẳng chuỗi `linear-gradient(...)` để gán vào `style.background`.
 *
 * Hướng gradient là DỌC (mặc định 180deg): mép trên giữ màu gốc `-5`, mép dưới
 * hạ xuống `-6`. Đây là chiều duy nhất đúng theo `chart-conventions.md §1.3` —
 * trộn với TRẮNG để "cho sáng" sẽ đẩy lightness lên trên 0.85 và gây bloom
 * (nhoè cạnh, chói) đúng thứ mà quy tắc đó sinh ra để chặn.
 *
 * Nhận cả token trần, `var(--color-*)` và hex tự do — màu không hạ bậc được sẽ
 * ra gradient 2 stop cùng màu, tức tô phẳng, nên gọi được cho mọi trường hợp.
 *
 * @example
 * <div style={{ background: barGradient(seg.color) }} />
 */
export function barGradient(color: string, angleDeg = 180): string {
  const [inner, outer] = arcGradientStops(color);
  return `linear-gradient(${angleDeg}deg, ${outer.color} 0%, ${inner.color} 100%)`;
}

// ── VÀNH DONUT — gradient chạy DỌC THEO CUNG (userSpaceOnUse) ────────────────
//
// Đây là cách làm ĐÚNG cho vành donut, port từ
// `site-resources/_shared/components/charts/DonutChart.tsx` (panel A1a/A1b Nhân
// sự) — nơi đã chứng minh cho ra vành mượt, không loang lổ.
//
// Ý tưởng: thay vì để SVG tự suy gradient từ bbox mỗi lát (§`arcGradientStops`
// ở trên — nguồn gốc của loang lổ), ta TỰ TÍNH vector gradient trong user space
// của SVG: đi từ MÉP ĐẦU đến MÉP CUỐI của chính cung đó, ở bán kính GIỮA vành.
// Màu vì thế quét dọc theo cung, đúng hướng vòng tròn, và mọi lát đều được đối
// xử như nhau.
//
// ⚠️ BẮT BUỘC: component phải biết `cx` / `cy` / `innerRadius` / `outerRadius`
// bằng PX và truyền CÙNG bộ số đó cho `<Pie>`. Truyền phần trăm cho `<Pie>` rồi
// đoán px ở đây là gradient lệch khỏi cung.

/** Hình học vành donut, đơn vị px trong user space của SVG. */
export interface DonutGeometry {
  cx: number;
  cy: number;
  innerRadius: number;
  outerRadius: number;
  /** Góc bắt đầu theo hệ Recharts (90 = 12h). Default 90. */
  startAngle?: number;
  /** Góc kết thúc. Default -270 = trọn vòng theo chiều kim đồng hồ. */
  endAngle?: number;
}

/** Vector gradient của 1 cung — bơm thẳng vào `<linearGradient>`. */
export interface ArcGradientVector {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Cung rộng (> 120°) — xem ghi chú trong `arcGradientVectors`. */
  wide: boolean;
  /** 2 mép trùng nhau (1 lát chiếm trọn vòng) → PHẢI tô phẳng. */
  degenerate: boolean;
}

/**
 * Vector gradient cho từng cung, theo đúng thứ tự `values` được vẽ.
 *
 * ⚠️ Cung RỘNG (> 120°) phải xử lý khác: gradient của SVG là TUYẾN TÍNH, phần
 * cung phình ra ngoài đoạn nối 2 mép bị kẹp về stop cuối → một mảng lớn của
 * cung bị tô nguyên màu pha (cung đỏ 71% ngả nâu). Với cung rộng dùng trục
 * vuông góc phân giác + CHỈ đổi độ đậm (cùng hue), không pha màu.
 */
export function arcGradientVectors(
  values: readonly number[],
  geometry: DonutGeometry,
): ArcGradientVector[] {
  const { cx, cy, innerRadius, outerRadius, startAngle = 90, endAngle = -270 } = geometry;
  const positive = values.map((v) => (v > 0 ? v : 0));
  const total = positive.reduce((acc, v) => acc + v, 0) || 1;
  const sweep = startAngle - endAngle;
  const midR = (innerRadius + outerRadius) / 2;

  // y đảo dấu: trục y của SVG hướng xuống.
  const pt = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + midR * Math.cos(rad), y: cy - midR * Math.sin(rad) };
  };

  const out: ArcGradientVector[] = [];
  let acc = 0;
  for (const v of positive) {
    const a0 = startAngle - (acc / total) * sweep;
    acc += v;
    const a1 = startAngle - (acc / total) * sweep;
    const mid = (a0 + a1) / 2;
    const wide = Math.abs(a0 - a1) > 120;
    // Cung hẹp: dây cung mép-đầu → mép-cuối. Cung rộng: trục vuông góc phân
    // giác (dài 2·midR) — luôn cắt ngang cung nên không có vùng bị kẹp màu.
    const from = wide ? pt(mid + 90) : pt(a0);
    const to = wide ? pt(mid - 90) : pt(a1);
    out.push({
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      wide,
      degenerate: Math.hypot(to.x - from.x, to.y - from.y) < 1,
    });
  }
  return out;
}

/** 1 điểm dừng của gradient cung. */
export interface ArcStop {
  offset: string;
  color: string;
  opacity: number;
}

/**
 * Trộn 2 màu CSS bất kỳ (token var, hex, color-mix) — `weightA` là phần của `a`.
 * `oklab` để đường trộn đi qua vùng màu tươi; `srgb` dễ ra tone xám bùn khi bắc
 * cầu giữa 2 hue xa nhau.
 */
export function mixColors(a: string, b: string, weightA: number): string {
  const pct = Math.round(Math.max(0, Math.min(1, weightA)) * 100);
  return `color-mix(in oklab, ${a} ${pct}%, ${b})`;
}

/**
 * Điểm dừng cho gradient DỌC CUNG:
 *  - Cung hẹp: giữ nguyên màu gốc tới 70% chiều dài rồi mới pha 12% sang màu lát
 *    KẾ TIẾP → chỗ giáp ranh 2 cung chuyển mềm, nhưng thân cung KHÔNG đổi tone
 *    nên ô màu legend vẫn khớp cung.
 *  - Cung rộng: cùng hue, chỉ hạ độ đậm → tạo khối, không lệch màu.
 *
 * Độ sâu tạo bằng `stopOpacity`, KHÔNG mượn bậc `-4`/`-6` — nên dùng được cho cả
 * màu hex legacy ngoài palette.
 */
export function arcSpectrumStops(color: string, nextColor: string, wide: boolean): ArcStop[] {
  if (wide) {
    return [
      { offset: '0%', color, opacity: 1 },
      { offset: '100%', color, opacity: 0.74 },
    ];
  }
  return [
    { offset: '0%', color, opacity: 1 },
    { offset: '70%', color, opacity: 0.94 },
    { offset: '100%', color: mixColors(color, nextColor, 0.88), opacity: 0.88 },
  ];
}

/**
 * Id `<radialGradient>` an toàn cho `url(#...)`.
 *
 * Bắt buộc dùng kèm `useId()`: nhiều donut trên cùng trang mà trùng id thì mọi
 * cung sẽ ăn chung gradient của donut render đầu tiên. `useId()` sinh chuỗi có
 * dấu `:` — ký tự này phá cú pháp `url(#...)` nên phải strip.
 */
export function arcGradientId(uid: string, key: string | number): string {
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '');
  const safeKey = String(key).replace(/[^a-zA-Z0-9_-]/g, '');
  return `${safeUid}-arc-${safeKey}`;
}
