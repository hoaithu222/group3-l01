import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { useResponsiveValue, useThemeColors } from '@/shared/theme';

/**
 * Mã QR của link mời — người khác quét ở "Tham gia nhóm" (`ScanInviteScreen`). Cùng khuôn với `VietQrCard`.
 *
 * ⚠️ Nền QR luôn TRẮNG, mã ĐEN (`neutral-0` / `ink-10` giống hệt nhau ở hai chế độ): QR đảo màu ở chế độ tối
 * thì nhiều máy quét không đọc được. ⛔ Đừng thay bằng `bg-bg-1`/`text-fg-1` — hai token đó ĐẢO theo chế độ.
 * `ecl="M"` (chịu mất ~15%) đủ cho link ~80 ký tự mà vẫn ra mã thưa, dễ quét từ xa.
 */
export function InviteQrCode({ value }: { value: string }) {
  const colors = useThemeColors();
  const size = useResponsiveValue({ base: 200, tablet: 240 });

  return (
    <View
      accessibilityLabel="Mã QR của link mời"
      accessibilityRole="image"
      accessible
      className="items-center self-center rounded-sm bg-neutral-0 p-sm"
    >
      <QRCode
        backgroundColor={colors['neutral-0']}
        color={colors['ink-10']}
        ecl="M"
        size={size}
        value={value}
      />
    </View>
  );
}
