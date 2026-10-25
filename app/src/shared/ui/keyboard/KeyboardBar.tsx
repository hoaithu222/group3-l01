import { type ReactNode } from 'react';
import { Keyboard, View } from 'react-native';
import { KeyboardStickyView, useKeyboardState } from 'react-native-keyboard-controller';

import { cn } from '@/shared/utils/style/cn';

import { Button } from '../button/Button';

/**
 * Mặc định của nút phải. Bản vẽ dùng đúng hai chữ này ("Xong") ở thanh bàn phím
 * số; thanh nhập tên người nhận dùng "Kiểm tra" — nên nhãn phải đổi được.
 */
const DONE_LABEL_DEFAULT = 'Xong';

/** Tách ra ngoài để `onPress` không đổi identity mỗi lần vẽ lại. */
const dismissKeyboard = () => Keyboard.dismiss();

export interface KeyboardBarProps {
  /** Lớp cho HÀNG nút — nền, viền trên, đệm. */
  className?: string;
  /** Nhãn nút phải. Mặc định `Xong`. Bản vẽ còn dùng "Kiểm tra". */
  doneLabel?: string;
  /**
   * Nội dung bên TRÁI: hàng chip mệnh giá (`1,000 · 10,000 · 100,000`), gợi ý
   * tên người nhận, hay dấu hiệu "SmartBanking" — cả ba đều có trong bản vẽ.
   *
   * ⚠️ Khe này bị KẸP (`flex-1` + `overflow-hidden`) để nút phải không bao giờ
   * bị đẩy ra khỏi màn. Nội dung dài hơn thì nơi gọi tự bọc một
   * `<ScrollView horizontal>` — đúng như bản vẽ vẽ (chip cuối cùng bị cắt ngang
   * ở mép phải, `822:32227`).
   */
  leading?: ReactNode;
  /** Bấm nút phải. Mặc định: đóng bàn phím. */
  onDone?: () => void;
  /**
   * Ép hiện/ẩn. Bỏ trống ⇒ **bám theo bàn phím** (chỉ hiện khi bàn phím mở).
   *
   * ⛔ Đừng ép `visible` để "xem cho dễ": thanh này không chừa vùng an toàn đáy
   * (xem chú thích ở thân component), nên khi bàn phím đóng mà vẫn hiện thì nó
   * nằm đè lên vạch gạt ngang của iPhone và hệ điều hành nuốt cú chạm vào nút.
   * Cần một hàng nút cố định ở đáy màn thì thứ đúng là `BottomActionBar`.
   */
  visible?: boolean;
}

/**
 * Thanh phụ nằm TRÊN bàn phím — khối `Keyboard` của section `iOS` (`259:93875`),
 * và `Accessory Bar` `822:32227` trong màn Chatbot `822:32211`.
 *
 * ```tsx
 * <KeyboardBar
 *   leading={
 *     <ScrollView horizontal keyboardShouldPersistTaps="handled">
 *       {AMOUNTS.map((amount) => (
 *         <Chip key={amount} label={amount} onPress={() => fill(amount)} />
 *       ))}
 *     </ScrollView>
 *   }
 * />
 * ```
 *
 * ── ⛔ Vì sao KHÔNG dùng `InputAccessoryView` của React Native ───────────────
 * Nó **chỉ tồn tại trên iOS** — trên Android component đó không dựng gì cả, im
 * lặng. Repo này tên là `base-android`; dựng một thanh chỉ sống trên một nền
 * tảng rồi hẹn "làm Android sau" là để lại đúng loại lỗ hổng mà không có lỗi
 * nào báo. `KeyboardStickyView` của `react-native-keyboard-controller` (đã cài
 * sẵn, `KeyboardProvider` bọc ở `AppProviders`) đo bàn phím ở tầng native nên
 * chạy giống nhau cả hai bên — cùng lý do `docs/rules/mobile-ux.md` chọn
 * `KeyboardAwareScrollView` thay cho `KeyboardAvoidingView`.
 *
 * ── ⛔ Vì sao KHÔNG dùng `KeyboardToolbar` có sẵn của chính thư viện ─────────
 * Nó mang theo bảng màu RIÊNG (`DefaultKeyboardToolbarTheme`, mã hex cứng
 * `#2c2c2c`/`#f3f3f4`) không đi theo hệ token, và dựng sẵn cặp mũi tên
 * `Prev`/`Next` mà bản vẽ của ngân hàng không có. Dùng nó là nhận một hòn đảo
 * màu không đổi theo chế độ sáng/tối ngay giữa màn hình.
 *
 * ── ⚠️ Vùng an toàn: thanh này CỐ TÌNH không cộng `insets.bottom` ────────────
 * Nó nằm TRÊN bàn phím, mà bàn phím đã phủ kín vạch gạt ngang rồi. Cộng thêm là
 * một dải trống 34dp giữa thanh và bàn phím — khe hở đó trông như lỗi dựng.
 * Đây chính là chỗ nó khác `BottomActionBar` (thanh đó tự cộng
 * `Math.max(insets.bottom, 16)` vì nó sống ở đáy MÀN HÌNH, không phải đáy bàn
 * phím).
 */
