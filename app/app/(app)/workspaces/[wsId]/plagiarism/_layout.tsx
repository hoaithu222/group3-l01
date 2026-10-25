import { Stack } from 'expo-router';

import { FeatureRouteGuard } from '@/shell/capabilities';
import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';

/**
 * Ngăn xếp "Kiểm tra trùng lặp" của MỘT nhóm (p7-05, OWNER/ADMIN) — gộp `index`/`new`/`[scanId]/*` thành một nhánh con
 * của `[wsId]` (cùng lý do `mentor/_layout.tsx`). Quyền OWNER/ADMIN do BE trả 404 trung tính; cờ `plagiarism` tắt → guard.
 */
export default function WorkspacePlagiarismLayout() {
  return (
    <FeatureRouteGuard flag="plagiarism">
      <Stack screenOptions={STACK_SCREEN_OPTIONS} />
    </FeatureRouteGuard>
  );
}
