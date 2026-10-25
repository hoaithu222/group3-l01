import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { tv } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Công tắc bật/tắt.
 *
 * Số đo lấy từ Figma (`259:96684`): đường ray 36×20, núm 16dp, đệm 2dp mỗi bên
 * ⇒ núm chạy đúng 16dp; bo tròn hoàn toàn; nhãn 16/24 semibold, mô tả cách nhãn
 * 4dp, cả khối chữ cách công tắc 8dp. ⚠️ Ray KHÔNG có chữ "ON/OFF" bên trong.
 *
 * ── Bốn trạng thái, đọc từ chính bản vẽ ─────────────────────────────────────
 *   tắt        ray trắng + viền `Border/Primary/Medium`, núm màu mực thương hiệu
 *              (Figma vẽ `Primary/Medium`, ở đây kéo lên — xem chú thích `knob`)
 *   bật        ray `Background/Primary/Active`, núm trắng
 *   tắt + khoá ray trắng + viền xám, núm xám
 *   bật + khoá ray xám, núm trắng
 * Tức là ở trạng thái TẮT thì NÚM mới là phần có màu, còn BẬT thì RAY có màu —
 * đảo vai chứ không phải đổi độ đậm. Chép nhầm thì công tắc tắt trông như đang
 * bật ở nửa bên trái.
 */
const toggle = tv(
  {
    slots: {
      /** Lớp nhận chạm. Dáng vẻ nằm ở `root` vì nó phụ thuộc `pressed`. */
      pressable: '',
      root: 'flex-row items-center gap-2',
      content: 'min-w-0 flex-1 gap-1',
      label: 'text-label-lg font-semibold text-fg-1',
      // `fg-2` chứ không phải `fg-3`: đây là chữ NỘI DUNG (giải thích công tắc
      // làm gì), không phải placeholder. `fg-3` đo 2.96:1, dưới ngưỡng đọc.
      description: 'text-label-sm text-fg-2',
      /**
       * Khung ngoài 40×24 bọc ray 36×20 ⇒ đệm 2dp CẢ BỐN phía (`p-0.5`).
       * ⚠️ `py-0.5` (chỉ theo chiều dọc) làm khung rộng 36 thay vì 40: khối chữ
       * bên trái xích lại gần công tắc 4dp so với bản vẽ.
       */
      frame: 'items-center justify-center p-0.5',
      // `flex-row items-center`: lớp `Animated.View` bọc núm chỉ ôm vừa núm và nằm
      // ở mép TRÁI ray, giữa theo chiều dọc. Ray theo cột (`justify-center` trần)
      // thì lớp bọc đó bị kéo giãn hết bề ngang ray, không còn "ôm vừa núm".
      track: 'flex-row items-center rounded-full border-hairline',
      // `mx-px` (1dp) + viền ray 1dp = đệm 2dp mỗi bên đúng bản vẽ. ⚠️ KHÔNG dùng `mx-0.5`:
      // viền ray đã chiếm 1dp bên trong nên đệm thành 3dp bên trái mà chỉ còn 1dp bên phải.
      knob: 'mx-px rounded-full',
    },
    variants: {
      size: {
        sm: { track: 'h-4 w-7', knob: 'h-3 w-3' },
        md: { track: 'h-5 w-9', knob: 'h-4 w-4' },
      },
      value: {
        true: { track: 'border-action-base bg-action-base', knob: 'bg-action-fg' },
        /**
         * ⚠️ Núm lúc TẮT KHÔNG lấy `action-tint-strong` dù Figma vẽ
         * `Primary/Medium`: đó là token NỀN, đo trên ray `bg-1` chỉ được
         * **1.62:1** ở chế độ sáng (#B8D0CE trên #FFFFFF) và **1.52:1** ở chế độ
         * tối (#1E4A41 trên #1E2826) ⇒ công tắc tắt chỉ còn cái ray rỗng, người
         * dùng không thấy núm đang ở phía nào.
         * `fg-brand` cùng họ màu thương hiệu nhưng đảo đúng chiều theo chế độ:
         * **10.96:1** sáng (#00453C trên #FFFFFF) · **8.71:1** tối (#57D9BE
         * trên #1E2826). Luật "một CẶP màu thì đổi phần HÌNH" — `AGENTS.md`.
         */
        false: { track: 'border-border-brand-subtle bg-bg-1', knob: 'bg-fg-brand' },
      },
      disabled: {
        true: { label: 'text-action-disabled-fg', description: 'text-action-disabled-fg' },
      },
      pressed: { true: { root: 'opacity-60' } },
    },
    compoundVariants: [
      {
        disabled: true,
        value: false,
        class: { track: 'border-border-strong bg-bg-1', knob: 'bg-action-disabled-fg' },
      },
      /**
       * ⚠️ Ray khoá dùng `action-disabled-fg` (MỰC khoá) chứ không phải
       * `action-disabled` (NỀN khoá): núm vẫn là màu nền trang theo thiết kế, mà
       * nền khoá quá nhạt thì núm biến mất hẳn trên ray — công tắc khoá ở trạng
       * thái bật trông y hệt lúc tắt.
       */
      {
        disabled: true,
        value: true,
        class: { track: 'border-action-disabled-fg bg-action-disabled-fg', knob: 'bg-bg-1' },
      },
    ],
    defaultVariants: { disabled: false, size: 'md', value: false },
  },
  { twMergeConfig }, // ⛔ BẮT BUỘC — xem docs/rules/styling-nativewind.md.
);

