import { Stack, useLocalSearchParams } from 'expo-router';

import { useResourcesScope } from '@/features/resources/hooks/useResourcesScope';
import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';

/**
 * Ngăn xếp cho phạm vi "Tài liệu" của MỘT workspace (`index` · `[folderId]` ·
 * `preview/[resourceId]` · `trash`) — gộp thành MỘT nhóm, cùng lý do
 * `channels/_layout.tsx` (thiếu file này thì Expo Router "đẩy" từng file thành
 * route ngang hàng). Không thêm tab: điểm vào là mục "Tài liệu" của hub nhóm.
 *
 * `useResourcesScope(wsId)` gọi Ở ĐÂY (không lặp ở từng màn) để dọn cache + huỷ
 * hàng đợi tải lên ngay khi `permission:revoked` tới đúng workspace này. Việc
 * rời màn do `useWorkspaceSocket` ở `[wsId]/_layout.tsx` lo.
 */
export default function ResourcesLayout() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  useResourcesScope(wsId);

  return <Stack screenOptions={STACK_SCREEN_OPTIONS} />;
}
