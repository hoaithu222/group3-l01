import { memo } from 'react';
import { Navigate, useMatches, useParams } from 'react-router-dom';

import type { RouteHandle } from '@/app/router/modules/types';

const FALLBACK_MODULE_PATH = '/integration';

function findModulePath(matches: ReturnType<typeof useMatches>): string {
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const modulePath = (matches[i].handle as RouteHandle | undefined)?.modulePath;
    if (modulePath) return modulePath;
  }
  return FALLBACK_MODULE_PATH;
}

/**
 * Deep link `/integration/events/:id` (admin.md p5-03 §1) → tab "Sự kiện webhook" với `?eventId=` để ngăn kéo mở TRÊN NỀN danh sách (cùng mẫu
 * `BadgeDetailRedirectPage`). Lấy đường dẫn phân hệ qua `useMatches()` — KHÔNG import registry (khép vòng `check:cycles`).
 */
const WebhookEventRedirectPage = memo(function WebhookEventRedirectPage() {
  const { id } = useParams<{ id: string }>();
  const modulePath = findModulePath(useMatches());
  return (
    <Navigate replace to={`${modulePath}?tab=events&eventId=${encodeURIComponent(id ?? '')}`} />
  );
});

export default WebhookEventRedirectPage;
