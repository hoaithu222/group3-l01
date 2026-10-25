import { Text, View } from 'react-native';

import { pinStyles, type PinCellState, type PinVariant } from './pin.styles';

/**
 * Trần hệ số phóng cỡ chữ trong ô.
 *
 * ⚠️ Chiều cao ô là RÀNG BUỘC THIẾT KẾ: 4–8 ô xếp thành MỘT hàng ngang, ô nào
 * cao hơn là cả hàng so le và dáng "dãy ô mã OTP" mất hẳn. Nên ⛔ KHÔNG đổi
 * `h-control-md` sang `min-h-` như `input.styles.ts` — chặn hệ số phóng chữ.
 *
 * Quên là hỏng thật: Android phóng cỡ chữ tới 2× ⇒ chữ số `text-body-lg`
 * (16/24) cao 48dp khít đúng chiều cao ô 48dp, và chân dấu bị viền bo cắt.
 * Trần 1.5 cho 36dp trong ô 48dp — còn 12dp thở, và chữ số vẫn to hơn hẳn mức
 * thường nên người lớn tuổi đọc lại được mã mình vừa gõ.
 */
const MAX_FONT_SCALE = 1.5;

/**
 * Ký tự giữ chỗ của ô chưa điền — dấu gạch ngang `–` (U+2013), đúng bản vẽ.
 *
 * ⛔ Không dùng dấu trừ `-` của bàn phím: nó ngắn hơn hẳn và lệch tâm trong ô,
 * còn `—` (em dash) thì rộng gần bằng cả ô.
 */
const PLACEHOLDER_CHAR = '–';

export interface PinCellProps {
  /** Chữ số đã điền. `undefined` = ô còn trống. */
  char?: string;
  /** Che chữ số bằng chấm tròn. Không có tác dụng với `variant: 'dot'`. */
  secure: boolean;
  state: PinCellState;
  variant: PinVariant;
}

/**
 * Một ô của `PinInput` — thuần HÌNH VẼ, không nhận cú chạm nào.
 *
 * Chữ thật nằm trong `TextInput` trong suốt phủ lên cả hàng (xem `PinInput`),
 * nên ở đây không có state, không có handler. Tách ra khỏi `PinInput.tsx` vì
 * file component phải ≤ 200 dòng và vì hai kiểu hiển thị rẽ nhánh ngay tại đây.
 */
export function PinCell({ char, secure, state, variant }: PinCellProps) {
  const styles = pinStyles({ state });

  // Kiểu chấm tròn: không khung ô, vòng ⌀32 luôn hiện, chấm ⌀16 chỉ khi đã điền.
  if (variant === 'dot') {
    return (
      <View className={styles.ring()}>
        {char === undefined ? null : <View className={styles.ringDot()} />}
      </View>
    );
  }

  // Ô còn trống vẫn PHẢI có gì đó: bản vẽ đặt dấu `–` (hoặc một chấm mờ khi
  // che) vào mọi ô chưa điền — đó là thứ cho biết còn thiếu mấy chữ số.
  if (char === undefined) {
    return (
      <View className={styles.cell()}>
        {secure ? (
          <View className={styles.dotEmpty()} />
        ) : (
          <Text className={styles.placeholder()} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {PLACEHOLDER_CHAR}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View className={styles.cell()}>
      {secure ? (
        <View className={styles.dot()} />
      ) : (
        <Text className={styles.char()} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {char}
        </Text>
      )}
    </View>
  );
}
