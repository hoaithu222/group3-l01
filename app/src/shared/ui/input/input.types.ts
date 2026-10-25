import type { ReactNode } from 'react';
import type { TextInputProps } from 'react-native';

import type { InputVariants } from './input.styles';

/**
 * Kiểu sự kiện của `onFocus`/`onBlur` đổi theo bản React Native (0.86 thay
 * `NativeSyntheticEvent<TextInputFocusEventData>` bằng `FocusEvent`/`BlurEvent`).
 * Lấy thẳng từ chính prop thì lần nâng cấp sau không phải sửa lại chỗ này.
 */
export type FocusHandler = NonNullable<TextInputProps['onFocus']>;
export type BlurHandler = NonNullable<TextInputProps['onBlur']>;

/**
 * Props của `Input`.
 *
 * ⛔ `value` KHÔNG bị bỏ đi và cũng KHÔNG có giá trị mặc định: caller tự quyết
 * controlled hay không. Ô TÌM KIẾM bắt buộc dùng `defaultValue` — `value={search}`
 * ghi đè nội dung ngay giữa lúc bộ gõ Telex đang ghép dấu, và trên Android chữ
 * mất dấu hoặc con trỏ nhảy về đầu (ESLint của repo chặn cứng ca đó).
 *
 * `editable` bị bỏ vì đã có `disabled` (khoá + làm mờ) và `readOnly` (chỉ chặn
 * sửa): để cả ba thì hai nguồn sự thật đánh nhau và ô nhập khoá hay không tuỳ
 * thứ tự prop.
 *
 * ── ⛔ `readOnly` PHẢI vào `accessibilityState` ──────────────────────────────
 * `<Input readOnly value="Nguyễn Văn A" />` mà không khai thì trình đọc màn
 * hình xướng y hệt một ô nhập thường: người dùng chạm, chờ bàn phím, bàn phím
 * không bao giờ lên, và họ kết luận app treo.
 *
 * ⚠️ `AccessibilityState` KHÔNG có khoá `readonly` — `disabled` là khoá DUY
 * NHẤT nói được "ô này không gõ được", nên `Input` gộp `disabled || readOnly`
 * vào đó. Đánh đổi có chủ ý và chỉ ở phần XƯỚNG LÊN: ô chỉ-đọc vẫn chọn và sao
 * chép được, vì nó đi qua `editable={false}` chứ không qua `disabled`. Im lặng
 * còn tệ hơn nhiều.
 *
 * ⚠️ Về THỊ GIÁC thì `readOnly` có hình thức RIÊNG (nền xám, KHÔNG viền, chữ
 * vẫn đen) — đúng hàng "Read only" của Figma; xem trạng thái `readonly` trong
 * `input.styles.ts`. Khác `disabled` ở chỗ chữ KHÔNG bị làm mờ.
 *
 * ── ⚠️ `secureTextEntry` truyền thẳng vào thì KHÔNG có tác dụng ──────────────
 * `Input` đặt `secureTextEntry` SAU spread vì nó phải nối với nút con mắt (prop
 * `secure` + trạng thái đã-hiện/chưa-hiện). Ô mật khẩu dùng `secure`; truyền
 * `secureTextEntry` thẳng sẽ bị ghi đè lặng lẽ.
 *
 * ── Prop bàn phím: TẤT CẢ đều truyền thẳng xuống `TextInput` ─────────────────
 * `keyboardType` · `maxLength` · `returnKeyType` · `autoComplete` ·
 * `textContentType` · `autoCorrect` · `autoCapitalize` — kiểu kế thừa từ
 * `TextInputProps` nên không prop nào bị chặn. Mặc định của component chỉ có 5
 * cái và đều đặt TRƯỚC spread để caller ghi đè được: `autoCapitalize="none"`,
 * `autoCorrect={false}`, `autoComplete`/`textContentType` theo `secure`, và
 * `keyboardType="number-pad"` khi bật `digitsOnly`.
 * ⛔ `returnKeyType` cố ý KHÔNG có mặc định — nó phụ thuộc vị trí của ô trong
 * form ("next" cho ô giữa, "done" cho ô cuối), tức là việc của MÀN HÌNH.
 */
