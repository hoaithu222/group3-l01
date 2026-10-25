import { memo } from 'react';
import { Navigate, useMatches, useParams } from 'react-router-dom';

import type { RouteHandle } from '@/app/router/modules/types';

import { O2O_DETAIL_PARAM } from '../constants/o2o.constants';

const FALLBACK_MODULE_PATH = '/o2o';

function findModulePath(matches: ReturnType<typeof useMatches>): string {
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const modulePath = (matches[i].handle as RouteHandle | undefined)?.modulePath;
    if (modulePath) return modulePath;
  }
  return FALLBACK_MODULE_PATH;
}

/**
 * Deep link `/o2o/:tab/:id` với `:tab` ∈ locations | shops | orders (admin.md p6-05 §1: `locations/:id`, `shops/:id`, `orders/:id`) →
 * tab tương ứng với `?locationId=` / `?shopId=` / `?orderId=` để ngăn kéo chi tiết mở TRÊN NỀN danh sách (cùng mẫu
 * `WebhookEventRedirectPage`). `:tab` lạ → về tab mặc định. Lấy đường dẫn phân hệ qua `useMatches()` — KHÔNG import registry (khép vòng
 * `check:cycles`).
 */
const O2oDetailRedirectPage = memo(function O2oDetailRedirectPage() {
  const { tab, id } = useParams<{ tab: string; id: string }>();
  const modulePath = findModulePath(useMatches());
  // So khớp qua entries (không index thẳng): `:tab` là chuỗi tuỳ ý từ URL, index `constructor`/`toString` sẽ trả hàm của Object.
  const param = Object.entries(O2O_DETAIL_PARAM).find(([key]) => key === tab)?.[1];
  if (!param || !id) return <Navigate replace to={modulePath} />;
  return <Navigate replace to={`${modulePath}?tab=${tab}&${param}=${encodeURIComponent(id)}`} />;
});

export default O2oDetailRedirectPage;
