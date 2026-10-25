import { memo } from 'react';
import { Navigate, useMatches, useParams } from 'react-router-dom';

import type { RouteHandle } from '@/app/router/modules/types';

const FALLBACK_MODULE_PATH = '/recruiter/portal';

function findModulePath(matches: ReturnType<typeof useMatches>): string {
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const modulePath = (matches[i].handle as RouteHandle | undefined)?.modulePath;
    if (modulePath) return modulePath;
  }
  return FALLBACK_MODULE_PATH;
}

/**
 * Deep link `/recruiter/portal/talent/:userId` (admin.md p6-08 §1) → tab Ứng viên với `?userId=` để ngăn kéo hồ sơ mở TRÊN NỀN danh sách (cùng mẫu `WebhookEventRedirectPage`).
 * Lấy đường dẫn phân hệ qua `useMatches()` — KHÔNG import registry (khép vòng `check:cycles`). Việc kiểm quyền/doanh nghiệp đã duyệt vẫn do trang đích và BE.
 */
const TalentDetailRedirectPage = memo(function TalentDetailRedirectPage() {
  const { userId } = useParams<{ userId: string }>();
  const modulePath = findModulePath(useMatches());
  return (
    <Navigate
      replace
      to={`${modulePath}?tab=talent&userId=${encodeURIComponent(userId ?? '')}`}
    />
  );
});

export default TalentDetailRedirectPage;
