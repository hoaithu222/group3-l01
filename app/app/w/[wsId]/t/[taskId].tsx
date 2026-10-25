import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * p3-03 app.md §1 — `https://<domain>/w/{wsId}/t/{taskId}` mở chi tiết thẻ. Chỉ chuyển tiếp, cùng mẫu
 * `app/w/[wsId]/index.tsx`; link chỉ có `taskId` nên bước tìm `boardId` do `TaskLinkResolverScreen` lo (trong
 * `(app)`, sau hàng rào đăng nhập). Intent filter Android đã phủ `/w/` (`app.config.ts`).
 */
export default function ShortTaskLinkRoute() {
  const { taskId, wsId } = useLocalSearchParams<{ taskId: string; wsId: string }>();
  return (
    <Redirect href={{ params: { taskId, wsId }, pathname: '/workspaces/[wsId]/tasks/[taskId]' }} />
  );
}
