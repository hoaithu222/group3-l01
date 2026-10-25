import type { WellbeingDaily, WellbeingDays } from '../api/wellbeing.types';
import { WELLBEING_DAY_START_HOUR } from '../constants/wellbeing.constants';
import { addDays, formatMinutes } from './wellbeing-format';

/** Một cột của biểu đồ/một dòng của bảng: `daily = null` nghĩa là KHÔNG CÓ số liệu ngày đó (không phải "0 phút" — hai điều khác nhau). */
export interface DaySlot {
  daily: WellbeingDaily | null;
  date: string;
}

/**
 * Ngày wellbeing "hôm nay" theo giờ máy: ngày mới bắt đầu lúc 05:00 (hoạt động 00:00–05:00 tính vào hôm trước — `WELLBEING_DAY_START_HOUR`).
 * Lấy giờ máy chứ không biết múi giờ tài khoản của BE — lệch nhiều nhất một ngày ở đầu biểu đồ, và `seriesEnd` còn kéo theo dữ liệu thật nên không cắt mất cột nào có số liệu.
 */
export function wellbeingToday(now: Date): string {
  const shifted = new Date(now.getTime() - WELLBEING_DAY_START_HOUR * 3_600_000);
  const month = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');
  return `${String(shifted.getFullYear())}-${month}-${day}`;
}

/**
 * Cột cuối của biểu đồ = ngày ĐÃ TRỌN gần nhất (hôm qua theo ngày wellbeing): số liệu của một ngày chỉ có SAU khi ngày đó kết thúc (job chạy sau 05:00 hôm sau),
 * nên "hôm nay" luôn trống — để cột trống ở cuối là nói dối rằng hôm nay bạn không hoạt động. Có ngày dữ liệu mới hơn (lệch múi giờ) thì lấy ngày đó.
 */
export function seriesEnd(dailies: readonly WellbeingDaily[], now: Date): string {
  const yesterday = addDays(wellbeingToday(now), -1);
  return dailies.reduce((latest, daily) => (daily.date > latest ? daily.date : latest), yesterday);
}

/** `days` ô liên tiếp kết thúc ở `seriesEnd`, cũ → mới. Dòng trùng ngày lấy dòng đầu; dòng ngoài cửa sổ bị bỏ. */
export function buildSeries(
  dailies: readonly WellbeingDaily[],
  days: WellbeingDays,
  now: Date,
): DaySlot[] {
  const end = seriesEnd(dailies, now);
  const byDate = new Map<string, WellbeingDaily>();
  for (const daily of dailies) if (!byDate.has(daily.date)) byDate.set(daily.date, daily);
  return Array.from({ length: days }, (_, index) => {
    const date = addDays(end, index - (days - 1));
    return { daily: byDate.get(date) ?? null, date };
  });
}

/** Trần của thang biểu đồ = số phút hoạt động lớn nhất trong cửa sổ (≥ 1 để không chia cho 0 khi chưa có số liệu). */
export function chartCeiling(slots: readonly DaySlot[]): number {
  return Math.max(1, ...slots.map((slot) => slot.daily?.activeMinutes ?? 0));
}

/** Số ngày CÓ số liệu trong cửa sổ. */
export const daysWithData = (slots: readonly DaySlot[]): number =>
  slots.filter((slot) => slot.daily !== null).length;

/**
 * Câu tóm tắt cho trình đọc màn hình — người dùng khiếm thị không xem được cột, nên nhãn của biểu đồ phải nói được ý chính (số ngày có số liệu,
 * ngày dài nhất) và chỉ sang bảng để nghe từng ngày. Không nêu điểm số.
 */
export function summarizeSeries(slots: readonly DaySlot[]): string {
  const withData = slots.filter((slot) => slot.daily !== null);
  if (withData.length === 0) return 'Biểu đồ hoạt động: chưa có số liệu.';
  const peak = Math.max(...withData.map((slot) => slot.daily?.activeMinutes ?? 0));
  return `Biểu đồ hoạt động ${String(slots.length)} ngày: có số liệu ${String(withData.length)} ngày, ngày nhiều nhất ${formatMinutes(peak)}. Chọn "Xem dạng bảng" để nghe từng ngày.`;
}