export function KeyboardBar({
  className,
  doneLabel = DONE_LABEL_DEFAULT,
  leading,
  onDone,
  visible,
}: KeyboardBarProps) {
  /**
   * ⚠️ Gọi hook TRƯỚC mọi nhánh trả về sớm — `visible` đổi giá trị giữa chừng
   * là thứ bình thường (ô nhập mất focus), và bỏ qua một hook giữa hai lần vẽ
   * làm React ném lỗi ở một chỗ không liên quan.
   */
  const keyboardVisible = useKeyboardState((state) => state.isVisible);

  if (!(visible ?? keyboardVisible)) return null;

  return (
    /**
     * ⛔ `className` KHÔNG được đặt lên `KeyboardStickyView`: nó dựng một
     * `Animated.View` của Reanimated, mà NativeWind chỉ dạy `className` cho
     * danh sách component của React Native — prop rơi vào hư không, không lỗi
     * nào báo. Mọi lớp nằm ở `<View>` bên trong.
     *
     * ⚠️ Không truyền `offset`: mặc định `{ closed: 0, opened: 0 }` đã đúng —
     * thanh dính SÁT mép trên bàn phím, đúng bản vẽ.
     */
    <KeyboardStickyView>
      <View
        /**
         * Số đo đo lại trên `259:93875` (nhóm "Keyboard", ba mẫu thanh xếp
         * chồng): cao **48** = đệm dọc 4 + nút 40 + đệm dọc 4; đệm ngang **8**;
         * nền TRẮNG (`bg-1`) trên nền xám của bàn phím; một đường kẻ mảnh ở
         * MÉP TRÊN.
         *
         * ⚠️ `border-t` (1dp) chứ không `border-hairline`: `border-hairline`
         * đặt bề dày cho CẢ BỐN cạnh, và ở đây chỉ có cạnh trên được kẻ.
         */
        className={cn(
          'flex-row items-center gap-xs border-t border-divider-1 bg-bg-1 px-xs py-2xs',
          className,
        )}
      >
        {/**
         * ⚠️ `flex-1` + `overflow-hidden` chứ không để nội dung tự nở: hàng chip
         * mệnh giá dài hơn màn hình, và không kẹp thì nút "Xong" bị đẩy ra khỏi
         * mép phải — người dùng gõ xong không còn cách nào đóng bàn phím.
         */}
        <View className="flex-1 overflow-hidden">{leading}</View>

        {/**
         * `size="sm"` = cao 40 đúng bản vẽ, và `Button` đã tự bù `hitSlop`
         * `{ top: 2, bottom: 2 }` cho đủ ngưỡng chạm 44dp (`BUTTON_HIT_SLOP`).
         * ⚠️ Phần bù đó nằm gọn trong đệm dọc 4 của thanh nên nó KHÔNG chồng
         * lên vùng chạm của chip ở khe `leading` (chip nằm bên TRÁI, phần bù
         * chỉ nới theo chiều DỌC).
         *
         * `variant="tertiary"` = nền `action-tint` + chữ `fg-brand`, đúng cặp
         * màu đo được trên bản vẽ (#EBF5F5 nền, #00453C chữ). Tự tính lại từ
         * `colors.json`: **9.87:1** ở chế độ sáng · **7.82:1** ở chế độ tối —
         * cả hai vượt ngưỡng 4.5 của chữ thường.
         */}
        <Button
          label={doneLabel}
          size="sm"
          variant="tertiary"
          onPress={onDone ?? dismissKeyboard}
        />
      </View>
    </KeyboardStickyView>
  );
}
