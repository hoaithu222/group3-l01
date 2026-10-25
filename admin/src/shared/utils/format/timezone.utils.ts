/**
 * Múi giờ (IANA) — giờ trong ngày ở MỘT MÚI GIỜ CHỈ ĐỊNH, kiểm tra tên múi giờ, múi giờ của trình duyệt.
 *
 * Vì sao không dùng `formatDate` / `dayjs`: `formatDate` luôn in theo múi giờ của MÁY. Cần giờ theo múi giờ của
 * một SỰ KIỆN (cuộc họp đặt ở Tokyo, người xem ở Hà Nội) thì dayjs phải nạp plugin `timezone` mà dự án chưa nạp;
 * `Intl.DateTimeFormat` có sẵn ở mọi môi trường và hiểu đúng giờ mùa hè. Đây là chỗ DUY NHẤT gọi nó cho việc đó —
 * cùng lý do `format.utils` là chỗ duy nhất dựng `Intl.NumberFormat` — để nơi dùng không phải nhớ cách dựng.
 */

/** `new Intl.DateTimeFormat()` không rẻ mà hàm dưới chạy trên từng ô bảng ⇒ nhớ theo múi giờ. */
const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

/** Bộ định dạng `HH:mm` của một múi giờ; tên không hợp lệ thì `Intl` ném `RangeError` (và KHÔNG được nhớ). */
function timeFormatterOf(timeZone: string): Intl.DateTimeFormat {
  let formatter = FORMATTERS.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      // `hourCycle: 'h23'` chứ KHÔNG `hour12: false`: cách sau ở một số engine cho nửa đêm ra "24:05".
      hourCycle: 'h23',
      timeZone,
    });
    FORMATTERS.set(timeZone, formatter);
  }
  return formatter;
}

/** Tên múi giờ IANA có hợp lệ với `Intl` không (dữ liệu cũ/lạ có thể mang chuỗi hỏng). */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    timeFormatterOf(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** Múi giờ IANA của trình duyệt (`Asia/Ho_Chi_Minh`…). */
export function getBrowserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * `HH:mm` (24 giờ) của một mốc theo múi giờ `timeZone`.
 * ⛔ `timeZone` phải hợp lệ — kiểm bằng `isValidTimeZone` trước, tên hỏng làm hàm ném `RangeError`.
 */
export function formatTimeInZone(date: Date | string | number, timeZone: string): string {
  return timeFormatterOf(timeZone).format(new Date(date));
}
