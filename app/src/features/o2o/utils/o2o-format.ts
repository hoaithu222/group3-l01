import { toZoned } from '@/shared/utils/datetime/zoned';
import { formatCurrency } from '@/shared/utils/format/currency.utils';

import type { NearLocation, OpenHour } from '../api/o2o.types';
import { WEEKDAY_LABEL } from '../constants/o2o.constants';

/** Múi giờ để hiểu giờ mở cửa — khớp `LIMITS.o2o.timezone` của BE (`openNow` do BE tính theo múi giờ này). */
export const O2O_TIMEZONE = 'Asia/Ho_Chi_Minh';

/** Độ ồn trung bình (1 yên tĩnh … 5 ồn) → chữ. `0` = chưa ai đánh giá. Ngưỡng chia đều ba đoạn 1–2,4 · 2,5–3,6 · từ 3,7. */
export function noiseLabel(noiseAvg: number): string | null {
  if (!(noiseAvg > 0)) return null;
  if (noiseAvg < 2.5) return 'Yên tĩnh';
  if (noiseAvg < 3.7) return 'Vừa';
  return 'Ồn';
}

/** "4,5" — dấu phẩy thập phân; `0` sao (chưa có đánh giá) trả `null` để nơi gọi hiện "Chưa có đánh giá" thay vì "0,0". */
export function formatRating(ratingAvg: number): string | null {
  if (!(ratingAvg > 0)) return null;
  return ratingAvg.toFixed(1).replace('.', ',');
}

/** Dòng tóm tắt sao + độ ồn dưới tên địa điểm, vd "4,5 sao (12) · Yên tĩnh"; chưa có đánh giá → "Chưa có đánh giá". */
export function ratingSummary(
  item: Pick<NearLocation, 'ratingAvg' | 'ratingCount' | 'noiseAvg'>,
): string {
  const stars = formatRating(item.ratingAvg);
  if (!stars) return 'Chưa có đánh giá';
  const noise = noiseLabel(item.noiseAvg);
  return `${stars} sao (${item.ratingCount})${noise ? ` · ${noise}` : ''}`;
}

/** `null` = chưa khai giờ mở cửa. Chữ + biểu tượng đi cùng (không để MÀU làm dấu hiệu duy nhất). */
export function openStatusText(openNow: boolean | null): string {
  if (openNow === null) return 'Chưa có giờ mở cửa';
  return openNow ? 'Đang mở cửa' : 'Đang đóng cửa';
}

function slotText(slot: OpenHour): string {
  return `${slot.open} – ${slot.close}`;
}

/** Giờ mở cả tuần: 7 dòng (Thứ hai … Chủ nhật), ngày không có khung giờ = "Đóng cửa"; nhiều khung một ngày nối bằng ", ". */
export function weekSchedule(
  openHours: OpenHour[],
): { day: number; label: string; text: string }[] {
  return [1, 2, 3, 4, 5, 6, 0].map((day) => {
    const slots = openHours
      .filter((slot) => slot.day === day)
      .sort((a, b) => a.open.localeCompare(b.open));
    return {
      day,
      label: WEEKDAY_LABEL[day] ?? String(day),
      text: slots.length > 0 ? slots.map(slotText).join(', ') : 'Đóng cửa',
    };
  });
}

/** Giờ mở HÔM NAY ("07:00 – 22:00") theo múi giờ VN; `null` khi chưa khai giờ, "Hôm nay đóng cửa" khi ngày đó không có khung. */
export function todayHoursText(openHours: OpenHour[], now: Date = new Date()): string | null {
  if (openHours.length === 0) return null;
  const weekday = toZoned(now, O2O_TIMEZONE)?.weekday ?? now.getDay();
  const today = weekSchedule(openHours).find((row) => row.day === weekday);
  return today && today.text !== 'Đóng cửa' ? today.text : 'Hôm nay đóng cửa';
}

/** "482913" → "482 913" (cách quãng dễ đọc từ xa, app.md §7). Không đủ 6 số thì trả nguyên. */
export function formatPin(pin: string): string {
  return /^\d{6}$/.test(pin) ? `${pin.slice(0, 3)} ${pin.slice(3)}` : pin;
}

/** Nội dung QR = `mãĐơn|PIN` (app.md §2 `OrderTicket`) — màn của tiệm tách theo `|` rồi điền sẵn mã đơn + PIN. */
export function qrPayload(code: string, pin: string): string {
  return `${code}|${pin}`;
}

/** Giá một trang, vd "500 VND/trang". ⛔ Không tự nối chuỗi tiền — `formatCurrency` chốt dấu chấm ngăn nghìn cho cả hai nền tảng. */
export function pricePerPage(amount: number): string {
  return `${formatCurrency(amount)}/trang`;
}