export interface InputProps extends Omit<TextInputProps, 'editable'> {
  /** Nhãn trên ô. Bỏ trống thì cả hàng nhãn không được vẽ. */
  label?: string;
  /**
   * Đặt nhãn (và `hint`) BÊN TRONG khung ô — kiểu "Text area" / "Money Form"
   * của Figma. Khung thành cột và tự cao theo nội dung.
   *
   * Ô ghi chú nhiều dòng: `<Input labelInside multiline label="Ghi chú" />`.
   * Ô số tiền: thêm `inputClassName="text-display font-semibold"` và đặt dòng
   * đọc-thành-chữ vào `message` với `messageTone="hint"`.
   *
   * ⛔ Không phải mặc định: gần hết form của bản vẽ dùng nhãn NGOÀI khung.
   */
  labelInside?: boolean;
  /** Hiện dấu `*` đỏ trước nhãn và thêm "bắt buộc" vào nhãn trình đọc màn hình. */
  required?: boolean;
  /** Chữ nhỏ bên PHẢI nhãn — thường là bộ đếm ký tự ("12/50"). */
  hint?: string;
  /** Dòng chữ dưới ô: lỗi, gợi ý, hoặc xác nhận. */
  message?: string;
  /** `error` (mặc định) tô đỏ luôn viền ô. */
  messageTone?: NonNullable<InputVariants['tone']>;
  /** Nội dung trước ô nhập. Figma dùng biểu tượng 24×24. */
  leading?: ReactNode;
  /** Nội dung sau ô nhập, đứng trước nút hiện/ẩn nếu có `secure`. */
  trailing?: ReactNode;
  /**
   * Hiện nút xoá sạch (×) ở đuôi ô, CHỈ khi ô đang có chữ — biểu tượng
   * `clear-circle` 24dp của bản vẽ, thấy trên mọi ô đã điền của 9 màn "Cập nhật
   * thông tin".
   *
   * Mặc định `false`: ô rỗng thì nút không có chỗ, còn ô đã điền mà mọc thêm
   * một biểu tượng bấm được là thêm một thứ để người dùng phải hiểu — chỉ bật ở
   * ô mà "gõ lại từ đầu" là việc hay xảy ra (tìm kiếm, số tài khoản, mã giới
   * thiệu), đừng bật cả form.
   *
   * ⚠️ Nút xoá KHÔNG đẩy `trailing` đi: hai thứ đứng cạnh nhau, `trailing`
   * trước. Ô số tiền vẫn giữ được chữ "VND" của mình.
   *
   * ⚠️ Ô CONTROLLED (`FormInput`, hoặc tự truyền `value`) thì nút xoá gọi
   * `onChangeText('')` và chờ nơi gọi cập nhật `value` — ⛔ bỏ `onChangeText`
   * đi thì bấm × không xoá được gì. Ô UNCONTROLLED (`defaultValue`) thì nó xoá
   * thẳng xuống native nên không cần state nào ở nơi gọi.
   *
   * ⛔ Ô `disabled` / `readOnly` không bao giờ hiện nút này — xem `use-input-clear.ts`.
   */
  clearable?: boolean;
  /**
   * Nhãn trợ năng của nút xoá. Mặc định "Xoá nội dung".
   *
   * ⚠️ Form nhiều ô thì nên nói rõ xoá cái gì ("Xoá số điện thoại"): trình đọc
   * màn hình xướng nút tách rời khỏi nhãn của ô, nên 9 nút cùng tên "Xoá nội
   * dung" là 9 lựa chọn không phân biệt được.
   */
  clearLabel?: string;
  /** Che nội dung và hiện nút con mắt để xem/ẩn. */
  secure?: boolean;
  size?: NonNullable<InputVariants['size']>;
  /** Khoá và LÀM MỜ ô (chữ xám). Khác `readOnly`: `readOnly` giữ chữ đen. */
  disabled?: boolean;
  /**
   * Chặn sửa nhưng vẫn cho chọn/sao chép, và có hình thức riêng của Figma:
   * nền xám, KHÔNG viền, chữ vẫn ĐEN.
   *
   * Dùng cho dữ liệu ĐÚNG mà người dùng cần đọc để đối chiếu — số tài khoản,
   * tên chủ thẻ, phí đã tính sẵn. ⛔ Đừng dùng `disabled` cho mấy ô đó: chữ mờ
   * đi thì công dụng duy nhất của ô (cho người ta ĐỌC) cũng mất theo.
   */
  readOnly?: boolean;
  /**
   * Chỉ giữ chữ số trong `onChangeText`.
   *
   * ⚠️ Bắt buộc bật cho ô số tiền / số điện thoại. `keyboardType="numeric"`
   * KHÔNG đủ: bàn phím số của Android vẫn có dấu chấm, phẩy và dấu trừ, người
   * dùng gõ "1.000" và giá trị gửi lên máy chủ thành rác.
   *
   * ── ⛔ Chỉ lọc GIÁ TRỊ GỬI RA, không lọc chữ trên màn hình ──────────────────
   * `Input` cố ý không nhận `value` (xem mục "Vì sao KHÔNG có `value`" ở đầu
   * file), nên với ô UNCONTROLLED không có đường nào ghi ngược nội dung đã lọc
   * xuống `TextInput`: người dùng gõ "1.000" thì ô vẫn HIỆN "1.000" trong khi
   * `onChangeText` nhận "1000". Muốn chữ trên màn hình cũng sạch thì ô phải
   * controlled — tức là dùng `FormInput`, nơi `value` do `react-hook-form` giữ
   * và được ghi lại sau mỗi lần lọc.
   */
  digitsOnly?: boolean;
  /** Class cho khối ngoài cùng — chủ yếu để chỉnh chiều rộng / lề. */
  className?: string;
  /** Class cho riêng `TextInput` bên trong. */
  inputClassName?: string;
}
