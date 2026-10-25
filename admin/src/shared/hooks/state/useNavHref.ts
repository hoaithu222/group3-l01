/**
 * useNavHref — dựng URL THẬT cho control điều hướng bằng QUERY PARAM.
 *
 * Phần lớn "tab" trong app không đổi route mà chỉ đổi `?tab=` (xem
 * `api-patterns.md §URL-synced Filters`). Chúng vẫn là ĐIỀU HƯỚNG dưới góc nhìn
 * user, nên vẫn phải có `href` để chuột phải / Ctrl+click / chuột giữa mở được
 * tab mới — xem `docs/rules/navigable-controls.md`.
 *
 *   const buildHref = useNavHref();
 *   const items = TABS.map((t) => ({ ...t, href: buildHref({ tab: t.key }) }));
 *
 * Ngữ nghĩa GIỐNG HỆT `useQueryParams.updateParams`: giá trị rỗng/`null` →
 * XOÁ key khỏi URL, các key khác giữ nguyên. Nhờ vậy mở tab mới từ một màn đang
 * lọc sẽ giữ nguyên bộ lọc đó — đúng thứ user mong đợi khi bấm "mở tab mới".
 *
 * ⛔ KHÔNG tự nối chuỗi `` `${pathname}?tab=${key}` `` ở call-site: cách đó xoá
 *    sạch mọi query param khác (search, page, filter) nên tab mới mở ra lại là
 *    một màn hình khác hẳn màn đang xem.
 */

import { useCallback } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

import type { QueryParamValue } from './useQueryParams';

export type BuildNavHref = (updates: Record<string, QueryParamValue>) => string;

export const useNavHref = (): BuildNavHref => {
  const [searchParams] = useSearchParams();
  const { pathname } = useLocation();

  return useCallback(
    (updates) => {
      const next = new URLSearchParams(searchParams);

      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      });

      const query = next.toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [searchParams, pathname],
  );
};
