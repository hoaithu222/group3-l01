import { Text, View, type AccessibilityActionEvent } from 'react-native';

import { inputStyles } from '../input/input.styles';

import { StepperButton } from './StepperButton';
import { stepperStyles } from './stepper.styles';

/**
 * Hai thao tác mà trình đọc màn hình gọi được trên một điều khiển `adjustable`.
 * ⛔ Tên phải ĐÚNG `increment`/`decrement` — đây là tên hệ điều hành hiểu, không
 * phải chuỗi tự đặt: TalkBack ánh xạ chúng vào cử chỉ vuốt lên/xuống, VoiceOver
 * vào vuốt lên/xuống một ngón. Gõ sai thì cử chỉ không gọi được gì và không có
 * lỗi nào báo.
 */
const ADJUST_ACTIONS = [{ name: 'decrement' }, { name: 'increment' }] as const;

/**
 * ⛔ Chiều cao khối là 56dp CỨNG theo bản vẽ và bề ngang chỉ 126dp. Cỡ chữ hệ
 * thống phóng 2× (Android cho phép) đẩy con số ra khỏi ô và làm khối rộng gần
 * 160dp — hàng "Số lượng" bị xuống dòng giữa form. 1.3 là mức `Chip` đang dùng:
 * còn đọc được rõ, chưa phá bố cục. ⚠️ Chỉ an toàn vì nội dung là CHỮ SỐ —
 * không có dấu tiếng Việt để bị cắt chân.
 */
const MAX_FONT_SCALE = 1.3;

export interface StepperProps {
  /**
   * Nhãn của CẢ KHỐI cho trình đọc màn hình; nhãn hai nút suy ra từ đây ("Giảm
   * số lượng" / "Tăng số lượng"). Mặc định "Số lượng" — đúng trường nghiệp vụ
   * duy nhất dùng khối này trong bản vẽ (màn chi tiết sản phẩm vàng).
   */
  accessibilityLabel?: string;
  className?: string;
  /** Khoá cả khối. Khác với việc chạm biên min/max — lúc đó chỉ MỘT nút khoá. */
  disabled?: boolean;
  /**
   * Cách VIẾT số ra chữ ở giữa khối — mặc định `String(value)`. Cần khi số lẻ phải theo quy ước Việt (dấu PHẨY: điểm chấm bước 0,5 hiện
   * "2,5" chứ không "2.5"). Chỉ đổi cách HIỆN: `value`/`onChange` vẫn là số thật, và chuỗi này cũng vào `accessibilityValue.text` để trình
   * đọc màn hình xướng đúng cái nhìn thấy.
   */
  formatValue?: (value: number) => string;
  /** Bỏ trống = không chặn trên. Nghiệp vụ thường có ("tối đa 10 chỉ/giao dịch"). */
  max?: number;
  min?: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
}

/**
 * Ô tăng/giảm số lượng — `[−] [số] [+]` trong một khung 126×56.
 *
 * Số đo lấy từ Figma "BIDV OMNI MB" (`290:126630`, và 7 bản sao cùng nội dung
 * trên các màn đặt mua). Công thức class: `stepper.styles.ts`; KHUNG dùng lại
 * `inputStyles` của nhóm `input` vì trong Figma đây là một biến thể của chính
 * component `Input`.
 *
 * ── ⚠️ Component KHÔNG tự giữ số ────────────────────────────────────────────
 * `value` là của màn hình. Cho nó tự giữ state là có hai nguồn sự thật, và
 * chúng lệch nhau ngay lần đầu màn hình đặt lại số lượng theo tồn kho trả về từ
 * máy chủ.
 *
 * ── Vì sao `accessibilityRole="adjustable"` chứ không phải hai cái nút ───────
 * Đây là ĐIỀU KHIỂN MỘT GIÁ TRỊ, không phải hai thao tác rời. Với `adjustable`,
 * trình đọc màn hình xướng "Số lượng, 3" và người dùng đổi số bằng cử chỉ vuốt
 * lên/xuống — không phải dò tìm hai ô chạm 26dp nằm cách nhau 42dp, thao tác
 * gần như bất khả thi khi không nhìn thấy màn hình. `accessibilityValue` là chỗ
 * DUY NHẤT nói được "đang ở 3, trong khoảng 1–10", và nó được xướng LẠI sau mỗi
 * lần đổi; nhét vào `accessibilityLabel` thì lần bấm thứ hai không xướng gì.
 *
 * ⚠️ Hai nút bên trong VẪN giữ nhãn và `accessibilityState` riêng: `accessible`
 * ở khung gộp cây con thành một ô trên iOS, nhưng trên Android nút bấm được vẫn
 * nhận được tiêu điểm — bỏ nhãn đi là chúng thành hai ô câm. Đổi lại, khối này
 * hơi "nói nhiều" với TalkBack; đó là đánh đổi có chủ ý, im lặng tệ hơn.
 *
 * @example
 *   const [qty, setQty] = useState(1);
 *   <Stepper max={10} min={1} value={qty} onChange={setQty} />
 */
