import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SPACING } from '@/shared/theme';

import { ToastItem } from './ToastItem';
import { useToastStore } from './toast-store';

/**
 * Nơi hiển thị toast. Mount MỘT lần ở gốc cây (xem `AppProviders`).
 *
 * ⛔ Đừng dựng hệ toast thứ hai. Kho (`toast-store.ts`) và lối gọi
 * (`showToast()` ở `shared/utils/toast.utils.ts`) là hạ tầng dùng chung — tầng
 * gọi API đã bắn toast qua đó từ trước khi có bộ component. File này chỉ lo
 * phần NHÌN THẤY, nên thay nó không kéo theo sửa nơi gọi nào.
 *
 * ── Vị trí: TRÊN đỉnh màn hình ───────────────────────────────────────────────
 * Ghi chú thiết kế (Figma section `Toast Message` 259:97843, nguyên văn): "sẽ
 * được hiển thị phía trên màn hình, cách status bar 8px". Không phải phía dưới
 * như snackbar của Material: ở đây phía dưới đã có thanh hành động và thanh điều
 * hướng, toast chồng lên chúng thì che đúng cái nút người dùng vừa bấm.
 */
export function ToastHost() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  return (
    <View
      /**
       * ⛔ `pointerEvents="box-none"` là bắt buộc.
       *
       * Lớp phủ này che toàn màn hình. Không có prop đó thì nó NUỐT mọi cú chạm
       * — kể cả khi không có toast nào đang hiện — và cả app thành không bấm
       * được. Lỗi kiểu này rất khó lần vì nhìn màn hình thấy hoàn toàn bình
       * thường. `box-none` cho chạm đi xuyên qua, chỉ con của nó nhận chạm.
       */
      /* ⚠️ Lề ngang KHÔNG đặt bằng `px-md` ở đây: nó phải cộng với vùng an toàn
         hai bên, mà style nội tuyến thì ĐÈ lên class chứ không cộng vào. Để cả
         hai thì trên máy có tai thỏ ngang, class im lặng bị vứt đi. */
      className="absolute inset-x-0 top-0 z-50 gap-xs"
      pointerEvents="box-none"
      /**
       * Chèn dưới tai thỏ / thanh trạng thái, cộng đúng 8dp thiết kế yêu cầu.
       * `insets.top` là số đo LÚC CHẠY (khác nhau theo từng máy) nên không có
       * class Tailwind nào thay được.
       *
       * ⛔ Hai cạnh TRÁI/PHẢI cũng phải cộng, không chỉ cạnh trên.
       *
       * Xoay ngang máy có tai thỏ thì tai thỏ nằm ở MỘT BÊN, và `px-md` (16dp)
       * không đủ để đẩy toast ra khỏi nó: chữ chui xuống dưới phần khuyết, mất
       * hẳn vài ký tự đầu dòng. `Math.max` chứ không cộng dồn — cộng thì trên
       * máy dựng đứng (insets ngang = 0) vẫn đúng 16, nhưng khi có tai thỏ lại
       * thành 16 + 44 và toast co lại còn một nửa bề ngang.
       */
      style={{
        paddingTop: insets.top + SPACING.xs,
        paddingLeft: Math.max(insets.left, SPACING.md),
        paddingRight: Math.max(insets.right, SPACING.md),
      }}
    >
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          action={
            toast.action === undefined
              ? undefined
              : {
                  label: toast.action.label,
                  // ⛔ Đóng toast SAU khi chạy hành động, không để nó nằm lại 5
                  // giây: người dùng đã bấm "Hoàn tác" thì câu "Đã xoá" phía
                  // trước không còn đúng nữa, và để nguyên là mời họ bấm lần
                  // thứ hai vào một hành động đã chạy rồi.
                  onPress: () => {
                    toast.action?.onPress();
                    dismiss(toast.id);
                  },
                }
          }
          dismissible={toast.dismissible}
          message={toast.message}
          type={toast.type}
          onDismiss={() => dismiss(toast.id)}
        />
      ))}
    </View>
  );
}
