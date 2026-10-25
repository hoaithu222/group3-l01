/**
 * Kiểu dùng chung cho `Calendar` và `DatePicker`.
 *
 * ── ⛔ Bẫy múi giờ, đọc trước khi đổi bất cứ thứ gì ở đây ────────────────────
 * `new Date('2026-09-08')` bị JavaScript hiểu là **nửa đêm UTC**, tức 07:00
 * ngày 08/09 ở giờ Việt Nam — nhưng `new Date('2026-09-08T00:00')` lại là giờ
 * địa phương. Hai chuỗi gần giống nhau, lệch nhau một múi giờ, và ở phía Tây
 * bán cầu thì lệch hẳn MỘT NGÀY.
 *
 * Vì vậy mọi giá trị vào/ra của bộ lịch này đi qua `dayjs` (`toDay()` trong
 * `date-picker.utils.ts`): dayjs phân giải chuỗi `YYYY-MM-DD` theo giờ ĐỊA
 * PHƯƠNG, và mọi so sánh dùng `isSame(d, 'day')` chứ không so timestamp thô —
 * hai `Date` cùng ngày nhưng khác giờ có timestamp KHÁC NHAU.
 */

/** Đầu vào ngày chấp nhận được. Chuỗi nên ở dạng `YYYY-MM-DD` hoặc ISO đầy đủ. */
export type DateLike = Date | string | number;

/**
 * ⛔ GIỮ NGUYÊN hai giá trị này. Chế độ nói về SỐ giá trị chọn được (một mốc hay
 * một khoảng) và nó quyết định kiểu của `value`/`onChange`; thêm phần tử vào
 * union này là đổi hợp đồng kiểu của mọi nơi đang dùng. Độ chi tiết (ngày /
 * tháng / năm) là chuyện khác và nằm ở `DatePickerPrecision` bên dưới.
 */
export type DatePickerMode = 'single' | 'range';

/**
 * Độ chi tiết của phép chọn — bốn nhóm được ĐÁNH SỐ trong guideline Figma
 * (section "Date Picker" `259:97362`).
 *
 *  · `day`            ① chọn một NGÀY — lưới 6×7 như trước, mặc định.
 *  · `month`          ② lưới 3×4 "Tháng 1"…"Tháng 12", đầu đề là năm.
 *  · `year`           ② lưới 3×4 các năm, đầu đề là thập kỷ "2020 – 2029".
 *  · `year-month-day` ③ ba nhịp liên tiếp trong cùng một tấm trượt.
 *
 * ⚠️ Mọi độ chi tiết đều trả về một `Date` như cũ — `month` trả ngày ĐẦU THÁNG,
 * `year` trả ngày đầu năm. Nhờ vậy thêm cái này KHÔNG đụng gì tới `onChange`.
 * ⛔ Chỉ có nghĩa ở chế độ một giá trị; chọn KHOẢNG thì luôn theo ngày.
 */
export type DatePickerPrecision = 'day' | 'month' | 'year' | 'year-month-day';

/** 0 = Chủ nhật … 6 = Thứ Bảy — trùng quy ước `Date.getDay()`/`Dayjs.day()`. */
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Khoảng ngày. `end` bằng `null` nghĩa là người dùng mới chọn đầu thứ nhất —
 * trạng thái này CÓ THẬT trên giao diện nên nó phải biểu diễn được, không được
 * ép thành `undefined`.
 */
export interface DateRange {
  start: Date | null;
  end: Date | null;
}

/**
 * Bộ tên tháng/thứ. Thay được để dùng ngôn ngữ khác mà không phải đụng vào
 * component — và quan trọng hơn là để KHÔNG phải gọi `Intl` (xem
 * `date-picker.constants.ts`).
 */
export interface CalendarLocale {
  /**
   * Tiêu đề lưới chọn Năm ("2020 – 2029"). ⚠️ Optional để bộ locale viết từ
   * trước vẫn hợp lệ — thiếu thì rơi về `${from} – ${to}`.
   */
  decadeTitle?: (from: number, to: number) => string;
  /** Nhãn một ô của lưới chọn Tháng ("Tháng 1"). Thiếu thì rơi về bản tiếng Việt. */
  monthLabel?: (month: number) => string;
  /** `month` đếm từ 0 như `Dayjs.month()`. */
  monthTitle: (month: number, year: number) => string;
  /** Xếp theo `Dayjs.day()`: phần tử 0 là Chủ nhật. */
  weekdaysLong: readonly string[];
  weekdaysShort: readonly string[];
}

