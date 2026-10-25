import { useQuery } from '@tanstack/react-query';

import { notificationKeys, readStateService } from '@/core/notifications';

/**
 * Số phản hồi CHƯA ĐỌC của MỘT luồng mà tôi đang theo dõi (p1-06 app.md §3 `ThreadSummaryRow`: chấm "N mới"), lấy từ
 * `GET /me/unread?workspaceId=` → `threads[Thread.id].unread`. BE chỉ liệt kê luồng CÓ chưa đọc và tôi theo dõi — vắng mục = 0.
 *
 * ⚠️ `threadRecordId` là `Thread.id` (`MessageView.threadRecordId` của TIN GỐC), KHÔNG phải id tin gốc: khoá `threads` của
 * `/me/unread` là `Thread.id` (p1-06 điểm lệch #4). Truyền nhầm id tin gốc thì luôn ra 0 mà không báo lỗi gì.
 *
 * Dùng CHUNG khoá cache với `useWorkspaceUnread` (`@/shell/notifications`, nguồn của huy hiệu tab/danh sách kênh) nên nhiều hàng
 * cùng đọc MỘT lượt gọi; số được `useReadStateSync` làm mới khi có reply mới và `useReadMarker` hạ về 0 khi đọc luồng.
 * `select` cắt đúng một số nên hàng chỉ vẽ lại khi số CỦA LUỒNG NÀY đổi. Thiếu workspace/luồng thì không gọi gì.
 */
export function useThreadUnread(
  workspaceId: string | undefined,
  threadRecordId: string | undefined,
): number {
  const { data } = useQuery({
    enabled: Boolean(workspaceId) && Boolean(threadRecordId),
    queryFn: () => readStateService.getWorkspaceUnread(workspaceId ?? ''),
    queryKey: notificationKeys.workspaceUnread(workspaceId ?? ''),
    select: (unread) => unread.threads[threadRecordId ?? '']?.unread ?? 0,
    staleTime: 15_000,
  });
  return data ?? 0;
}
