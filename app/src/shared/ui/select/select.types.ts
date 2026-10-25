import type { ReactNode } from 'react';

import type { InputTone } from '../input/InputMessage';

/**
 * Tông của dòng thông báo dưới ô chọn — `error` · `hint` · `success`.
 *
 * ⛔ Lấy THẲNG kiểu của nhóm `input` chứ không khai lại ba chuỗi. Khai lại thì
 * ngày `Input` thêm tông thứ tư, ô chọn vẫn đứng ở ba tông cũ và hai component
 * nằm cạnh nhau trong CÙNG một form báo lỗi theo hai bộ quy tắc khác nhau —
 * `tsc` không có cách nào phát hiện, người dùng thì thấy ngay.
 */
export type SelectTone = InputTone;

/**
 * Props của `Select` — ô chọn mở tấm trượt đáy.
 *
 * ⛔ KHÔNG có `options`, và đó là chủ đích: danh sách tỉnh/thành là 63 mục có ô
 * tìm kiếm riêng. Nhồi vào đây là ép MỌI nơi gọi tải cả danh sách chỉ để vẽ một
 * ô cao 56dp. Danh sách đi qua `SelectSheet`, ô này chỉ là cái nút.
 */
export interface SelectProps {
  className?: string;
  /** Khoá ô: `onPress` không chạy nữa, nền chuyển xám như `Input` lúc bị khoá. */
  disabled?: boolean;
  /** Nhãn NGOÀI khung, y hệt `Input`. Bỏ trống thì không dựng hàng nhãn nào. */
  label?: string;
  /** Khe trước chữ (biểu tượng lá cờ, logo ngân hàng). ⛔ Component không tự vẽ. */
  leading?: ReactNode;
  /** Dòng dưới ô: câu lỗi, hoặc chú thích ("Địa chỉ trên hoá đơn"). */
  message?: string;
  /**
   * ⚠️ Mặc định `error` — GIỐNG `Input`, không phải `hint`. Ô chọn hầu như chỉ
   * hiện `message` lúc có lỗi; để mặc định là `hint` thì mọi nơi gọi phải nhớ
   * khai thêm `messageTone="error"`, và quên một lần là câu lỗi hiện ra màu xám
   * kèm biểu tượng ⓘ — người dùng đọc thành lời khuyên chứ không phải lỗi.
   */
  messageTone?: SelectTone;
  /**
   * ⛔ BẮT BUỘC. `Select` KHÔNG tự mở tấm trượt: nơi gọi giữ state `open` và
   * quyết định mở `SelectSheet` nào. Đây chính là thứ `Input` không có
   * (`InputProps` bỏ hết prop chạm vì nó `Omit` từ `TextInputProps`) và là lý do
   * ô chọn phải là component riêng.
   */
  onPress: () => void;
  /** Chữ khi chưa chọn gì — hiện bằng màu placeholder `fg-3`. */
  placeholder?: string;
  /** Thêm dấu `*` đỏ cạnh nhãn và ghép ", bắt buộc" vào nhãn trợ năng. */
  required?: boolean;
  /**
   * Chữ HIỂN THỊ khi đã chọn (tên tỉnh, tên cửa hàng) — ⛔ không phải mã.
   * Bỏ trống hoặc chuỗi rỗng ⇒ ô đang ở trạng thái chưa chọn.
   */
  value?: string;
}

/** Một lựa chọn trong `SelectSheet`. */
export interface SelectOption {
  /** Dòng phụ dưới nhãn — địa chỉ cửa hàng, số tài khoản. */
  description?: string;
  /** Mục vẫn hiện nhưng bấm không ăn (chi nhánh tạm đóng, kỳ hạn hết hạn mức). */
  disabled?: boolean;
  label: string;
  /** Giá trị trả về qua `onChange`. Phải duy nhất — nó là `key` của danh sách. */
  value: string;
}

/**
 * Props của `SelectSheet` — tấm trượt đáy chọn MỘT giá trị.
 *
 * ── Ba luật lấy thẳng từ slide quy định (`193:25636`, `193:25705`) ───────────
 *  1. Chạm nền mờ / nút ✕ / thanh kéo đều tắt tấm.
 *  2. Dữ liệu nhiều thì tấm chạm trần **742px**, ít thì vẫn giữ sàn **229px**.
 *  3. Khi cuộn: phần đầu DÍNH trên (cách nội dung 16), phần đáy DÍNH dưới, chỉ
 *     vùng GIỮA cuộn.
 *
 * ✅ Cả ba đã nằm sẵn trong `BottomSheet` (`SHEET_MAX_HEIGHT_RATIO = 742/812`,
 * `SHEET_MIN_HEIGHT_INFO = 229`, `gap-md` giữa ba khối, `scrollable`).
 * `SelectSheet` KHÔNG dựng lại cái nào — nó chỉ chọn đúng bộ prop.
 *
 * ⚠️ Sàn **229** chứ không phải 200, và nó suy ra từ `padded` chứ không phải
 * khai tay: 200 là sàn của tấm "list thao tác/chức năng" (tràn viền), còn tấm
 * chọn nằm ở nhánh "list thông tin". Frame trong bản vẽ (`365:30369`,
 * `700:27216`) tên đúng là `content BS` — nhánh 229. Khai `padded={false}` như
 * bản trước là kéo theo cả sàn sai lẫn đệm sai.
 */
export interface SelectSheetProps {
  /**
   * Chọn xong thì đóng tấm luôn.
   *
   * ⚠️ Mặc định = "không có `footer`". Bản vẽ có hai nhịp khác nhau: tấm chọn
   * cửa hàng (`365:30369`) không có nút nên bấm một dòng là xong; tấm chọn
   * Tỉnh/Phường (`700:27216`) có nút "Tiếp tục" dính đáy nên phải để người dùng
   * xác nhận. Đóng tấm ngay khi có nút xác nhận là cướp mất nhịp đó.
   */
  closeOnSelect?: boolean;
  /** Câu hiện khi lọc không còn mục nào. */
  emptyMessage?: string;
  /** Vùng nút DÍNH ĐÁY ("Tiếp tục"). Không cuộn theo danh sách. */
  footer?: ReactNode;
  onChange: (value: string) => void;
  onClose: () => void;
  options: readonly SelectOption[];
  /** Bật ô tìm kiếm trong phần đầu tấm (đứng yên, không cuộn theo danh sách). */
  searchable?: boolean;
  searchPlaceholder?: string;
  title: string;
  /** Giá trị đang chọn — dòng tương ứng có nền tint + dấu tick. */
  value?: string;
  visible: boolean;
}
