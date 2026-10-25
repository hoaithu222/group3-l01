import { Pressable, Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';

import { ToastIcon } from './ToastIcon';
import { type ToastAction, type ToastType } from './toast-store';

/**
 * Một dòng toast.
 *
 * Số đo lấy từ Figma — section `Toast Message` (259:97843), component set
 * `Toast` (259:97863), biến thể `Theme=Ma`:
 *   nền   `Opacity/Ink/Op80` = rgba(26,26,26,.8) → `bg-ink-5/80`
 *   bo    `Border/Bo24` = 24 → `rounded-md`
 *   đệm   `Padding/Pa12` = 12 → `p-sm`
 *   khe   `Gap/Ga8` = 8 → `gap-xs`
 *   icon  24dp
 *   chữ   `BODY/T14-Semibold` 14/20 → `text-body-md font-semibold`
 *   nút   `_button toast` 79×32, ghim phải (x=252) → `<Button size="xs">` 32dp
 *   ✕     `icon_ht_cancel` 24dp, ghim phải ngoài cùng (x=307)
 *   rộng  343dp trên khung 375 — tức là tràn hàng trừ hai lề 16dp, nên ở đây
 *         `w-full` bên trong lớp phủ có `px-md` chứ KHÔNG viết cứng 343.
 *
 * ── Một chỗ lệch bản thiết kế, có chủ ý ─────────────────────────────────────
 * Figma có `Background blur/8` sau nền mờ. React Native không có
 * `backdrop-filter`; làm được thì phải thêm `expo-blur` — một gói native mới
 * chỉ để làm đẹp một thành phần sống 5 giây. Nền `ink-5` ở 80% đã đủ tương phản
 * cho chữ trắng 14dp đậm nằm trên ảnh bìa giao dịch (chỗ dùng nặng nhất trong
 * bản thiết kế).
 */

export interface ToastItemProps {
  /** Nút hành động — "Hoàn tác", "Xem chi tiết". Bỏ trống thì không vẽ. */
  action?: ToastAction;
  /** Vẽ nút ✕. Cả dòng vẫn bấm được để đóng dù có hay không. */
  dismissible?: boolean;
  message: string;
  onDismiss: () => void;
  type: ToastType;
}

/**
 * Vùng chạm của ✕ khi ĐỨNG CẠNH nút hành động.
 *
 * ⚠️ Bên trái chỉ nới 4dp = ĐÚNG NỬA khe 8dp giữa hai nút. Nới 10dp như bình
 * thường thì vùng chạm của ✕ trùm sang mép phải nút "Hoàn tác", và React Native
 * trao cú chạm cho node VẼ SAU (chính là ✕) — người dùng nhắm vào Hoàn tác lại
 * đóng mất toast, tức là mất luôn cơ hội hoàn tác. Hụt ngưỡng 44dp bề ngang
 * (24 + 4 + 10 = 38) được bù bằng chính CẢ DÒNG toast: nó cũng đóng toast, và
 * nó rộng hết màn hình.
 */
const CLOSE_HIT_SLOP_WITH_ACTION = { bottom: 10, left: 4, right: 10, top: 10 } as const;

export function ToastItem({ action, dismissible, message, onDismiss, type }: ToastItemProps) {
  return (
    <Pressable
      /**
       * ⛔ `Pressable` KHÔNG mang `accessibilityRole="alert"`.
       *
       * Role `alert` báo với trình đọc màn hình rằng đây là NỘI DUNG thông báo,
       * không phải một điều khiển: TalkBack/VoiceOver sẽ không đọc "nhấn đúp để
       * kích hoạt", nên người khiếm thị không biết là chạm vào được. Và
       * `accessibilityHint` đứng một mình trên phần tử không có role tương tác
       * thường bị bỏ qua hẳn. Hai vai tách ra: vùng CHẠM ở đây, khối THÔNG BÁO ở
       * `<View>` bên trong.
       *
       * ⚠️ `accessible={false}` để cờ trợ năng mặc định của `Pressable` không
       * NUỐT khối bên trong — `accessible` gộp cả cây con thành một ô, và ô đó
       * sẽ mang role `button` thay vì role `alert`. Đó cũng là thứ giữ cho nút
       * hành động và ✕ còn lia tới được bằng trình đọc màn hình.
       */
      accessible={false}
      className="w-full flex-row items-start gap-xs rounded-md bg-ink-5/80 p-sm"
      onPress={onDismiss}
    >
      <View
        /**
         * ⛔ `accessibilityLiveRegion` là thứ khiến TalkBack ĐỌC toast lên.
         *
         * Toast xuất hiện mà không có thao tác nào của người dùng và biến mất
         * sau 5 giây. Thiếu prop này, trên Android nó hiện ra hoàn toàn im lặng:
         * người dùng khiếm thị không biết giao dịch vừa thành công hay vừa lỗi,
         * và cũng không có cách nào dò lại vì lúc họ dò tới thì toast đã tắt.
         * `polite` chứ không `assertive`: toast không quan trọng tới mức cắt
         * ngang câu đang đọc dở.
         *
         * `accessible` là thứ BIẾN khối này thành một phần tử trợ năng — thiếu
         * nó thì `accessibilityRole` bên dưới không có tác dụng nào (một `<View>`
         * không `accessible` không phải phần tử trợ năng với React Native).
         */
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        accessible
        /**
         * ⛔ `items-start`, KHÔNG phải `items-center`.
         *
         * Component set có thuộc tính `Text = Short | Long (>3 dòng)`
         * (259:97878…259:97976) và biến thể Long đặt biểu tượng ngang hàng dòng
         * chữ ĐẦU TIÊN, không phải giữa khối. Canh giữa thì toast 3 dòng có
         * biểu tượng trôi xuống lưng chừng và mắt mất mốc đọc. Ca này chắc chắn
         * xảy ra — 5 giây tự tắt được chọn CHÍNH VÌ thiết kế có toast 3 dòng.
         * ⚠️ Toast một dòng nhìn không đổi: icon 24dp cao hơn dòng chữ 20dp và
         * `pt-3xs` bên dưới bù đúng phần chênh.
         */
        className="flex-1 flex-row items-start gap-xs"
      >
        <ToastIcon type={type} />
        {/*
          `pt-3xs` = 2dp: Figma đặt chữ ở `y=2` trong hàng cao 24 (259:97898) —
          đó là phần bù để dòng chữ đầu tiên (cao 20) canh giữa so với biểu
          tượng (cao 24). Thiếu nó, chữ dính lên mép trên của icon.

          Chữ TRẮNG CỨNG (`white-10`) chứ không phải `fg-1`/`fg-inverse`: nền
          toast là `ink-5` — một bậc thang GIỐNG NHAU ở cả hai theme — nên chữ
          cũng phải giống nhau ở cả hai. `fg-1` đen ở theme sáng, `fg-inverse`
          đen ở theme tối; token vai trò nào cũng sai một nửa.
        */}
        <Text className="flex-1 pt-3xs text-body-md font-semibold text-white-10">{message}</Text>
      </View>

      {/* ⛔ `variant="white"` là biến thể DUY NHẤT đúng ở đây: nền toast là
          `ink-5` — tối GIỐNG NHAU ở cả hai theme — nên nút cũng phải cố định,
          không được đảo theo chế độ. `white` cho nền `action-white` (#FFFFFF) và
          chữ `neutral-10` (#1A1A1A) ⇒ 17.40:1 ở cả hai chế độ; `primary` thì ở
          chế độ SÁNG là nền xanh đậm #00453C trên toast #1A1A1A — 1.59:1, nút
          biến mất vào nền toast, còn ở chế độ TỐI nó lật sang nền sáng #3ECFB2
          (8.93:1): cùng một biến thể cho ra hai cái nút khác hẳn nhau.
          `size="xs"` = 32dp, đúng `_button toast` 79×32 của bản vẽ. */}
      {action ? (
        <Button label={action.label} size="xs" variant="white" onPress={action.onPress} />
      ) : null}

      {dismissible ? (
        <Pressable
          accessibilityLabel="Đóng thông báo"
          accessibilityRole="button"
          hitSlop={action ? CLOSE_HIT_SLOP_WITH_ACTION : 10}
          onPress={onDismiss}
        >
          {/* `action-white` (#FFFFFF ở cả hai theme) trên nền toast pha xuống
              nền trang ≈ #484848 ⇒ 9.15:1 — thừa ngưỡng 3:1 của hình phi văn
              bản. ⛔ Đừng dùng `fg-1`/`fg-inverse`: chúng đảo theo chế độ, còn
              nền toast thì không. */}
          <Icon color="action-white" name="cancel" size="md" />
        </Pressable>
      ) : null}
    </Pressable>
  );
}
