import { memo } from 'react';
import { Navigate, useMatches, useParams } from 'react-router-dom';

import type { RouteHandle } from '@/app/router/modules/types';

/** Đường dẫn dự phòng nếu vì lý do gì đó route không mang `handle` (không nên xảy ra). */
const FALLBACK_MODULE_PATH = '/recruiter';

function findModulePath(matches: ReturnType<typeof useMatches>): string {
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const modulePath = (matches[i].handle as RouteHandle | undefined)?.modulePath;
    if (modulePath) return modulePath;
  }
  return FALLBACK_MODULE_PATH;
}

/**
 * Deep link `/recruiter/companies/:id` (admin.md p6-08 §1) → tab Doanh nghiệp với `?companyId=` để ngăn kéo mở TRÊN NỀN danh sách (giữ bộ lọc/cuộn), cùng mẫu
 * `WebhookEventRedirectPage`. `status=all` để danh sách không bị kéo về "Chờ duyệt" mặc định làm ngăn kéo nằm trên một danh sách không chứa doanh nghiệp đó.
 * Lấy đường dẫn phân hệ qua `useMatches()` — KHÔNG import registry (khép vòng `check:cycles`).
 */
const CompanyDetailRedirectPage = memo(function CompanyDetailRedirectPage() {
  const { id } = useParams<{ id: string }>();
  const modulePath = findModulePath(useMatches());
  return (
    <Navigate
      replace
      to={`${modulePath}?tab=companies&status=all&companyId=${encodeURIComponent(id ?? '')}`}
    />
  );
});

export default CompanyDetailRedirectPage;
