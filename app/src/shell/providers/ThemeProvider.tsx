import { useColorScheme } from 'nativewind';
import { useEffect, type ReactNode } from 'react';
import * as SystemUI from 'expo-system-ui';

import { useThemeStore } from '@/shell/store/slices/theme';
import { DARK_COLORS, LIGHT_COLORS } from '@/shared/theme';

/**
 * Nối lựa chọn sáng/tối của người dùng vào NativeWind và vào giao diện hệ thống.
 *
 * ── Vì sao KHÔNG tự tính "system → light/dark" ở đây ─────────────────────────
 * NativeWind nhận thẳng `'system'`: `setColorScheme('system')` bảo nó tự bám
 * theo cài đặt của máy VÀ tự cập nhật khi người dùng đổi cài đặt đó giữa chừng
 * (kể cả lịch tự động chuyển tối buổi tối). Tự đọc `Appearance` rồi tính hộ là
 * dựng lại một thứ đã có, và bản dựng lại thường quên mất vế "đổi giữa chừng" —
 * app kẹt ở theme cũ tới lần mở lại tiếp theo.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useThemeStore((state) => state.preference);
  const { colorScheme, setColorScheme } = useColorScheme();

  useEffect(() => {
    setColorScheme(preference);
  }, [preference, setColorScheme]);

  /**
   * Đặt màu nền ở tầng NATIVE, dưới cả cây React.
   *
   * ⛔ Bỏ bước này thì có một dải trắng chớp lên mỗi khi đẩy màn hình mới ở chế
   * độ tối: React Native chưa vẽ kịp, và thứ lộ ra là nền mặc định của cửa sổ
   * native (trắng). Trên Android còn thấy cả lúc xoay máy và lúc kéo để đóng
   * màn hình. Đây là màu người dùng nhìn thấy ở KHE HỞ giữa các khung hình, nên
   * className không với tới được.
   */
  useEffect(() => {
    const background = colorScheme === 'dark' ? DARK_COLORS['bg-base'] : LIGHT_COLORS['bg-base'];
    void SystemUI.setBackgroundColorAsync(background);
  }, [colorScheme]);

  return children;
}
