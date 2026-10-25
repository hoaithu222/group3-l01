import { memo } from 'react';
import { Navigate, useMatches, useParams } from 'react-router-dom';

import type { RouteHandle } from '@/app/router/modules/types';

/** Đường dẫn dự phòng nếu route không mang `handle` (không nên xảy ra). */
const FALLBACK_MODULE_PATH = '/gamification';

function findModulePath(matches: ReturnType<typeof useMatches>): string {
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const modulePath = (matches[i].handle as RouteHandle | undefined)?.modulePath;
    if (modulePath) return modulePath;
  }
  return FALLBACK_MODULE_PATH;
}

/**
 * Deep link `/gamification/badges/:badgeId` (admin.md p4-03 §1) — chuyển về tab Huy hiệu với `?badgeId=` để `BadgeDetailDrawer` mở TRÊN NỀN
 * danh sách (giữ tìm kiếm/lọc/trang đang xem), cùng mẫu `UserDetailPage` (`/user/:id` → `/user?id=`).
 *
 * ⛔ Lấy đường dẫn gốc của phân hệ qua `useMatches()` (route `handle`), KHÔNG import `MODULE_PATHS`/`module-registry.ts` — trang này do chính
 * registry lazy-load, import ngược khép vòng (`npm run check:cycles`).
 */
const BadgeDetailRedirectPage = memo(function BadgeDetailRedirectPage() {
  const { badgeId } = useParams<{ badgeId: string }>();
  const modulePath = findModulePath(useMatches());

  return <Navigate replace to={`${modulePath}?tab=badges&badgeId=${encodeURIComponent(badgeId ?? '')}`} />;
});

export default BadgeDetailRedirectPage;
