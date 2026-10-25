import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import relativeTime from 'dayjs/plugin/relativeTime';
import utc from 'dayjs/plugin/utc';

/**
 * Định dạng ngày giờ — TIẾNG VIỆT, đúng quy ước Việt Nam.
 *
 * ── ⛔ Quy ước ngày của Việt Nam là NGÀY/THÁNG/NĂM ───────────────────────────
 * `03/04/2026` ở Việt Nam là **3 tháng 4**, ở Mỹ là **4 tháng 3**. Định dạng
 * mặc định của JavaScript đi theo `Intl` của máy, mà máy thì tuỳ người dùng đặt
 * ngôn ngữ gì. Nên KHÔNG bao giờ để mặc định quyết: mọi ngày hiển thị phải đi
 * qua các hàm ở đây.
 *
 * Ngày sai lệch một tháng trong biên bản nghiệm thu là sai lệch pháp lý, không
 * phải lỗi hiển thị.
 *
 * ── Vì sao dayjs mà không phải `Intl.DateTimeFormat` ────────────────────────
 * Hermes (máy JS của React Native) xưa nay cắt bớt ICU để giảm dung lượng, nên
 * `Intl` có mặt nhưng dữ liệu ngôn ngữ không đầy đủ và KHÁC NHAU giữa Android
 * với iOS. Kết quả là cùng một ngày hiển thị khác nhau trên hai máy. dayjs mang
 * theo dữ liệu ngôn ngữ của chính nó nên hai nền tảng ra kết quả giống hệt.
 */

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.locale('vi');

/** Kiểu đầu vào chấp nhận được — chuỗi ISO, timestamp, hoặc `Date`. */
export type DateInput = string | number | Date | null | undefined;

/** Ngày dạng `dd/MM/yyyy`. Chuỗi rỗng khi không có/không hợp lệ. */
export function formatDate(value: DateInput, fallback = ''): string {
  if (value === null || value === undefined || value === '') return fallback;
  const date = dayjs(value);
  return date.isValid() ? date.format('DD/MM/YYYY') : fallback;
}

/** Ngày giờ dạng `dd/MM/yyyy HH:mm`. */
export function formatDateTime(value: DateInput, fallback = ''): string {
  if (value === null || value === undefined || value === '') return fallback;
  const date = dayjs(value);
  return date.isValid() ? date.format('DD/MM/YYYY HH:mm') : fallback;
}

/** Giờ dạng `HH:mm` (24 giờ — quy ước Việt Nam, không dùng SA/CH). */
export function formatTime(value: DateInput, fallback = ''): string {
  if (value === null || value === undefined || value === '') return fallback;
  const date = dayjs(value);
  return date.isValid() ? date.format('HH:mm') : fallback;
}

/**
 * Khoảng cách tương đối: "3 phút trước", "2 ngày trước".
 *
 * Dùng cho dòng thời gian, thông báo, tin nhắn — chỗ mà "vừa xong" hữu ích hơn
 * "14:32". ⛔ Đừng dùng cho ngày trên chứng từ: "2 tháng trước" không tra cứu
 * được và không đối chiếu được với bản giấy.
 */
export function formatRelative(value: DateInput, fallback = ''): string {
  if (value === null || value === undefined || value === '') return fallback;
  const date = dayjs(value);
  return date.isValid() ? date.fromNow() : fallback;
}

/**
 * Mốc thời gian GỌN cho cột phải của hàng danh sách: "Vừa xong" · "5 phút" · "3 giờ" · "Hôm qua" · "4 ngày" · "28/09" ·
 * "28/09/2025". Vẫn là giờ TƯƠNG ĐỐI như `formatRelative`, nhưng bỏ chữ "trước" và chuyển sang ngày sau một tuần: "15 phút
 * trước" dài gấp đôi, ăn thẳng vào bề ngang của tên đứng cạnh (cột danh sách 280dp ở máy tính bảng là cắt ngay).
 * Bản ĐỦ ("15 phút trước") vẫn dùng cho nhãn trợ năng — tai nghe không bị giới hạn bề ngang.
 *
 * ⛔ Gọi trong RENDER thì truyền `now` từ state (`useNow`): mặc định đọc `Date.now()`, mà React Compiler ghi nhớ kết quả
 * theo đầu vào ⇒ "Vừa xong" đứng im tới lần dữ liệu của hàng đổi.
 */
export function formatRelativeShort(
  value: DateInput,
  now: DateInput = Date.now(),
  fallback = '',
): string {
  if (value === null || value === undefined || value === '') return fallback;
  const date = dayjs(value);
  const ref = dayjs(now);
  if (!date.isValid() || !ref.isValid()) return fallback;
  const minutes = ref.diff(date, 'minute');
  // Âm (đồng hồ máy chậm hơn server vài giây) cũng là "vừa xong" — đừng in ra "-1 phút".
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${String(minutes)} phút`;
  const days = ref.startOf('day').diff(date.startOf('day'), 'day');
  if (days === 0) return `${String(ref.diff(date, 'hour'))} giờ`;
  if (days === 1) return 'Hôm qua';
  if (days < 7) return `${String(days)} ngày`;
  return date.format(date.year() === ref.year() ? 'DD/MM' : 'DD/MM/YYYY');
}

/**
 * Chuỗi `yyyy-MM-dd` để GỬI LÊN backend.
 *
 * ⛔ Đừng dùng `new Date().toISOString().slice(0, 10)` cho việc này. `toISOString`
 * đổi sang UTC trước, nên 23:30 ngày 05/04 giờ Việt Nam (UTC+7) ra `2026-04-05`
 * ở đây nhưng `2026-04-05T16:30Z` — và với những máy chủ tự cắt theo UTC thì
 * ngày lùi lại một hôm. Lỗi CHỈ xảy ra với dữ liệu nhập buổi tối, nên nó lọt
 * qua mọi lần thử ban ngày rồi mới lộ khi có người tăng ca.
 */
export function toApiDate(value: DateInput): string | null {
  if (value === null || value === undefined || value === '') return null;
  const date = dayjs(value);
  return date.isValid() ? date.format('YYYY-MM-DD') : null;
}

/**
 * Ngày dài kèm thứ: `Thứ Năm, 25/09/2026` — dòng ngày ở đầu Trang chủ.
 *
 * Thứ lấy từ dữ liệu locale `vi` của dayjs (`thứ năm`), chỉ viết hoa chữ đầu của từng từ để khớp cách
 * người Việt viết thứ trong ngày ("Thứ Năm", "Chủ Nhật").
 */
export function formatLongDate(value: DateInput, fallback = ''): string {
  if (value === null || value === undefined || value === '') return fallback;
  const date = dayjs(value);
  if (!date.isValid()) return fallback;
  const weekday = date
    .format('dddd')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  return `${weekday}, ${date.format('DD/MM/YYYY')}`;
}

/** Đúng ngày hôm nay (theo giờ máy) hay không. */
export function isToday(value: DateInput): boolean {
  if (value === null || value === undefined || value === '') return false;
  const date = dayjs(value);
  return date.isValid() && date.isSame(dayjs(), 'day');
}
