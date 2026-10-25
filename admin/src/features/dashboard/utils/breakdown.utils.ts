import { CHART_OTHER_TOKEN, seriesTokenAt } from '@/shared/charts';
import { formatNumber } from '@/shared/utils/format';

import type { InsightsBreakdownItem } from '@/core/api/admin';
import {
  CALL_MEDIA_ORDER,
  CATEGORY_AXIS_MAX_RATIO,
  CATEGORY_AXIS_PADDING,
  CATEGORY_CHAR_WIDTH_EM,
  MESSAGE_SCOPE_ORDER,
  REPORT_STATUS_COLORS,
  USER_ROLE_ORDER,
  USER_STATUS_COLORS,
} from '../constants/breakdown.constants';

/**
 * Hàm THUẦN cho khối "Phân bổ & hoạt động" — dựng hàng dữ liệu (nhãn, tỉ lệ, màu) cho donut/chú giải/thanh. Heatmap ở `heatmap.utils.ts`,
 * bố cục lưới panel ở `breakdown-layout.utils.ts`. Không đụng React, không đụng store.
 */

// ── Hàng phân bổ ─────────────────────────────────────────────────────────────

/** Một dòng đã sẵn sàng để vẽ: nhãn tiếng Việt, số, tỉ lệ (0–100) và token màu. */
export interface BreakdownRow {
  key: string;
  label: string;
  count: number;
  /** % trên TỔNG của cả tập (không phải tổng phần đang hiển thị). */
  percent: number;
  colorToken: string;
}

/** `index` = vị trí trong danh sách ĐÃ SẮP của hàng đang tô màu. */
export type BreakdownColorOf = (key: string, index: number) => string;

/**
 * Số đếm dùng để vẽ. Không hữu hạn hoặc âm (vd XP bị điều chỉnh trừ) → 0: lát/thanh không có chiều âm để vẽ,
 * và để lọt vào tổng thì tỉ lệ của mọi dòng khác bị méo.
 */
function safeCount(count: number): number {
  return Number.isFinite(count) && count > 0 ? count : 0;
}

/** Tổng các số đếm (đã lọc bằng `safeCount`). */
export function sumCounts(items: readonly InsightsBreakdownItem[]): number {
  return items.reduce((sum, item) => sum + safeCount(item.count), 0);
}

/** Có ít nhất một dòng > 0 — tập toàn 0 thì vẽ biểu đồ ra chỉ là khung trống, hiện trạng thái rỗng thay vì vậy. */
export function hasPositiveCount(items: readonly InsightsBreakdownItem[] | undefined): boolean {
  return items !== undefined && sumCounts(items) > 0;
}

/** Tỉ lệ % (0–100). Tổng ≤ 0 → 0, KHÔNG chia cho 0 ra `NaN`. */
export function toPercent(count: number, total: number): number {
  return total > 0 ? (safeCount(count) / total) * 100 : 0;
}

/** "45%" · "<1%" (có số nhưng làm tròn ra 0 sẽ đọc nhầm là "không có") · "0%". */
export function formatShare(percent: number): string {
  if (percent <= 0) return '0%';
  if (percent < 1) return '<1%';
  return `${formatNumber(Math.round(percent))}%`;
}

/** GIẢM dần theo số đếm, hoà thì theo `key` để thứ tự ổn định giữa các lần tải. `limit` cắt top-N. */
export function sortBreakdown(
  items: readonly InsightsBreakdownItem[],
  limit?: number,
): InsightsBreakdownItem[] {
  const sorted = [...items].sort(
    (a, b) => safeCount(b.count) - safeCount(a.count) || a.key.localeCompare(b.key),
  );
  return limit === undefined ? sorted : sorted.slice(0, limit);
}

/** TĂNG dần theo `key` đọc như số (cấp độ "2" đứng trước "10"); `key` không phải số xếp cuối. */
export function sortByNumericKey(items: readonly InsightsBreakdownItem[]): InsightsBreakdownItem[] {
  const order = (key: string) => (Number.isFinite(Number(key)) ? Number(key) : Number.MAX_SAFE_INTEGER);
  return [...items].sort((a, b) => order(a.key) - order(b.key) || a.key.localeCompare(b.key));
}

/** Nhãn tiếng Việt của mã BE. Mã lạ (BE thêm enum mới) → hiện NGUYÊN mã, không để trống hay "undefined". */
export function labelOf(labels: Readonly<Record<string, string>>, key: string): string {
  return labels[key] ?? key;
}

/** Màu mặc định: slot theo THỨ HẠNG trong dải `seriesTokenAt` (quá 8 → xám "Khác"). */
export const defaultColorOf: BreakdownColorOf = (_key, index) => seriesTokenAt(index);