export function Stepper({
  accessibilityLabel = 'Số lượng',
  className,
  disabled = false,
  formatValue,
  max,
  min = 0,
  step = 1,
  value,
  onChange,
}: StepperProps) {
  const styles = stepperStyles({ disabled });
  // ⛔ Nhập THẲNG file, không qua `@/shared/ui` — barrel tổng tạo import vòng,
  // mà trên React Native vòng hiện ra lúc CHẠY dưới dạng "undefined is not a
  // function" ở một file KHÔNG liên quan tới chỗ sai. ESLint chặn cứng.
  const frame = inputStyles({ state: disabled ? 'disabled' : 'default' });

  const canDecrease = !disabled && value > min;
  const canIncrease = !disabled && (max === undefined || value < max);

  /**
   * ⛔ Kẹp lại thay vì cộng thẳng. `step` không nhất thiết chia hết cho khoảng
   * cách tới biên: `value=3, min=1, step=5` mà cộng thẳng là ra **−2** — số
   * lượng âm đi vào giỏ hàng rồi hỏng ở tận lúc gọi API.
   *
   * ⚠️ Không gọi `onChange` khi giá trị không đổi: mỗi lần gọi là một lượt vẽ
   * lại cả màn chi tiết sản phẩm, và người dùng bấm liên tục vào nút đã chạm
   * biên thì đó là hàng chục lượt vô ích.
   */
  const change = (delta: number) => {
    const next = Math.min(Math.max(value + delta, min), max ?? Number.POSITIVE_INFINITY);
    if (next !== value) onChange(next);
  };

  const handleAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') change(step);
    if (event.nativeEvent.actionName === 'decrement') change(-step);
  };

  return (
    <View
      accessibilityActions={ADJUST_ACTIONS}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="adjustable"
      accessibilityState={{ disabled }}
      // `max` bỏ trống thì khoá này vắng mặt — trình đọc màn hình chỉ xướng giá
      // trị hiện tại thay vì bịa ra một trần không có thật.
      accessibilityValue={{ max, min, now: value, text: formatValue?.(value) }}
      accessible
      className={frame.field({ className: styles.root({ className }) })}
      onAccessibilityAction={handleAction}
    >
      <StepperButton
        className={styles.button()}
        disabled={!canDecrease}
        label={`Giảm ${accessibilityLabel.toLowerCase()}`}
        name="minus"
        onPress={() => change(-step)}
      />

      {/* ⛔ Số PHẢI nằm trong `<Text>` (luật chung của React Native), và
          `numberOfLines={1}` để một số dài không đẩy khung cao thêm một dòng. */}
      <Text className={styles.value()} maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1}>
        {formatValue ? formatValue(value) : value}
      </Text>

      <StepperButton
        className={styles.button()}
        disabled={!canIncrease}
        label={`Tăng ${accessibilityLabel.toLowerCase()}`}
        name="add"
        onPress={() => change(step)}
      />
    </View>
  );
}
