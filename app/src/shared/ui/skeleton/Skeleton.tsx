import { useMemo } from 'react';
import { type DimensionValue, type ViewStyle } from 'react-native';
import { cssInterop } from 'nativewind';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';
import { tv, type VariantProps } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

import { useSkeletonPulse } from './useSkeletonPulse';

/**
 * Khối nguyên thuỷ của khung xương lúc tải. MỌI khối ghép sẵn
 * (`SkeletonParagraph`, `SkeletonBottomBarItem`…) đều dựng từ component này —
 * đổi màu hay nhịp thở ở đây là cả bộ đổi theo.
 *
 * Số đo lấy từ Figma "BIDV OMNI MB → Skeleton → Element":
 *   · `rect`   48×48, bo 16  (ô "Image" — ảnh vuông bo góc)
 *   · `circle` 40×40, bo tròn (ô "Icon")
 *   · `text`   cao 12, bo tròn hết (thanh chữ)
 *   · `card`   cao 130, bo 24 (khối nội dung lớn, rộng hết bề ngang)
 */
const skeleton = tv(
  {
    // Figma tô khối skeleton bằng biến `background/support/bgskeleton`. ⛔ Không
    // chép mã hex: repo có token đúng VAI TRÒ đó — `bg-skeleton`, đã đảo sẵn theo
    // chế độ (sáng: xám nhạt, tối: xám đậm hơn nền thẻ đúng một bậc, đủ thấy mà
    // không chói). `bg-3` cũ là "nền chìm" dùng chung với ô nhập nên đổi nền ô
    // nhập là khung xương đổi theo, dù hai thứ chẳng liên quan gì nhau.
    //
    // ⛔ `bg-bg-skeleton` KHÔNG phải lỗi gõ: tiện ích nền là `bg-` + TÊN MÀU, mà
    // tên màu ở đây vốn đã bắt đầu bằng `bg-`. Viết gọn thành `bg-skeleton` là đòi
    // một màu tên `skeleton` — không tồn tại, và NativeWind bỏ qua class lạ ÂM
    // THẦM: khối khung xương trong suốt, không lỗi nào báo.
    base: 'bg-bg-skeleton',
    variants: {
      variant: {
        text: 'h-sm w-full rounded-full',
        circle: 'h-4xl w-4xl rounded-full',
        rect: 'h-5xl w-5xl rounded-sm',
        card: 'h-[130px] w-full rounded-md',
      },
    },
    defaultVariants: { variant: 'text' },
  },
  { twMergeConfig },
);

/**
 * ⛔ BẮT BUỘC phải đăng ký, không phải bước thừa.
 *
 * NativeWind chỉ dạy `className` cho danh sách component của React Native
 * (`View`, `Text`, `Pressable`…). `Animated.View` của Reanimated KHÔNG nằm
 * trong danh sách: viết `<Animated.View className="bg-bg-skeleton" />` thì prop bị
 * bỏ qua ÂM THẦM — không lỗi, không cảnh báo, chỉ là khối skeleton trong suốt.
 */
const AnimatedView = cssInterop(Animated.View, { className: 'style' });

export interface SkeletonProps extends VariantProps<typeof skeleton> {
  /**
   * ⛔ Truyền `false` trong test và khi chụp ảnh màn hình. Hoạt ảnh lặp vô hạn
   * làm `jest` không bao giờ kết thúc (bộ đếm luôn còn việc), và ảnh chụp bắt
   * được độ mờ ở một thời điểm ngẫu nhiên nên ảnh so sánh không bao giờ khớp.
   */
  animated?: boolean;
  className?: string;
  /** Đè chiều cao của biến thể. Nhận số (dp) hoặc chuỗi phần trăm. */
  height?: DimensionValue;
  /**
   * Đè bo góc, tính bằng **dp thô** — `borderRadius` không nhận className.
   *
   * ⚠️ Đừng gõ số tại chỗ (`radius={8}`): thang bo góc của thiết kế nằm ở
   * `RADIUS` của `@/shared/theme` (`3xs` 4 · `2xs` 8 · `xs` 12 · `sm` 16 ·
   * `md` 24 · `lg` 32), và số gõ tay là chỗ duy nhất trong bộ khung xương KHÔNG
   * đổi theo khi thiết kế đổi thang. Viết `radius={RADIUS['2xs']}`.
   * Bỏ trống thì lấy theo biến thể.
   */
  radius?: number;
  /** Đè bề rộng của biến thể. Nhận số (dp) hoặc chuỗi phần trăm. */
  width?: DimensionValue;
}

export function Skeleton({
  animated = true,
  className,
  height,
  radius,
  variant = 'text',
  width,
}: SkeletonProps) {
  const opacity = useSkeletonPulse(animated);

  /**
   * ⚠️ Chỉ đưa vào những khoá THẬT SỰ được truyền.
   *
   * NativeWind gộp style của `className` với prop `style` bằng `Object.assign`,
   * và prop `style` thắng. Nên một khoá mang giá trị `undefined` không phải là
   * "không đè" — nó XOÁ giá trị mà class vừa đặt. Viết thẳng
   * `{ width, height, borderRadius: radius }` là khối mất luôn kích thước của
   * biến thể ngay khi người gọi không truyền gì.
   */
  const style = useMemo<AnimatedStyle<ViewStyle>>(
    () => ({
      opacity,
      ...(height === undefined ? null : { height }),
      ...(radius === undefined ? null : { borderRadius: radius }),
      ...(width === undefined ? null : { width }),
    }),
    [height, opacity, radius, width],
  );

  return (
    <AnimatedView
      /**
       * ⛔ Hai prop này đi CÙNG NHAU và không được thiếu cái nào —
       * `accessibilityElementsHidden` là của iOS, `importantForAccessibility`
       * là của Android. Khung xương là hình trang trí thuần: thiếu chúng thì
       * VoiceOver/TalkBack đọc ra hàng chục ô trống vô nghĩa, và người dùng
       * khiếm thị phải vuốt qua hết mới tới được nội dung thật.
       */
      accessibilityElementsHidden
      className={skeleton({ variant, className })}
      importantForAccessibility="no-hide-descendants"
      style={style}
    />
  );
}