export type ToggleSize = 'md' | 'sm';

/**
 * Quãng chạy của núm = rộng ray − 2×viền (1dp) − rộng núm − 2×lề núm (1dp)
 * = 36 − 2 − 16 − 2 = 16 (cỡ `sm`: 28 − 2 − 12 − 2 = 12).
 * ⚠️ Phải là SỐ, không phải class: nó đi vào `translateX` của Reanimated, mà
 * `useAnimatedStyle` chạy trên luồng UI nên không đọc được className.
 */
const TRAVEL: Record<ToggleSize, number> = { md: 16, sm: 12 };

/** Đủ để mắt thấy núm TRƯỢT, chưa đủ để người dùng phải chờ nó xong. */
const DURATION_MS = 160;

export interface ToggleProps {
  /** Nhãn cho trình đọc màn hình khi công tắc không có `label` nhìn thấy được. */
  accessibilityLabel?: string;
  className?: string;
  /** Dòng phụ dưới nhãn ("Message text" trong Figma). */
  description?: string;
  disabled?: boolean;
  /** Nhãn bên trái. Bỏ trống thì công tắc đứng một mình — nhớ `accessibilityLabel`. */
  label?: string;
  onChange?: (value: boolean) => void;
  size?: ToggleSize;
  /** Đang bật hay tắt. Component KHÔNG tự giữ state — nơi gọi giữ. */
  value: boolean;
}

export function Toggle({
  accessibilityLabel,
  className,
  description,
  disabled = false,
  label,
  onChange,
  size = 'md',
  value,
}: ToggleProps) {
  /**
   * ── Vì sao Reanimated ────────────────────────────────────────────────────
   * `translateX` chạy được cả với `Animated` của React Native, nhưng Reanimated
   * đã có sẵn trong repo và nó ghi thẳng vào luồng UI — núm vẫn trượt mượt kể
   * cả khi luồng JS đang bận. Ca hay gặp: bật công tắc "Nhận thông báo" kích
   * một lượt gọi mạng ngay tại chỗ.
   */
  const knobStyle = useAnimatedStyle(
    () => ({
      transform: [{ translateX: withTiming(value ? TRAVEL[size] : 0, { duration: DURATION_MS }) }],
    }),
    [value, size],
  );

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="switch"
      /** ⚠️ Vai `switch` đọc khoá `checked` (giống checkbox), không phải `selected`. */
      accessibilityState={{ checked: value, disabled }}
      className={toggle().pressable()}
      disabled={disabled}
      /**
       * Ray chỉ cao 20dp. Có nhãn thì cả hàng đã đủ cao, nhưng công tắc đứng một
       * mình thì thiếu hẳn 20dp so với ngưỡng chạm 44dp.
       */
      hitSlop={{ bottom: 12, left: 8, right: 8, top: 12 }}
      onPress={() => onChange?.(!value)}
    >
      {({ pressed }) => {
        const styles = toggle({ disabled, pressed, size, value });

        return (
          <View className={styles.root({ className })}>
            {label || description ? (
              <View className={styles.content()}>
                {label ? <Text className={styles.label()}>{label}</Text> : null}
                {description ? <Text className={styles.description()}>{description}</Text> : null}
              </View>
            ) : null}
            <View className={styles.frame()}>
              <View className={styles.track()}>
                {/*
                  ⛔ `Animated.View` KHÔNG được mang `className`, dù đã `cssInterop`:
                  `knobStyle` là handle của `useAnimatedStyle` (mang khoá
                  `viewDescriptors`). NativeWind gộp class + style thành MỘT object
                  rồi giao cho Reanimated; thấy `viewDescriptors` nó coi cả object là
                  handle và chỉ lấy `initial.value` (`translateX`) — VỨT SẠCH
                  `h-4 w-4 rounded-full bg-*` ⇒ núm 0×0, vô hình ở cả bốn trạng thái,
                  chỉ còn ray (bật = viên tím đặc, tắt = viên trắng). Nên lớp chuyển
                  động chỉ mang `style`, còn hình núm là `View className` lồng trong.
                  Lề núm đặt ở NÚM (`mx-px`), không ở ray (`p-*`).
                */}
                <Animated.View style={knobStyle}>
                  <View className={styles.knob()} />
                </Animated.View>
              </View>
            </View>
          </View>
        );
      }}
    </Pressable>
  );
}
