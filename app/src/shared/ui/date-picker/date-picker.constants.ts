import type { CalendarLocale, DatePickerPrecision } from './date-picker.types';

/**
 * Tên thứ và tháng viết SẴN trong hằng số — ⛔ KHÔNG gọi `Intl`.
 *
 * Hermes trên Android được phát hành kèm bản ICU RÚT GỌN: `Intl` có mặt (nên
 * không ai thấy lỗi) nhưng dữ liệu ngôn ngữ thiếu, và
 * `toLocaleDateString('vi-VN', { weekday: 'long' })` trả về "Monday" thay vì
 * "Thứ Hai" trên một phần máy Android — đúng những máy phổ thông mà ngân hàng
 * có nhiều người dùng nhất. Lỗi này KHÔNG hiện trên máy ảo iOS lúc phát triển.
 *
 * dayjs cũng mang gói `vi`, nhưng gói đó viết "thứ hai" (không hoa) và
 * `dayjs.locale()` là trạng thái TOÀN CỤC — một màn hình khác đổi locale là
 * lịch đổi theo. Hằng số ở đây không có cả hai rủi ro.
 */

/** Thứ viết tắt trên đầu lưới, xếp theo `Dayjs.day()`: 0 = Chủ nhật. */
const WEEKDAYS_SHORT_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;

/** Thứ đầy đủ cho trình đọc màn hình ("Thứ Hai, 8 tháng 9 năm 2026"). */
const WEEKDAYS_LONG_VI = [
  'Chủ nhật',
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
] as const;

/** Ngôn ngữ mặc định — tiếng Việt, đúng bản thiết kế ("Tháng 12 - 2024"). */
export const VI_LOCALE: CalendarLocale = {
  /** Tiêu đề lưới chọn Năm. Figma dùng gạch ngang dài: "2020 – 2029". */
  decadeTitle: (from, to) => `${from} – ${to}`,
  /** Nhãn một ô của lưới chọn Tháng ("Tháng 1"), `month` đếm từ 0. */
  monthLabel: (month) => `Tháng ${month + 1}`,
  monthTitle: (month, year) => `Tháng ${month + 1} - ${year}`,
  weekdaysLong: WEEKDAYS_LONG_VI,
  weekdaysShort: WEEKDAYS_SHORT_VI,
};

/** Quy ước Việt Nam: NGÀY/THÁNG/NĂM. Xem `@/shared/utils/format/date.utils`. */
export const DATE_FORMAT_DEFAULT = 'DD/MM/YYYY';

/**
 * Định dạng ô nhập khi chỉ chọn tới THÁNG hoặc tới NĂM.
 *
 * ⚠️ Không dùng chung `DD/MM/YYYY` cho mọi độ chi tiết: chọn "tháng 3/2024" mà
 * ô hiện "01/03/2024" thì người dùng tưởng mình đã chọn NGÀY mùng 1 và đi tìm
 * chỗ đổi ngày.
 */
export const MONTH_FORMAT_DEFAULT = 'MM/YYYY';
export const YEAR_FORMAT_DEFAULT = 'YYYY';

/** Định dạng ô nhập theo độ chi tiết. `Record` chứ không `switch`: thêm một độ
 *  chi tiết mới mà quên ghi vào đây là `tsc` đỏ ngay. */
export const FORMAT_BY_PRECISION: Record<DatePickerPrecision, string> = {
  day: DATE_FORMAT_DEFAULT,
  month: MONTH_FORMAT_DEFAULT,
  year: YEAR_FORMAT_DEFAULT,
  'year-month-day': DATE_FORMAT_DEFAULT,
};

/** Chữ mời trong ô khi chưa chọn gì — cũng là tiêu đề mặc định của tấm trượt. */
export const PLACEHOLDER_BY_PRECISION: Record<DatePickerPrecision, string> = {
  day: 'Chọn ngày',
  month: 'Chọn tháng',
  year: 'Chọn năm',
  'year-month-day': 'Chọn ngày',
};

/**
 * Lưới chọn Năm/Tháng: 3 cột × 4 hàng = 12 ô (Figma `259:97470`).
 *
 * ⚠️ Một thập kỷ chỉ có 10 năm mà lưới có 12 ô — Figma lấp hai ô thừa bằng năm
 * liền TRƯỚC và liền SAU thập kỷ, vẽ màu xám (2019 và 2030 khi đang xem thập kỷ
 * 2020). Nhờ vậy lưới năm và lưới tháng cao bằng nhau, và luồng chọn liên tiếp
 * không bị nhảy chiều cao giữa hai nhịp.
 */
export const UNIT_GRID_SIZE = 12;
export const DECADE_LENGTH = 10;

/** Dấu nối hai đầu khoảng ngày trong ô nhập ("01/09/2026 - 30/09/2026"). */
export const RANGE_SEPARATOR = ' - ';

/**
 * Lưới luôn 6 hàng × 7 cột, kể cả tháng chỉ cần 5 hàng.
 *
 * ⚠️ Số hàng thay đổi thì chiều cao tấm trượt NHẢY mỗi lần bấm mũi tên, và nút
 * "Áp dụng" chạy lên chạy xuống ngay dưới ngón tay người dùng.
 */
export const CALENDAR_ROWS = 6;
export const CALENDAR_COLUMNS = 7;
