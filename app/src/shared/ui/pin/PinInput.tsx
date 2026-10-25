import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';

import { PinCell } from './PinCell';
import { pinStyles, type PinCellState, type PinVariant } from './pin.styles';

/** Độ dài mặc định — bản thiết kế vẽ 4 và 6 ô; mã OTP của ngân hàng là 6. */
const DEFAULT_LENGTH = 6;

export interface PinInputProps {
  /** Chạm tự động vào ô ngay khi màn hình mở (màn nhập OTP nên bật). */
  autoFocus?: boolean;
  className?: string;
  disabled?: boolean;
  /** `true` để tô đỏ, hoặc chuỗi để tô đỏ KÈM dòng chữ lỗi dưới hàng ô. */
  error?: boolean | string;
  /** Nhãn cho trình đọc màn hình. Mặc định: "Mã gồm N chữ số". */
  label?: string;
  /** Số ô. Mặc định 6 theo mã OTP; bản thiết kế còn vẽ bản 4 ô. */
  length?: number;
  /**
   * Che chữ số bằng chấm tròn.
   *
   * ⛔ Màn hình nhập mã PIN PHẢI bật. Mặc định `false` vì ca dùng nhiều nhất là
   * OTP: mã đọc từ tin nhắn, che đi thì người dùng không đối chiếu được và phải
   * xoá hết gõ lại từ đầu.
   */
  secure?: boolean;
  /** Có truyền thì ô chạy controlled (dùng khi cần `reset` từ bên ngoài). */
  value?: string;
  /**
   * Kiểu hiển thị.
   *
   * `box` (mặc định) — hàng ô vuông 40×48, dùng cho OTP / mã xác thực.
   * `dot` — hàng chấm tròn ⌀32 không khung ô, kiểu của màn **nhập PIN đăng
   *   nhập** (bàn phím số riêng nằm ngay dưới, không có gì để đọc lại nên
   *   không cần ô vuông hiện chữ).
   *
   * ⚠️ Kiểu `dot` luôn che chữ số, `secure` không còn ý nghĩa với nó.
   */
  variant?: PinVariant;
  onChange?: (value: string) => void;
  /** Gọi ĐÚNG MỘT LẦN khi ô cuối vừa được điền. */
  onComplete?: (value: string) => void;
}

/**
 * Ô nhập mã PIN/OTP — một dãy ô, mỗi ô một chữ số.
 *
 * Hai kiểu hiển thị (`variant`): `box` là hàng ô vuông 40×48 cho OTP, `dot` là
 * hàng chấm tròn ⌀32 cho màn nhập PIN đăng nhập.
 *
 * ── Vì sao MỘT `TextInput` trong suốt phủ lên, không phải N ô nhập ──────────
 * Cách "mỗi ô một `TextInput` rồi tự chuyển focus" là cái bẫy kinh điển trên
 * Android: phím xoá lùi KHÔNG bắn `onChangeText` khi ô đang rỗng, nên người
 * dùng xoá tới ô trước là kẹt; dán mã 6 số từ tin nhắn thì chỉ ô đầu nhận; và
 * bàn phím chớp tắt mỗi lần focus nhảy sang ô kế.
 *
 * Ở đây các ô chỉ là hình vẽ, còn chữ nằm trong một ô nhập duy nhất phủ trong
 * suốt lên trên. Nhờ vậy xoá lùi, dán, và tự điền OTP từ tin nhắn đều chạy
 * đúng như với một ô nhập bình thường, vì nó ĐANG là một ô nhập bình thường.
 *
 * @example
 *   <PinInput autoFocus error={wrong && 'Mã không đúng'} onComplete={verify} />
 *   <PinInput length={6} variant="dot" onComplete={unlock} />   // màn nhập PIN
 */
