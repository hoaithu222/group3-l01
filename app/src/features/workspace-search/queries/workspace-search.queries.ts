import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import {
  workspaceDetailKey,
  workspaceSearchKeys,
  workspaceSearchService,
  type WorkspaceSearchParams,
} from '../api';

/**
 * Tìm toàn nhóm (app.md p5-04 §4): cursor opaque từ `meta.nextCursor`, `enabled` khi từ khoá HỢP LỆ (nơi gọi đã
 * `validateSearchText`), `gcTime` 2 phút (kết quả chứa nội dung tin — không giữ lâu), `staleTime` 30 s.
 *
 * ⛔ `retry: false`: mỗi lượt gọi trừ vào hạn mức 30 lần/phút của người dùng — thử lại tự động chỉ đốt hạn mức nhanh hơn
 * và không cứu được lỗi 4xx (`SRCH_*`, 404, 429). Nút "Thử lại"/đếm ngược 429 là đường duy nhất.
 *
 * ⚠️ `placeholderData` giữ kết quả CŨ khi đổi TỪ KHOÁ/BỘ LỌC (không nháy trắng) nhưng CHỈ trong cùng một tab của cùng một
 * nhóm: đổi tab mà vẫn giữ thì dòng `messages` bị vẽ dưới tab Tệp (khác loại dòng, khác `renderItem`). Một trang có thể ít
 * hơn `limit` dù `hasMore: true` (BE lọc sau khi lấy) — phân trang dựa vào `hasMore`/`nextCursor`, không dựa độ dài mảng.
 */
export function useWorkspaceSearchQuery(
  workspaceId: string,
  params: WorkspaceSearchParams,
  enabled: boolean,
) {
  return useInfiniteQuery({
    queryKey: workspaceSearchKeys.search(workspaceId, params),
    queryFn: ({ pageParam }) =>
      workspaceSearchService.search(workspaceId, { ...params, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined,
    enabled,
    gcTime: 2 * 60_000,
    staleTime: 30_000,
    placeholderData: (previous, previousQuery) => {
      const key = previousQuery?.queryKey;
      return key && key[2] === workspaceId && key[3].type === params.type ? previous : undefined;
    },
    retry: false,
  });
}

/** Người gửi cho bộ lọc — chỉ tải khi mở tờ chọn người gửi. Khách không gọi được (404) nên nơi gọi ẩn bộ lọc đó. */
export function useSearchAuthors(workspaceId: string, q: string, enabled: boolean) {
  return useQuery({
    queryKey: workspaceSearchKeys.authors(workspaceId, q),
    queryFn: () => workspaceSearchService.listAuthors(workspaceId, q),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
  });
}

/** Phạm vi cho bộ lọc (kênh + nhóm chat) — chỉ tải khi mở tờ chọn phạm vi. */
export function useSearchScopes(workspaceId: string, enabled: boolean) {
  return useQuery({
    queryKey: workspaceSearchKeys.scopes(workspaceId),
    queryFn: () => workspaceSearchService.listScopes(workspaceId),
    enabled,
    // 0: kênh/nhóm chat đổi ở feature khác (tạo, đổi tên, lưu trữ, tham gia) — không ai làm mới khoá riêng này.
    staleTime: 0,
    retry: false,
  });
}

/**
 * Vai trò của mình trong nhóm — chỉ để ẩn tab "Người" và các bộ lọc khách không dùng được. Dùng CHUNG khoá cache với
 * `useWorkspace()` (xem `workspaceDetailKey`) nên hầu như không tốn request: `[wsId]/_layout` đã tải nó.
 */
export function useSearchWorkspaceHead(workspaceId: string) {
  return useQuery({
    queryKey: workspaceDetailKey(workspaceId),
    queryFn: () => workspaceSearchService.getWorkspaceHead(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  });
}
