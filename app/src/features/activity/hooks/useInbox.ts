import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { inboxService, notificationKeys, type InboxFilter } from '@/core/notifications';
import { useFeature } from '@/shell/capabilities';

import { activityService } from '../api/activity.service';

const PAGE_SIZE = 30;

/**
 * Hộp thư "Hoạt động" theo bộ lọc + nhóm làm việc (p1-07 `app.md` §4.1: `staleTime` 30 s). Mọi tham số ảnh hưởng kết
 * quả nằm trong khoá cache. Sắp `createdAt` giảm dần (server), phân trang cursor.
 *
 * `retry: false`: lỗi hiện ngay với nút "Thử lại" thay vì im lặng gọi lại. Không chạy khi phân hệ `communication` bị
 * tắt — hộp thư khi đó vốn ẩn (tab `activity` gắn cờ này).
 */
export function useInbox(filter: InboxFilter, workspaceId: string | undefined) {
  const communication = useFeature('communication');
  return useInfiniteQuery({
    // ⚠️ `queryFn` đứng TRƯỚC `getNextPageParam`: TypeScript suy kiểu trang từ `queryFn` theo thứ tự khai báo.
    queryFn: ({ pageParam }) =>
      inboxService.list({ cursor: pageParam, filter, limit: PAGE_SIZE, workspaceId }),
    queryKey: notificationKeys.inboxList({ filter, workspaceId }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined),
    enabled: communication !== false,
    retry: false,
    staleTime: 30_000,
  });
}

/**
 * Danh sách nhóm cho chip lọc — chỉ tải khi mở tờ chọn nhóm (`enabled`).
 *
 * `staleTime: 0`: nhóm của tôi đổi ở feature KHÁC (tạo/tham gia/rời/đổi tên nhóm) mà không ai làm mới khoá riêng này — mở
 * tờ chọn là tải lại nền (bản cache vẫn hiện ngay), không hiện tên cũ/thiếu nhóm vừa vào.
 */
export function useActivityWorkspaces(enabled: boolean) {
  return useQuery({
    enabled,
    queryFn: () => activityService.listWorkspaces(),
    queryKey: ['activity', 'workspaces'],
    staleTime: 0,
  });
}
