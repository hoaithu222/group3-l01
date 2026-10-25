import { type ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tv } from 'tailwind-variants';

import { cn, twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Vùng nút cố định ở đáy màn hình — KHÔNG phải thanh tab.
 *
 * Dùng cho những màn "đọc rồi bấm": điều khoản, xác nhận giao dịch, ký hợp
 * đồng. Nội dung phía trên cuộn, còn nút thì luôn nhìn thấy. Xem `259:97515`
 * của Figma: vùng đáy 229 = 132 (ô đồng ý điều khoản) + 97 (nút + vùng an toàn).
 *
 * ── Vùng an toàn đáy: component NÀY chịu trách nhiệm ────────────────────────
 * Nó tự cộng `Math.max(insets.bottom, 16)`, và `<Screen footer={…}>` cố tình
 * KHÔNG đệm thêm. Chọn ở đây chứ không phải ở `Screen` vì thanh này còn được
 * dùng ĐỘC LẬP — bọc trong `KeyboardStickyView`, hoặc đặt thẳng vào một màn
 * không dùng `Screen` — nên nó không thể trông chờ ai khác chừa chỗ hộ.
 * ⛔ Cộng ở cả hai nơi là **68dp** trống dưới nút trên iPhone (bản vẽ: 16 + 21).
 *
 * ── Vì sao tách khỏi `BottomNav` ─────────────────────────────────────────────
 * Trong Figma cả hai đều tên "Bottom nav" nhưng khác hẳn về vai trò: `BottomNav`
 * là điều hướng (chọn qua lại, có trạng thái đang chọn), còn cái này là HÀNH
 * ĐỘNG của một màn hình. Gộp chung thì trợ năng sai ngay: `role="tablist"` cho
 * một cái nút "Xác nhận" khiến trình đọc màn hình đọc nó thành một tab.
 *
 * ── Bàn phím: ⛔ đừng tự dựng lại ────────────────────────────────────────────
 * Khi bàn phím mở, vùng này phải nhảy lên trên bàn phím — nếu không nó nằm KHUẤT
 * phía sau và người dùng gõ xong không tìm thấy nút gửi.
 *
 * Repo đã cài `react-native-keyboard-controller` (`KeyboardProvider` bọc sẵn ở
 * `AppProviders`). Nơi dùng bọc thêm một lớp — ⛔ ĐỪNG viết cứng
 * `offset={{ closed: 0, opened: 0 }}`, dùng `useScreenFooterKeyboardOffset()`
 * (`@/shared/ui/screen`): màn nằm trong `<Tabs>` mà thiếu bù thì nút nổi lơ
 * lửng cách bàn phím đúng một thanh tab, lộ nội dung phía sau — xem JSDoc của
 * hook đó (cùng lớp lỗi và cách bù với `ComposerKeyboardLift` của chat):
 *
 * ```tsx
 * import { KeyboardStickyView } from 'react-native-keyboard-controller';
 * import { useScreenFooterKeyboardOffset } from '@/shared/ui/screen';
 *
 * const footerKeyboardOffset = useScreenFooterKeyboardOffset();
 * <KeyboardStickyView offset={footerKeyboardOffset}>
 *   <BottomActionBar>
 *     <Button label="Xác nhận" fullWidth onPress={submit} />
 *   </BottomActionBar>
 * </KeyboardStickyView>;
 * ```
 *
 * Màn hình có nhiều ô nhập thì dùng `KeyboardAwareScrollView` cho phần thân —
 * xem `src/features/auth/components/AuthScreenLayout.tsx`.
 *
 * ⚠️ ⛔ ĐỪNG nhầm với `KeyboardBar` (`@/shared/ui`). Hai thứ khác vai:
 *  · `BottomActionBar` — hành động CHÍNH của màn ("Xác nhận", "Tiếp tục"), cao
 *    theo nút, có vùng an toàn đáy, sống cả khi bàn phím đóng.
 *  · `KeyboardBar` — thanh phụ mỏng 48dp chỉ xuất hiện KHI bàn phím mở, mang nút
 *    "Xong" để đóng bàn phím, và ⛔ không có vùng an toàn đáy.
 * Cần cả hai thì `KeyboardBar` nằm TRÊN, sát bàn phím; ⛔ đừng nhét nút "Xác
 * nhận" vào `KeyboardBar` — nó biến mất ngay khi người dùng đóng bàn phím.
 *
 * ⛔ KHÔNG dùng `KeyboardAvoidingView` của React Native: `behavior` đúng trên
 * iOS thì sai trên Android và ngược lại, không giá trị nào đúng cả hai.
 */
const bottomActionBar = tv(
  {
    slots: {
      // Figma đổ nền TRÙNG màu nền màn hình rồi làm mờ hậu cảnh (backdrop blur).
      // React Native không có backdrop blur nên dùng nền đặc: nội dung cuộn phía
      // sau vẫn bị che kín, đúng ý thiết kế.
      root: 'bg-bg-base',
      /**
       * `px-md pt-sm` = padding 16 / 12 của Figma. `gap-xs` cho ca hai nút xếp dọc.
       *
       * ⚠️ Khe 8, không phải 12. Suy từ chiều cao tổng của `Type=2 buttons-vertical`
       * (**153**): `12 (pt) + 48 + X + 48 + 16 + 21 (vùng an toàn) = 153` ⇒ X = 8.
       * (Số này suy từ chiều cao khung chứ chưa đọc thẳng `itemSpacing` của
       * `259:95594` — nếu ai mở lại được Figma thì xác nhận giúp.)
       *
       * ── Trần bề rộng từ máy tính bảng ──────────────────────────────────────
       * ⛔ Nút "Xác nhận" KHÔNG được kéo hết bề ngang máy tính bảng: trên màn
       * 1000dp thì mép phải của nút nằm cách ngón cái cả gang tay, và một nút
       * dài 1000dp cũng không còn đọc ra là một nút. Kẹp `max-w-content` (720dp)
       * rồi canh giữa — cùng token với trần nội dung của `Screen` nên hàng nút
       * thẳng cột với nội dung nó đang xác nhận.
       *
       * ⚠️ Trần đặt ở `content`, ⛔ KHÔNG ở `root`: `root` là lớp đổ nền đặc che
       * nội dung cuộn phía sau. Kẹp `root` thì hai bên hở ra và chữ chạy lên
       * ngay cạnh nút.
       *
       * ⚠️ Hệ quả: prop `className` (đi vào `root`) KHÔNG đè được trần này —
       * đường đè là prop `contentClassName`.
       */
      content: 'gap-xs px-md pt-sm tablet:w-full tablet:max-w-content tablet:self-center',
    },
    variants: {
      divider: {
        true: { root: 'border-t border-divider-1' },
      },
    },
    defaultVariants: { divider: false },
  },
  { twMergeConfig },
);

/**
 * Đệm đáy tối thiểu khi máy KHÔNG có vạch gạt ngang (`insets.bottom` = 0, hay
 * gặp trên Android ba nút). Không có nó thì nút dính sát mép dưới màn hình.
 */
const MIN_BOTTOM_PADDING = 16;

export function BottomActionBar({
  children,
  className,
  contentClassName,
  divider = false,
}: {
  /** Thường là 1–2 nút. Nhiều hơn thì người dùng phải đọc rồi mới bấm được — cân nhắc lại luồng. */
  children: ReactNode;
  /** Lớp cho lớp GỐC — nền đặc, viền trên, vùng an toàn. ⛔ Không đè được trần bề rộng. */
  className?: string;
  /**
   * Lớp cho HÀNG nút (`content`) — đúng node giữ trần 720dp
   * `tablet:max-w-content`, nên `contentClassName="tablet:max-w-none"` đè
   * được thật.
   *
   * ⛔ Trước đây chỉ có `className`, mà nó đi vào `root`: truyền
   * `tablet:max-w-none` vào đó là im lặng không có tác dụng nào. Dùng cho màn
   * đi cùng `<Screen constrained={false}>` để hàng nút thẳng cột với nội dung.
   */
  contentClassName?: string;
  /** Kẻ một đường trên đỉnh. Bật khi nội dung phía trên cuộn sát vào thanh này. */
  divider?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const styles = bottomActionBar({ divider });

  return (
    <View
      className={cn(styles.root(), className)}
      /**
       * ⛔ Vùng an toàn đủ BA chiều, không phải tuỳ chọn.
       *
       * `bottom` — vạch gạt ngang của iPhone đè lên đáy màn. Không chừa chỗ thì
       * nút "Xác nhận" nằm ngay dưới vạch, hệ điều hành nuốt cú chạm để làm cử
       * chỉ vuốt về màn chính; người dùng bấm mãi không được và tưởng app treo.
       *
       * `left`/`right` — cùng chuyện đó khi XOAY NGANG: tai thỏ nhảy sang mép
       * bên và ăn mất một đầu của nút. Đặt ở `root` (không ở `content`) để nền
       * đặc vẫn che hết bề ngang, còn `px-md` của `content` nằm gọn bên trong.
       */
      style={{
        paddingBottom: Math.max(insets.bottom, MIN_BOTTOM_PADDING),
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <View className={styles.content({ className: contentClassName })}>{children}</View>
    </View>
  );
}
