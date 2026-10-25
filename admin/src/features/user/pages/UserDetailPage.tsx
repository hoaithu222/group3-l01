import { memo } from 'react';
import { Navigate, useMatches, useParams } from 'react-router-dom';

import type { RouteHandle } from '@/app/router/modules/types';

/** Đường dẫn dự phòng nếu vì lý do gì đó route không mang `handle` (không nên xảy ra). */
const FALLBACK_LIST_PATH = '/user';

/**
 * Deep-link `/user/:id` — redirect về danh sách với `?id=` để
 * `UserDetailDrawer` mở đúng người dùng TRÊN NỀN danh sách (giữ filter/scroll
 * đang xem), xem `UserListPage`.
 *
 * ⛔ Lấy đường dẫn gốc của phân hệ qua `useMatches()` (route `handle`), KHÔNG
 * import `MODULE_PATHS`/`module-registry.ts` — trang này được chính registry
 * lazy-load, import ngược lại là khép vòng (`npm run check:cycles`). Xem
 * JSDoc `RouteHandle`.
 */
function findModulePath(matches: ReturnType<typeof useMatches>): string {
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const modulePath = (matches[i].handle as RouteHandle | undefined)?.modulePath;
    if (modulePath) return modulePath;
  }
  return FALLBACK_LIST_PATH;
}

const UserDetailPage = memo(function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const matches = useMatches();
  const modulePath = findModulePath(matches);

  return <Navigate replace to={`${modulePath}?id=${id ?? ''}`} />;
});

export default UserDetailPage;
