import { Stack } from 'expo-router';

import { FeatureRouteGuard } from '@/shell/capabilities';
import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';

/**
 * Ngăn xếp phân hệ "Tìm cố vấn" (p6-03) — gộp `index` (bảng tin) + `[postId]` (chi tiết bài) thành MỘT nhánh (thiếu file này
 * Expo Router "đẩy" từng file thành route ngang hàng ở `(app)/_layout.tsx`). Cờ `mentor` tắt → màn "chưa khả dụng" cho cả nhánh
 * (deep link `/mentor/{postId}` cũng vậy); vòng lặp `MODULE_REGISTRY` ở `(app)/_layout.tsx` ẩn nhánh khỏi thanh tab.
 */
export default function MentorLayout() {
  return (
    <FeatureRouteGuard flag="mentor">
      <Stack screenOptions={STACK_SCREEN_OPTIONS} />
    </FeatureRouteGuard>
  );
}
