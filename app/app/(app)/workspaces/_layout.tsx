import { Stack } from 'expo-router';

import { FeatureRouteGuard } from '@/shell/capabilities';
import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';

/**
 * Ngăn xếp riêng cho tab "Nhóm" — gộp `index`/`new`/`[wsId]/*` thành MỘT tab,
 * cùng lý do với `(app)/me/_layout.tsx` (thiếu file này thì Expo Router "đẩy"
 * từng file thành tab ngang hàng ở thanh dưới).
 *
 * `FeatureRouteGuard` (p0-07): cờ `communication` tắt ở admin → "Tính năng này hiện chưa được bật".
 */
export default function WorkspacesLayout() {
  return (
    <FeatureRouteGuard flag="communication">
      <Stack screenOptions={STACK_SCREEN_OPTIONS} />
    </FeatureRouteGuard>
  );
}