export function PinInput({
  autoFocus = false,
  className,
  disabled = false,
  error,
  label,
  length = DEFAULT_LENGTH,
  secure = false,
  value,
  variant = 'box',
  onChange,
  onComplete,
}: PinInputProps) {
  const [internalValue, setInternalValue] = useState('');
  const [focused, setFocused] = useState(false);

  // Có `value` từ ngoài thì nghe theo, không thì tự giữ lấy. Trộn hai nguồn là
  // cách nhanh nhất để có một ô nhập lúc nhận lúc không nhận phím.
  const code = value ?? internalValue;
  const hasError = error !== undefined && error !== false;
  const message = typeof error === 'string' ? error : undefined;

  const handleChangeText = (text: string) => {
    if (disabled) return;

    /**
     * ⚠️ Lọc lại chữ số ở đây là BẮT BUỘC, không thừa: trên Android bàn phím
     * `number-pad` VẪN có dấu chấm, phẩy và dấu trừ, mà dán từ tin nhắn thì
     * còn kéo theo cả dấu cách. Không lọc thì một ô hiện dấu "," và mã gửi lên
     * máy chủ sai mà không có lỗi nào báo.
     */
    const next = text.replace(/\D+/g, '').slice(0, length);
    if (next === code) return;

    if (value === undefined) setInternalValue(next);
    onChange?.(next);

    // Bắn ngay trong handler chứ không qua `useEffect`: effect chạy sau lượt vẽ
    // kế, và ở ca "dán mã rồi màn hình đóng ngay" thì effect không kịp chạy.
    if (next.length === length) onComplete?.(next);
  };

  const activeIndex = Math.min(code.length, length - 1);
  const styles = pinStyles();

  const resolveState = (index: number): PinCellState => {
    if (disabled) return 'disabled';
    if (hasError) return 'error';
    return focused && index === activeIndex ? 'active' : 'default';
  };

  return (
    <View className={styles.root({ className })}>
      <View className={styles.field()}>
        {/* Các ô chỉ là HÌNH VẼ. Ẩn khỏi trình đọc màn hình, nếu không người
            dùng khiếm thị nghe sáu ô trống rỗng trước khi tới được ô nhập. */}
        <View
          accessibilityElementsHidden
          className={styles.row()}
          importantForAccessibility="no-hide-descendants"
        >
          {Array.from({ length }, (_, index) => (
            <PinCell
              key={index}
              char={code[index]}
              secure={secure}
              state={resolveState(index)}
              variant={variant}
            />
          ))}
        </View>

        <TextInput
          accessibilityLabel={label ?? `Mã gồm ${length} chữ số`}
          accessibilityState={{ disabled }}
          /**
           * ⛔ `autoComplete`/`textContentType` quên là hỏng thật: thiếu chúng
           * thì mã OTP vừa về trong tin nhắn KHÔNG hiện lên bàn phím dưới dạng
           * gợi ý một chạm, và người dùng phải thoát ra đọc tin nhắn rồi quay
           * lại gõ tay 6 chữ số — đúng lúc mã sắp hết hạn.
           *
           * ⚠️ Kiểu `dot` thì TẮT: đó là màn nhập PIN đăng nhập, mã KHÔNG đến
           * từ tin nhắn. Để `sms-otp` ở đó thì hệ điều hành chào điền một mã
           * OTP vừa nhận vào ô PIN — sai mã, và người dùng tưởng PIN của mình
           * hỏng. (Chỉ áp cho kiểu mới, ô OTP hiện có không đổi hành vi.)
           */
          autoComplete={variant === 'dot' ? 'off' : 'sms-otp'}
          autoFocus={autoFocus}
          /**
           * ⛔ `caretHidden`: con trỏ vẫn nháy ở mép trái dù ô trong suốt, và
           * trên vài máy Android nó lộ ra thành một vạch đen giữa hàng ô. Vị
           * trí đang nhập đã được báo bằng viền của ô `active`.
           */
          caretHidden
          className={styles.input()}
          editable={!disabled}
          keyboardType="number-pad"
          maxLength={length}
          /**
           * ⛔ KHÔNG dùng `secureTextEntry`: trên Android nó vô hiệu hoá bàn
           * phím số ở vài bộ gõ và chặn luôn tự điền OTP. Việc che đã do lớp
           * hình vẽ lo (`secure` → chấm tròn), an toàn tương đương vì chữ trong
           * ô nhập này vốn đã trong suốt.
           */
          textContentType="oneTimeCode"
          /**
           * ⚠️ Ô nhập CONTROLLED — ngoại lệ có chủ đích so với luật "ô nhập
           * phải uncontrolled" của repo. Luật đó sinh ra vì `value` ghi đè lại
           * ô ngay giữa lúc bộ gõ Telex ghép dấu; ô này chỉ nhận CHỮ SỐ nên
           * không có phép ghép nào để phá, và `value` là thứ duy nhất cho phép
           * màn hình xoá sạch mã sau một lần xác thực sai.
           */
          value={code}
          onBlur={() => setFocused(false)}
          onChangeText={handleChangeText}
          onFocus={() => setFocused(true)}
        />
      </View>

      {message === undefined ? null : (
        <View className={styles.messageRow()}>
          <Icon color="error" name="alert-warning" size="xs" />
          <Text accessibilityRole="alert" className={styles.message()}>
            {message}
          </Text>
        </View>
      )}
    </View>
  );
}
