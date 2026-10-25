import { Stack } from 'expo-router';

import { FeatureRouteGuard } from '@/shell/capabilities';
import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';

/**
 * Ngăn xếp "Tài liệu cộng tác" của MỘT nhóm (p6-01) — gộp `index` · `[docId]` (soạn thảo) · `[docId]/history` · `[docId]/share` thành một nhánh con của
 * `[wsId]` (thiếu `_layout.tsx` thì Expo Router "đẩy" từng file thành tab ngang hàng — cùng lý do `mentor/_layout.tsx`). Cờ `collab` tắt → guard.
 * Quyền từng tài liệu do BE trả (404 trung tính) và từng màn hiện trạng thái; thu hồi ở mức nhóm do `[wsId]/_layout.tsx` lo.
 */
export default function WorkspaceDocsLayout() {
  return (
    <FeatureRouteGuard flag="collab">
      <Stack screenOptions={STACK_SCREEN_OPTIONS} />
    </FeatureRouteGuard>
  );
}