/**
 * Màu phân loại theo MÃ chứ không theo thứ hạng: slot = vị trí của mã trong `order`. Nhờ vậy "Thoại" luôn cùng một màu
 * dù hôm nay Video đông hơn — màu theo thứ hạng sẽ đổi chỗ mỗi lần số liệu đổi, người xem không học được ý nghĩa màu.
 * Mã lạ lấy các slot tiếp theo.
 */
export function categoricalColorOf(order: readonly string[]): BreakdownColorOf {
  return (key, index) => {
    const position = order.indexOf(key);
    return seriesTokenAt(position >= 0 ? position : order.length + index);
  };
}

/** Màu NGỮ NGHĨA (trạng thái): tra bảng theo mã, mã lạ → xám trung tính. */
export function mappedColorOf(
  colors: Readonly<Record<string, string>>,
  fallback: string = CHART_OTHER_TOKEN,
): BreakdownColorOf {
  return (key) => colors[key] ?? fallback;
}

// Dựng MỘT lần ở module-scope: hàm tô màu đứng yên giữa các lần render nên không phá `memo`/`useMemo` của biểu đồ nhận nó qua prop.
export const colorOfUserStatus = mappedColorOf(USER_STATUS_COLORS);
export const colorOfReportStatus = mappedColorOf(REPORT_STATUS_COLORS);
export const colorOfUserRole = categoricalColorOf(USER_ROLE_ORDER);
export const colorOfCallMedia = categoricalColorOf(CALL_MEDIA_ORDER);
export const colorOfMessageScope = categoricalColorOf(MESSAGE_SCOPE_ORDER);

/**
 * Tập dữ liệu → các hàng đã sắp xếp, gắn nhãn, tỉ lệ, màu. `ordered` = giữ nguyên thứ tự đầu vào (cấp độ đã xếp theo số);
 * mặc định sắp GIẢM dần theo số đếm. `limit` cắt top-N SAU khi sắp, nhưng tỉ lệ vẫn tính trên tổng cả tập.
 */
export function buildBreakdownRows(
  items: readonly InsightsBreakdownItem[],
  labels: Readonly<Record<string, string>>,
  options: { colorOf?: BreakdownColorOf; limit?: number; ordered?: boolean } = {},
): BreakdownRow[] {
  const { colorOf = defaultColorOf, limit, ordered = false } = options;
  const total = sumCounts(items);
  const sorted = ordered ? [...items] : sortBreakdown(items);
  const shown = limit === undefined ? sorted : sorted.slice(0, limit);
  return shown.map((item, index) => ({
    key: item.key,
    label: labelOf(labels, item.key),
    count: safeCount(item.count),
    percent: toPercent(item.count, total),
    colorToken: colorOf(item.key, index),
  }));
}

/** Cắt nhãn dài bằng "…" (tên đầy đủ vẫn nằm ở tooltip). */
export function truncateLabel(label: string, maxChars: number): string {
  if (label.length <= maxChars) return label;
  return `${label.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

/**
 * Bề rộng trục danh mục của thanh ngang: vừa đủ chứa nhãn DÀI NHẤT (ước theo cỡ chữ), không nhỏ hơn `minWidth` (sàn của
 * `m.scale.yAxisWidth`) và không vượt `CATEGORY_AXIS_MAX_RATIO` bề ngang biểu đồ — để thanh luôn còn chỗ vẽ ở panel hẹp.
 * Chưa đo được bề ngang (`chartWidth` = 0, khung hình đầu) → không chặn trần.
 */
export function categoryAxisWidth(
  rows: readonly Pick<BreakdownRow, 'label'>[],
  fontSize: number,
  chartWidth: number,
  minWidth: number,
): number {
  const longest = rows.reduce((max, row) => Math.max(max, row.label.length), 0);
  const wanted = Math.ceil(longest * fontSize * CATEGORY_CHAR_WIDTH_EM) + CATEGORY_AXIS_PADDING;
  const cap = chartWidth > 0 ? Math.floor(chartWidth * CATEGORY_AXIS_MAX_RATIO) : wanted;
  return Math.max(minWidth, Math.min(wanted, cap));
}

/** Số ký tự nhãn nhét vừa trục danh mục `axisWidth` — dùng để cắt "…" nhãn quá dài. */
export function maxLabelChars(axisWidth: number, fontSize: number): number {
  return Math.max(4, Math.floor((axisWidth - CATEGORY_AXIS_PADDING) / (fontSize * CATEGORY_CHAR_WIDTH_EM)));
}
