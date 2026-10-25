import dayjs from 'dayjs';

import { finiteOr } from './number.utils';

/**
 * Định dạng số và ngày cho hiển thị.
 *
 * ⛔ Mọi formatter số đều lọc qua `finiteOr` TRƯỚC. `Intl.NumberFormat` gặp
 * `NaN` sẽ in ra đúng chuỗi "NaN" và nó nằm chình ình giữa màn hình. `NaN` lọt
 * vào từ `Number(undefined)`, phép chia mẫu số 0, hoặc trường số BE trả `null`
 * trong khi type khai `number`.
 *
 * Dùng `Intl.NumberFormat` của trình duyệt, KHÔNG thêm thư viện định dạng số:
 * nó có sẵn ở mọi môi trường, hiểu quy ước dấu phân tách của từng locale, và
 * tự xử lý đúng số âm — ba thứ mà một hàm tự viết hay làm sai.
 */

/** Bộ định dạng dựng MỘT LẦN — `new Intl.NumberFormat()` mỗi lượt gọi khá tốn. */
const VND = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const USD = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const PERCENT = new Intl.NumberFormat('vi-VN', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Tiền tệ. VND không có phần lẻ; USD luôn 2 chữ số lẻ. */
export function formatCurrency(value: number, currency: 'VND' | 'USD' = 'VND'): string {
  const safe = finiteOr(value);
  return currency === 'VND' ? `${VND.format(safe)} ₫` : `$${USD.format(safe)}`;
}

/** Số có dấu phân tách hàng nghìn, `decimals` chữ số lẻ (mặc định 0). */
const NUMBER_CACHE = new Map<number, Intl.NumberFormat>();

/**
 * Số nguyên/thập phân theo locale vi-VN.
 *
 * Bộ định dạng được nhớ theo số chữ số thập phân — dựng `Intl.NumberFormat`
 * không hề rẻ, mà hàm này chạy trên từng ô của bảng và từng nhãn của biểu đồ.
 */
export function formatNumber(value: number, decimals = 0): string {
  let fmt = NUMBER_CACHE.get(decimals);
  if (!fmt) {
    fmt = new Intl.NumberFormat('vi-VN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    NUMBER_CACHE.set(decimals, fmt);
  }
  return fmt.format(finiteOr(value));
}

/** Phần trăm. Nhận số theo THANG 100 (`12.5` → `"12,5%"`). */
export function formatPercent(value: number): string {
  return PERCENT.format(finiteOr(value) / 100);
}

/** Ngày (mặc định DD/MM/YYYY). */
export function formatDate(date: Date | string, format = 'DD/MM/YYYY'): string {
  return dayjs(date).format(format);
}

/**
 * Thời điểm dạng "HH:mm · DD/MM/YYYY" (vd `"16:52 · 02/07/2026"`) — dùng cho
 * dòng phụ của dashboard. Bỏ trống tham số → lấy thời điểm gọi.
 */
export function formatNow(date: Date | string = new Date()): string {
  return dayjs(date).format('HH:mm · DD/MM/YYYY');
}

/** Khoảng cách tới hiện tại, dạng người đọc ("3 giờ trước"). */
export function formatRelativeTime(date: Date | string): string {
  const diff = dayjs().diff(dayjs(date), 'minute');
  // Mốc TƯƠNG LAI cho `diff` âm. Không chặn thì hạn còn 3 ngày nữa lại hiện
  // "Vừa xong" (vì -4320 < 1) — sai hẳn nghĩa với người đọc.
  if (diff < 0) return formatDate(date);
  if (diff < 1) return 'Vừa xong';
  if (diff < 60) return `${diff} phút trước`;
  const hours = Math.floor(diff / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  return formatDate(date);
}
