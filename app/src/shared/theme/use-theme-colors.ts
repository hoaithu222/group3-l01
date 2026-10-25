import { useColorScheme } from 'nativewind';

import { DARK_COLORS, LIGHT_COLORS, type ThemeColorKey } from './colors.generated';

/**
 * Bảng màu ĐANG hiển thị, dạng hex.
 *
 * ── Khi nào dùng hook này, khi nào dùng className ────────────────────────────
 * Mặc định LUÔN là className: `<View className="bg-bg-1" />`. Nó tự đổi theo
 * theme, không cần hook, không gây vẽ lại.
 *
 * Hook này chỉ dành cho những prop KHÔNG nhận className — chúng có thật và
 * không ít:
 *
 *   · `<Ionicons color={...} />` và mọi icon vẽ bằng font
 *   · `tabBarActiveTintColor`, `headerTintColor` của React Navigation
 *   · `<ActivityIndicator color>`, `<RefreshControl tintColor>`
 *   · thuộc tính `fill`/`stroke` của `react-native-svg`
 *   · `backgroundColor` của thanh trạng thái và thanh điều hướng hệ thống
 *
 * ⛔ Đừng dùng nó để thay cho className. Mỗi lần đổi theme, mọi component gọi
 * hook này đều vẽ lại; component dùng className thì không.
 *
 * ⚠️ `colorScheme` của NativeWind có thể là `undefined` ở khung hình đầu tiên
 * (trước khi tầng CSS-interop kịp đọc cài đặt hệ điều hành). Rơi về `light` —
 * nếu để `undefined` lọt xuống thì màu ra `undefined` và React Native vẽ đen.
 */
export function useThemeColors(): Record<ThemeColorKey, string> {
  const { colorScheme } = useColorScheme();
  return colorScheme === 'dark' ? DARK_COLORS : LIGHT_COLORS;
}

/**
 * Một màu duy nhất — cho component chỉ cần đúng một token.
 *
 * @example
 *   const iconColor = useThemeColor('fg-2');
 */
export function useThemeColor(key: ThemeColorKey): string {
  return useThemeColors()[key];
}

/** `'light' | 'dark'` — theme đang hiển thị thật sự. */
export function useResolvedTheme(): 'light' | 'dark' {
  const { colorScheme } = useColorScheme();
  return colorScheme === 'dark' ? 'dark' : 'light';
}
