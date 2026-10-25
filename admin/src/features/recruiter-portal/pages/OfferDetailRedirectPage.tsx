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
 * Deep link `/recruiter/portal/offers/:id` (admin.md p6-08 §1) → tab Lời mời với `?offerId=` để ngăn kéo chi tiết mở TRÊN NỀN danh sách (dùng được làm đích của liên kết/thông báo
 * về một lời mời cụ thể). Lấy đường dẫn phân hệ qua `useMatches()` — KHÔNG import registry (khép vòng `check:cycles`).
 */
const OfferDetailRedirectPage = memo(function OfferDetailRedirectPage() {
  const { id } = useParams<{ id: string }>();
  const modulePath = findModulePath(useMatches());
  return (
    <Navigate replace to={`${modulePath}?tab=offers&offerId=${encodeURIComponent(id ?? '')}`} />
  );
});

export default OfferDetailRedirectPage;