/** Phần props giống nhau ở cả hai chế độ. */
export interface CalendarBaseProps {
  className?: string;
  /** Những ngày không cho chọn dù nằm trong `minDate`–`maxDate` (ngày lễ…). */
  disabledDates?: readonly DateLike[];
  /** Cột đầu tiên của lưới. Mặc định 1 (Thứ Hai) — đúng bản thiết kế. */
  firstDayOfWeek?: WeekdayIndex;
  locale?: CalendarLocale;
  maxDate?: DateLike;
  minDate?: DateLike;
  /**
   * Tiêu đề tháng/năm của lưới có được khai là TIÊU ĐỀ với trình đọc màn hình
   * hay không. Mặc định `true` — lịch đặt trần trên màn hình thì nó là mốc điều
   * hướng duy nhất của khối.
   *
   * ⛔ Đặt `false` khi lịch nằm trong một tấm trượt/hộp thoại ĐÃ có tiêu đề:
   * hai `accessibilityRole="header"` chồng nhau làm TalkBack đếm 2 tiêu đề
   * trong một tấm và nhảy vào "Tháng 9 - 2026" thay vì vào tên trường.
   * `DatePicker` tự truyền `false` — nó luôn dựng lịch trong `BottomSheet`.
   */
  titleAsHeader?: boolean;
}

export interface CalendarSingleProps extends CalendarBaseProps {
  mode?: 'single';
  /** ⚠️ Trả về `Date` lúc NỬA ĐÊM GIỜ ĐỊA PHƯƠNG, không phải nửa đêm UTC. */
  onChange?: (value: Date) => void;
  /** Mặc định `day` ⇒ giữ nguyên hành vi cũ. Xem `DatePickerPrecision`. */
  precision?: DatePickerPrecision;
  value?: DateLike | null;
}

export interface CalendarRangeProps extends CalendarBaseProps {
  mode: 'range';
  /** Gọi ở CẢ hai nhịp: chọn đầu thứ nhất (`end` = null) rồi đầu thứ hai. */
  onChange?: (value: DateRange) => void;
  value?: DateRange | null;
}

/**
 * Union phân biệt bằng `mode` — nhờ nó `onChange` của chế độ `single` nhận
 * `Date` còn của `range` nhận `DateRange`, và gõ nhầm thì `tsc` đỏ ngay chứ
 * không phải đợi tới lúc chạy.
 */
export type CalendarProps = CalendarRangeProps | CalendarSingleProps;

/** Phần props chung của ô nhập ngày. */
export interface DatePickerBaseProps extends CalendarBaseProps {
  /** Khoá ô: không mở được lịch, ô chuyển sang màu mờ. */
  disabled?: boolean;
  /**
   * Câu lỗi. Có mặt là viền ô đỏ theo, và câu lỗi hiện ở HAI chỗ: dưới ô nhập
   * **và** trong tấm trượt ngay trên nút "Áp dụng" — đúng ba màn "Error message"
   * của Figma. Luồng thật là bấm một ngày → luật nghiệp vụ từ chối → báo NGAY
   * tại chỗ, nên chỉ vẽ dưới ô nhập là bắt người dùng đóng lịch mới đọc được.
   */
  error?: string;
  /** Định dạng hiển thị. Mặc định `DD/MM/YYYY` — quy ước Việt Nam. */
  format?: string;
  label?: string;
  placeholder?: string;
  /** Tiêu đề tấm trượt. Mặc định lấy theo `label`. */
  title?: string;
}

export interface DatePickerSingleProps extends DatePickerBaseProps {
  /**
   * Bắt xác nhận bằng nút "Áp dụng" thay vì đóng ngay khi bấm một ngày.
   *
   * Mặc định `false` — Design Note của Figma ghi "Chọn ngày đồng thời close
   * bottom sheet", và bắt bấm thêm một nút nữa là bắt người dùng xác nhận thứ
   * họ vừa nhìn thấy. Nhưng ghi chú ngay trên nhóm ① cũng nói *"Button ÁP DỤNG:
   * optional"*, tức bản vẽ có mẫu cho CẢ HAI.
   *
   * ⚠️ Bật thì ngày chọn nằm trên BẢN NHÁP y như chế độ khoảng: `onChange` chỉ
   * chạy khi bấm "Áp dụng", đóng tấm bằng ✕ hay chạm nền mờ là bỏ hết. Dùng khi
   * chọn sai ngày tốn kém (đặt lịch hẹn, ngày hiệu lực hợp đồng).
   */
  confirm?: boolean;
  mode?: 'single';
  onChange?: (value: Date) => void;
  /**
   * Mặc định `day` ⇒ giữ nguyên hành vi cũ. Đổi sang `month`/`year` thì
   * `format` và `placeholder` mặc định cũng đổi theo (`MM/YYYY`, `YYYY`) —
   * truyền tay thì bản truyền tay thắng.
   */
  precision?: DatePickerPrecision;
  value?: DateLike | null;
}

export interface DatePickerRangeProps extends DatePickerBaseProps {
  mode: 'range';
  /** ⚠️ Chỉ gọi khi người dùng bấm "Áp dụng", tức là khi ĐỦ cả hai đầu. */
  onChange?: (value: DateRange) => void;
  value?: DateRange | null;
}

export type DatePickerProps = DatePickerRangeProps | DatePickerSingleProps;
