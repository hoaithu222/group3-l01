/**
 * MonthWindow — cửa sổ N tháng liên tiếp, vắt qua ranh giới năm.
 *
 * Colocated với `MonthYearStartPicker` vì đây là phép toán nội bộ của picker:
 * user chọn 1 tháng bắt đầu → picker cần expand ra N slot `{ monthIdx, year }`
 * để highlight và dựng nhãn range trên trigger.
 *
 * Ví dụ:
 *   buildMonthWindow(7, 2025, 12)
 *   → slots [{idx:6,y:2025}, …, {idx:11,y:2025}, {idx:0,y:2026}, …, {idx:5,y:2026}]
 */

export interface MonthSlot {
  /** Index tháng trong năm (0 = T1, 11 = T12). */
  monthIdx: number;
  /** Năm dương lịch của slot. */
  year: number;
}

export interface MonthWindow {
  /** Tháng bắt đầu (1..12) — tiện set state từ picker. */
  startMonth: number;
  startYear: number;
  /** Số tháng trong window — mặc định 12 (rolling 12). */
  span: number;
  /** Các slot tuần tự đã expand sẵn. */
  slots: MonthSlot[];
}

/** Số tháng tối đa cho 1 window (chống span quá lớn). */
const MAX_SPAN = 36;

/**
 * Build window N tháng tuần tự bắt đầu từ `(startMonth/startYear)`.
 * `startMonth` clamp về `[1, 12]`, `span` clamp về `[1, MAX_SPAN]`.
 */
export function buildMonthWindow(startMonth: number, startYear: number, span = 12): MonthWindow {
  const sm = Math.min(12, Math.max(1, Math.floor(startMonth)));
  const sy = Math.floor(startYear);
  const sp = Math.min(MAX_SPAN, Math.max(1, Math.floor(span)));

  const slots: MonthSlot[] = [];
  for (let i = 0; i < sp; i += 1) {
    const absoluteIdx = sm - 1 + i; // 0-based từ startMonth
    const year = sy + Math.floor(absoluteIdx / 12);
    const monthIdx = ((absoluteIdx % 12) + 12) % 12;
    slots.push({ monthIdx, year });
  }

  return { startMonth: sm, startYear: sy, span: sp, slots };
}

/**
 * Label của 1 slot.
 *  - `short`   → "T7/2026" (mặc định — đủ năm full cho rõ)
 *  - `compact` → "T7/26"   (widget hẹp)
 *  - `long`    → "Tháng 7/2026" (tooltip)
 */
export function formatSlotLabel(
  slot: MonthSlot,
  style: 'short' | 'compact' | 'long' = 'short',
): string {
  const m = slot.monthIdx + 1;
  if (style === 'long') return `Tháng ${m}/${slot.year}`;
  if (style === 'compact') return `T${m}/${String(slot.year).slice(-2)}`;
  return `T${m}/${slot.year}`;
}

/** Mảng nhãn theo style đồng nhất. */
export function buildMonthLabels(
  window: MonthWindow,
  style: 'short' | 'compact' | 'long' = 'short',
): string[] {
  return window.slots.map((s) => formatSlotLabel(s, style));
}

/**
 * Nhãn 12 tháng dạng ngắn cho lưới chọn tháng (3 cột × 4 hàng).
 *
 * Ở đây chứ không ở `month-grid.tsx`: file kia CHỈ được xuất component
 * (`react-refresh/only-export-components`), và ba picker theo tháng đều cần
 * đúng mảng này.
 */
export const MO_LABELS = [
  'Th.1',
  'Th.2',
  'Th.3',
  'Th.4',
  'Th.5',
  'Th.6',
  'Th.7',
  'Th.8',
  'Th.9',
  'Th.10',
  'Th.11',
  'Th.12',
] as const;

/**
 * Khoá TUYỆT ĐỐI của một ô tháng (`year*12 + monthIdx`, `monthIdx` 0-11).
 *
 * So sánh bằng số nguyên nên "T12/2025 < T1/2026" luôn đúng — so từng cặp
 * (year, month) bằng tay chính là chỗ sinh lỗi ở khoảng vắt qua giao thừa.
 */
export const slotKey = (monthIdx: number, year: number) => year * 12 + monthIdx;
