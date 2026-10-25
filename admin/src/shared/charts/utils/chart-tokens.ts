/**
 * Helper màu + định dạng số cho chart. KHÔNG hardcode hex; mọi màu đi qua
 * Tailwind token (`color-system.md`).
 *
 * Style object của trục / chú giải / tooltip đã tách sang `chart-style.utils.ts`
 * vì chúng phụ thuộc bậc mật độ (`ChartDensity`), không còn là hằng số.
 */
import {
  CHART_OTHER_TOKEN,
  CHART_SERIES_TOKENS,
  CHART_STATUS,
  PROGRESS_TONE_THRESHOLDS,
} from '../constants/chart-palette.constants';
import { isFiniteNumber } from '@/shared/utils/format/number.utils';

export function tokenVar(token: string): string {
  return `var(--color-${token})`;
}

export function tokenVarAlpha(token: string, alpha: number): string {
  const pct = Math.round(Math.max(0, Math.min(1, alpha)) * 100);
  return `color-mix(in srgb, var(--color-${token}) ${pct}%, transparent)`;
}

/**
 * Tint ĐỤC: trộn thẳng token với một token NỀN thay vì với `transparent`.
 *
 * Dùng khi khối được vẽ bằng thủ thuật "viền 2 lớp" (lớp dưới tô màu viền, lớp
 * ruột thụt vào 1px) — bắt buộc ở các khung VÁT GÓC vì `border` của CSS không
 * chạy theo cạnh vát. Ruột mà trong suốt thì lớp viền bên dưới lộ lên nhuộm cả
 * mặt khối, nên ruột phải là màu đục.
 */
export function tokenVarOver(token: string, alpha: number, baseToken = 'bg-1'): string {
  const pct = Math.round(Math.max(0, Math.min(1, alpha)) * 100);
  return `color-mix(in srgb, var(--color-${token}) ${pct}%, var(--color-${baseToken}))`;
}

/**
 * Đổi bậc của một token, GIỮ NGUYÊN hue: `'info-5'` + 6 → `'info-6'`.
 *
 * Dùng để dựng gradient cho MẢNG LỚN (thân cột, cung donut, area fill) theo
 * `chart-conventions.md §1.3`: trên nền navy, token `-5` có lightness ~0.72–0.85
 * nên mảng lớn bị bloom (nhoè cạnh, chói khi nhìn lâu). Tô `-6 → -5` giữ đúng
 * danh tính màu mà hết chói.
 *
 * Chỉ đổi BẬC, tuyệt đối không đổi hue — gradient đa hue phá vỡ danh tính series.
 */
export function tokenAtStep(token: string, step: number): string {
  return `${token.replace(/-\d+$/, '')}-${step}`;
}

/**
 * Token màu của 1 vòng tiến độ, suy TỪ giá trị % thay vì gán tay theo dòng.
 * Bảng ngưỡng ở `chart-palette.constants.ts` — xem lý do ở đó.
 */
/**
 * ⚠️ Ngưỡng ở đây (90/60/30) CỐ Ý khác `progressVariantOf` (100/70/30) trong
 * `utils/style/progress.utils.ts` — hai thang cho hai việc khác nhau:
 *
 *   `progressVariantOf`   → thanh tiến độ của MỘT việc: chỉ 100% mới là "xong",
 *                            nên mốc trên cùng phải đúng bằng 100.
 *   `progressToneToken`   → sức khoẻ của một CHỈ TIÊU trên biểu đồ: 90% đã là
 *                            tốt, đòi tròn 100 thì mọi cột đều đỏ.
 *
 * Đừng "thống nhất" hai bảng này thành một; ghi rõ ở đây để lần sau không ai
 * tưởng là lỗi rồi sửa nhầm.
 */
export function progressToneToken(percent: number): string {
  const tier = PROGRESS_TONE_THRESHOLDS.find((t) => percent >= t.min);
  return tier?.token ?? CHART_STATUS.late;
}

/** Cặp màu gradient cho mảng lớn: `[đậm, sáng]` cùng hue. */
export function areaGradientPair(token: string): readonly [string, string] {
  return [tokenAtStep(token, 6), token];
}

/**
 * Màu series thứ `index` theo dải chuẩn. Vượt trần 8 series → token "Khác".
 *
 * KHÔNG dùng modulo: quay vòng khiến series thứ 9 trùng màu series thứ 1, người
 * xem đọc ra "cùng loại". Gom vào "Khác" là hành vi đúng.
 */
export function seriesTokenAt(index: number): string {
  return CHART_SERIES_TOKENS[index] ?? CHART_OTHER_TOKEN;
}

/**
 * Số nguyên + dấu phân tách hàng nghìn. Ẩn 0/null. Dùng cho nhãn đỉnh cột.
 *
 * ⚠️ Locale `vi-VN` — thống nhất toàn feature. Bản cũ trộn `en-US` ở nhãn chart
 * với `vi-VN` ở header nên CÙNG một tập số hiện hai kiểu dấu phân tách khác
 * nhau trên cùng một card.
 */
export function labelInt(v: number | null | undefined): string {
  // `isFiniteNumber` chứ không `v == null`: `NaN == null` là false, nên guard
  // cũ để lọt NaN và nhãn in ra đúng chữ "NaN" giữa biểu đồ.
  if (!isFiniteNumber(v) || v === 0) return '';
  return Math.round(v).toLocaleString('vi-VN');
}

/** Thập phân đầy đủ (3 chữ số) cho tooltip. Ẩn 0/null. */
export function fmt3(v: number | null | undefined): string {
  if (!isFiniteNumber(v) || v === 0) return '';
  return (Math.round(v * 1000) / 1000).toLocaleString('vi-VN', {
    maximumFractionDigits: 3,
  });
}

/**
 * Bề rộng cột theo số nhóm dữ liệu — ít nhóm thì cột đậm, nhiều nhóm thì thon,
 * để bar chart luôn cân đối bất kể số loại.
 *
 * Nhận thêm bậc mật độ: cùng 4 nhóm, slot cao thì cột nên dày hơn slot bẹt.
 */
export function barSizeByCount(groupCount: number, scale = 1): number {
  const base =
    groupCount <= 2 ? 34 : groupCount <= 4 ? 22 : groupCount <= 6 ? 16 : groupCount <= 10 ? 12 : 9;
  return Math.round(base * scale);
}
