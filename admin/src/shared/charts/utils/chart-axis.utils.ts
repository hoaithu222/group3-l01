/**
 * Trục giá trị "đọc được": chốt trần về mốc tròn rồi phát đúng bộ vạch cho trần
 * đó.
 *
 * Khi không được chỉ định `domain`/`ticks`, Recharts tự chọn theo dữ liệu THẬT
 * nên trần trục nhảy theo từng bộ lọc: đổi kỳ 6 tháng → 3 tháng là cả lưới đổi
 * bước, người xem mất mốc so sánh giữa hai lần nhìn. Chốt trần về mốc tròn thì
 * lưới giữ nhịp quen thuộc, và ước lượng "điểm này khoảng bao nhiêu" bằng mắt
 * mới ra đúng số.
 *
 * Đây là chrome của chart (không phải dữ liệu) nên đặt ở `shared/` để mọi box
 * của màn "Tổng quan dự án" dùng chung một cách chia trục.
 */

/**
 * Các bước chia được coi là "tròn" — nhân với luỹ thừa 10 để phủ mọi biên độ.
 *
 * Có cả 1,5 · 2,5 · 3 · 6 chứ không chỉ 1 · 2 · 5 · 10 như cách chia kinh điển:
 * bộ thưa quá thì một dãy max 13,9 bị đẩy lên trần 25 (bước 5 × 5 vạch) — hơn
 * nửa chiều cao khung là khoảng trống, đường dữ liệu bị nén xuống đáy và mất
 * hết độ dốc. Bộ dày hơn cho trần 16, đường chiếm gần trọn khung.
 */
const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10] as const;

/** Số vạch mặc định (không kể vạch 0). */
export const CHART_AXIS_TICK_COUNT = 4;

/**
 * Hệ số chừa chỗ phía trên đỉnh dữ liệu.
 *
 * Không có nó thì khi giá trị lớn nhất rơi đúng vào trần trục, nhãn số đặt trên
 * đỉnh đường bị cắt mất một nửa ở mép khung.
 */
const AXIS_HEADROOM = 1.05;

/** Cắt nhiễu dấu phẩy động sau khi nhân/chia luỹ thừa 10. */
function roundTo(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Trần trục tròn, luôn ≥ `maxValue` và chia hết cho `tickCount` vạch đều nhau.
 * Trả `tickCount` khi dữ liệu rỗng/không hợp lệ để trục vẫn có thang đọc được
 * thay vì sập về 0.
 */
export function niceAxisMax(maxValue: number, tickCount = CHART_AXIS_TICK_COUNT): number {
  if (!Number.isFinite(maxValue) || maxValue <= 0) return tickCount;

  const rawStep = (maxValue * AXIS_HEADROOM) / tickCount;
  const pow = 10 ** Math.floor(Math.log10(rawStep));
  const norm = rawStep / pow;
  const step = (NICE_STEPS.find((s) => norm <= s + 1e-9) ?? 10) * pow;

  return roundTo(step * tickCount);
}

/** Bộ vạch đều từ 0 đến `max` — dùng cho `ticks` của `<YAxis>`. */
export function axisTicks(max: number, tickCount = CHART_AXIS_TICK_COUNT): number[] {
  return Array.from({ length: tickCount + 1 }, (_, i) => roundTo((max * i) / tickCount));
}
