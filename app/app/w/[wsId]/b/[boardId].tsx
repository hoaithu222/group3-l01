import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * p3-02 app.md §1 — `https://<domain>/w/{wsId}/b/{boardId}` mở thẳng bảng Kanban. Chỉ chuyển tiếp,
 * cùng mẫu `app/w/[wsId]/r/[resourceId].tsx`: hàng rào đăng nhập của `(app)/_layout.tsx` vẫn áp dụng,
 * còn 404/mất quyền do `KanbanScreen` xử lý (trở về hub nhóm). Đường dẫn `/w/` đã có trong
 * `intentFilters` của `app.config.ts` nên không cần khai thêm.
 */
export default function ShortBoardLinkRoute() {
  const { boardId, wsId } = useLocalSearchParams<{ boardId: string; wsId: string }>();
  return (
    <Redirect
      href={{ params: { boardId, wsId }, pathname: '/workspaces/[wsId]/boards/[boardId]' }}
    />
  );
}
