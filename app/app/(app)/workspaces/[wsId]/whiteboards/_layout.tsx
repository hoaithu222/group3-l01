import { Stack } from 'expo-router';

import { FeatureRouteGuard } from '@/shell/capabilities';
import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';

/**
 * Ngăn xếp "Bảng trắng" của MỘT nhóm (p6-02) — gộp `index` · `[wbId]` (canvas) · `[wbId]/history` · `[wbId]/share` thành một nhánh con của `[wsId]` (thiếu
 * `_layout.tsx` thì Expo Router "đẩy" từng file thành tab ngang hàng — cùng lý do `docs/_layout.tsx`). Cờ `collab` tắt → guard (dùng chung với tài liệu
 * cộng tác). Quyền từng bảng do BE trả (404 trung tính) và từng màn hiện trạng thái; thu hồi ở mức nhóm do `[wsId]/_layout.tsx` lo.
 */
export default function WorkspaceWhiteboardsLayout() {
  return (
    <FeatureRouteGuard flag="collab">
      <Stack screenOptions={STACK_SCREEN_OPTIONS} />
    </FeatureRouteGuard>
  );
}
