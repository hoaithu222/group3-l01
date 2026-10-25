import { View } from 'react-native';

import type { ThemePreference } from '@/shell/store/slices/theme';

/** Một nửa "màn hình thu nhỏ": dải nhấn + thẻ + dòng chữ giả. Màu CỐ ĐỊNH theo `dark`, không đổi theo chế độ đang bật. */
function MiniScreen({ dark }: { dark: boolean }) {
  return (
    <View className={dark ? 'flex-1 gap-2xs bg-neutral-10 p-xs' : 'flex-1 gap-2xs bg-neutral-2 p-xs'}>
      <View className={dark ? 'h-1.5 w-6 rounded-full bg-primary-3' : 'h-1.5 w-6 rounded-full bg-primary-5'} />
      <View className={dark ? 'h-5 rounded-3xs bg-neutral-9' : 'h-5 rounded-3xs bg-neutral-0'} />
      <View className={dark ? 'h-1.5 w-8 rounded-full bg-neutral-8' : 'h-1.5 w-8 rounded-full bg-neutral-5'} />
    </View>
  );
}

/**
 * Hình xem trước của một chế độ giao diện: Sáng = màn sáng, Tối = màn tối, Theo hệ thống = nửa sáng nửa tối.
 *
 * ── Vì sao dùng THANG màu (`neutral-*`, `primary-*`) chứ không token vai trò ─────────────────────────────────────
 * Ở đây cần ĐÚNG điều ngược lại của mọi nơi khác: hình "Sáng" phải sáng kể cả khi app đang ở chế độ tối (và ngược
 * lại), nếu không ba hình giống hệt nhau. Thang số GIỐNG NHAU ở hai chế độ (`src/shared/ui/AGENTS.md`) nên hợp đúng ca
 * "bản vẽ gọi đích danh một bậc" — token vai trò (`bg-bg-1`…) sẽ đổi theo chế độ và làm hỏng hình xem trước.
 *
 * ⚠️ Chuỗi class viết TRỌN trong từng nhánh (không ghép `bg-${…}`) để Tailwind quét được và `check:classes` thấy.
 * Trang trí thuần — nhãn nằm ở thẻ chọn bao ngoài, nên `accessibilityElementsHidden`.
 */
export function ThemePreview({ mode }: { mode: ThemePreference }) {
  return (
    <View
      accessibilityElementsHidden
      className="h-16 w-full flex-row overflow-hidden rounded-xs border-hairline border-border-1"
      importantForAccessibility="no-hide-descendants"
    >
      {mode === 'system' ? (
        <>
          <MiniScreen dark={false} />
          <MiniScreen dark />
        </>
      ) : (
        <MiniScreen dark={mode === 'dark'} />
      )}
    </View>
  );
}
