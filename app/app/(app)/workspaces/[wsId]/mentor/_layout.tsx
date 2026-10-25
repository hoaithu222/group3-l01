import { Stack } from 'expo-router';

import { FeatureRouteGuard } from '@/shell/capabilities';
import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';

/**
 * Ngăn xếp "Tìm cố vấn" của MỘT nhóm (p6-03, OWNER/ADMIN) — gộp `index`/`new`/`[postId]/applications` thành một nhánh con của
 * `[wsId]` (cùng lý do `wallet/_layout.tsx`). Quyền OWNER/ADMIN do BE trả 403/404 và từng màn ẩn nội dung; cờ `mentor` tắt → guard.
 */
export default function WorkspaceMentorLayout() {
  return (
    <FeatureRouteGuard flag="mentor">
      <Stack screenOptions={STACK_SCREEN_OPTIONS} />
    </FeatureRouteGuard>
  );
}
