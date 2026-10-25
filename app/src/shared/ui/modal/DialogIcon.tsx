import { type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useThemeColor, type ThemeColorKey } from '@/shared/theme';
import { Icon, type IconName, type IconVariant } from '@/shared/ui/icon';

import { type DialogVariant } from './dialog.types';

/**
 * Biểu tượng đầu hộp thoại, khung 48dp theo Figma (`element modal` 259:96111).
 *
 * Ghi chú thiết kế nói rõ tông nào dùng hình nào:
 *   1. Thành công / xác nhận thành công → icon XANH
 *   2. Cảnh báo trước hành động không hoàn tác được → icon CAM
 *   3. Lỗi, hết hạn, vượt số lần → icon ĐỎ
 *   4. Thông tin, hướng dẫn, xác nhận → KHÔNG có icon (`variant="default"`)
 *
 * ── ⚠️ Nét vẽ: Figma tô ĐẶC cả ba tông, code mới làm được một ─────────────────
 * `assets/icons/system/` hiện chỉ có `checkmark-circle.solid.svg`;
 * `alert-warning.solid.svg` và `alert-warning-circle.solid.svg` CHƯA được xuất
 * từ Figma. ⛔ Đừng chỉ đổi `variant` thành `'solid'` cho hai tông kia: `Icon`
 * rơi về `linear` khi thiếu biến thể (xem `Icon.tsx`), tức nét MỎNG hơn cả
 * `bulk` hiện tại — lệch bản thiết kế xa hơn chứ không gần hơn. Xuất hai file
 * `.svg` đó rồi `npm run generate:icons`, sau đó sửa đúng hai dòng bên dưới.
 *
 * ── ⚠️ Màu: giữ TOKEN VAI TRÒ, không đổi sang thang số ───────────────────────
 * Figma bind `Foreground/<tông>/Beta` (= `success-4` · `warning-4` · `error-4`), đậm
 * hơn token vai trò đúng một bậc. Vẫn giữ `success` / `warning` / `error`: thang
 * số GIỐNG NHAU ở hai chế độ, đổi sang nó là icon mất khả năng đảo theo chế độ
 * tối — cái giá lớn hơn nhiều so với chênh một bậc màu.
 */
const VARIANT_ICON: Record<Exclude<DialogVariant, 'default' | 'loading'>, IconName> = {
  success: 'checkmark-circle',
  warning: 'alert-warning-circle',
  error: 'alert-warning',
};

/** Nét vẽ theo từng tông — xem ghi chú ⚠️ ở trên trước khi đổi hai dòng cuối. */
const VARIANT_ICON_STYLE: Record<Exclude<DialogVariant, 'default' | 'loading'>, IconVariant> = {
  success: 'solid',
  // ⛔ CHƯA đổi được sang 'solid': asset chưa xuất, đổi là rơi về nét `linear`.
  warning: 'bulk',
  error: 'bulk',
};

const VARIANT_COLOR: Record<Exclude<DialogVariant, 'default' | 'loading'>, ThemeColorKey> = {
  success: 'success',
  warning: 'warning',
  error: 'error',
};

/** Figma: khung biểu tượng 48×48, nằm trên một hàng cao đúng 48. */
const ICON_BOX = 48;

export function DialogIcon({ icon, variant }: { icon?: ReactNode; variant: DialogVariant }) {
  /* ⛔ `ActivityIndicator` nhận MÀU THÔ, không nhận className — đây là một
     trong số ít chỗ bắt buộc phải đọc token qua hook. Gọi vô điều kiện: hook
     không được nằm sau một lệnh `return`. */
  const spinnerColor = useThemeColor('action-base');

  // Ba nhánh tách rời chứ không phải một biểu thức lồng nhau: chỉ như vậy
  // TypeScript mới thu hẹp được `variant` xuống ba tông CÓ hình ở nhánh cuối.
  if (icon) return <View className="h-control-md w-full flex-row items-start">{icon}</View>;

  if (variant === 'default') return null;

  if (variant === 'loading') {
    return (
      /**
       * ⚠️ Ô 48×48 CANH GIỮA, không phải hàng `items-start` như bốn tông kia.
       *
       * `ActivityIndicator size="large"` chỉ ~36dp trên Android (và không nhận
       * cỡ tuỳ ý), nên thả vào một hàng cao 48 canh trên thì vòng quay vừa nhỏ
       * hơn vừa lệch lên so với biểu tượng của bốn tông còn lại — hai hộp thoại
       * đặt cạnh nhau trong cùng một luồng sẽ thấy khối đầu nhảy chỗ.
       * Bọc trong ô đúng 48×48 (`h-control-md w-12`) rồi canh giữa thì tâm vòng
       * quay trùng tâm khung biểu tượng của Figma.
       * ⛔ `w-control-md` KHÔNG tồn tại: `tailwind.config.js` chỉ nối
       * `height: layout.height`, không nối `width` — gõ vào là NativeWind bỏ
       * qua âm thầm và ô mất bề rộng.
       */
      <View className="h-control-md w-12 items-center justify-center">
        <ActivityIndicator color={spinnerColor} size="large" />
      </View>
    );
  }

  return (
    <View className="h-control-md w-full flex-row items-start">
      <Icon
        color={VARIANT_COLOR[variant]}
        name={VARIANT_ICON[variant]}
        size={ICON_BOX}
        variant={VARIANT_ICON_STYLE[variant]}
      />
    </View>
  );
}
