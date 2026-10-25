import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { discoveryKeys } from '../api/discovery.keys';
import { discoveryService } from '../api/discovery.service';
import type { DiscoveryScope, ScopeSearchParams } from '../api/discovery.types';

type ScopeRef = Pick<DiscoveryScope, 'scopeId' | 'scopeType'>;

/**
 * Tìm trong phạm vi (app.md p1-09 §4): cursor opaque từ `meta.nextCursor`, `enabled` khi từ khoá HỢP LỆ (nơi gọi đã
 * `validateSearchText`), `gcTime` 2 phút (kết quả chứa nội dung tin — không giữ lâu), `keepPreviousData` để đổi bộ
 * lọc thì giữ kết quả cũ thay vì nháy trắng.
 *
 * ⛔ `retry: false`: mỗi lượt gọi trừ vào hạn mức 30 lần/phút của người dùng — thử lại tự động chỉ đốt hạn mức nhanh hơn
 * và không cứu được lỗi 4xx (`SRCH_*`, 404, 429). Nút "Thử lại"/đếm ngược 429 là đường duy nhất.
 * ⚠️ Một trang có thể ít hơn `limit` dù `hasMore: true` (BE lọc tin ẩn/thu hồi sau khi lấy `limit+1`) — phân trang dựa
 * vào `hasMore`/`nextCursor`, không dựa độ dài mảng.
 */
export function useScopeSearchQuery(scope: ScopeRef, params: ScopeSearchParams, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: discoveryKeys.search(scope, params),
    queryFn: ({ pageParam }) => discoveryService.search(scope, { ...params, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined,
    enabled,
    gcTime: 2 * 60_000,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

/** Danh bạ người gửi — chỉ tải khi cần (mở tờ chọn người gửi / màn ghim cần tên tác giả). */
export function useScopeMembers(scope: ScopeRef, q: string, enabled = true) {
  return useQuery({
    queryKey: discoveryKeys.members(scope, q),
    queryFn: () => discoveryService.listMembers(scope, q),
    enabled: enabled && Boolean(scope.scopeId),
    staleTime: 60_000,
    retry: false,
  });
}
