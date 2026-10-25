import { Stack } from 'expo-router';

import { NotFoundScreen } from '@/shell/navigation/NotFoundScreen';

/**
 * Đường dẫn không tồn tại — nội dung ở `NotFoundScreen`.
 *
 * `headerShown: false`: màn dùng `Screen` của bộ chung, không phải thanh tiêu đề
 * mặc định của React Navigation (không đi qua NativeWind — xem `docs/rules/navigation.md`).
 */
export default function NotFoundRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <NotFoundScreen />
    </>
  );
}
