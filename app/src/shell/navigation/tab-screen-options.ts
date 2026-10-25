import type { BottomTabNavigationOptions } from 'expo-router/js-tabs';
import { useReducedMotion } from 'react-native-reanimated';

import { MOTION_DURATION } from '@/shared/ui/motion';

/**
 * `screenOptions` của `<Tabs>` ở `app/(app)/_layout.tsx`. Tách ra đây để file layout (bản đồ route + nơi lắp các host)
 * giữ dưới trần 200 dòng.
 */
const TAB_SCREEN_OPTIONS = {
  /**
   * ⛔ Tắt header của navigator. Mỗi màn hình tự dựng `<Screen header={<AppBar …>}>`
   * theo đúng bản thiết kế: thanh tiêu đề nằm TRÊN dải gradient của màn.
   * Bật cả hai là hai thanh tiêu đề chồng nhau — một của navigator (nền
   * đặc, font hệ thống), một của bộ component.
   */
  headerShown: false,
  /**
   * Đổi tab = MỜ CHÉO êm thay vì thay cảnh cái rụp.
   *
   * ⚠️ `'fade'` chứ KHÔNG `'shift'`: tab là các phân hệ NGANG HÀNG, không có trước/sau — trượt ngang gợi ra một thứ tự
   * không tồn tại, và lẫn với cú đẩy màn con (trượt ngang) của stack bên trong mỗi tab.
   * ⚠️ `transitionSpec` chạy bằng `Animated` của React Native, KHÔNG phải Reanimated ⇒ chỉ lấy `duration` từ
   * `MOTION_DURATION.base` (nhịp "đổi tab" của bảng chung); ⛔ đừng đưa `MOTION_EASING` vào — đó là factory của Reanimated,
   * không phải hàm easing mà `Animated.timing` hiểu. Giữ easing mặc định của thư viện.
   */
  animation: 'fade',
  transitionSpec: { animation: 'timing', config: { duration: MOTION_DURATION.base } },
} satisfies BottomTabNavigationOptions;

/** "Giảm chuyển động" bật ⇒ đổi cảnh tức thì. Cùng một object mỗi lần (hằng số) nên navigator không phải tính lại options. */
const TAB_SCREEN_OPTIONS_REDUCED = {
  ...TAB_SCREEN_OPTIONS,
  animation: 'none',
} satisfies BottomTabNavigationOptions;

/**
 * Options cho `<Tabs screenOptions>` theo cờ "Giảm chuyển động" của hệ điều hành.
 *
 * ⚠️ Là HOOK chứ không phải hằng số: bộ tab JS của React Navigation KHÔNG tự đọc cờ đó (đã soát
 * `expo-router/build/react-navigation/bottom-tabs`). Gọi TRƯỚC mọi `return` sớm của layout — Rules of Hooks.
 */
export function useTabScreenOptions(): BottomTabNavigationOptions {
  return useReducedMotion() ? TAB_SCREEN_OPTIONS_REDUCED : TAB_SCREEN_OPTIONS;
}
