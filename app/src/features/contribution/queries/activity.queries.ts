import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { contributionService } from '../api/contribution.service';
import type { MemberTasksPage, PeriodKey } from '../api/contribution.types';
import type { HeatmapRange } from '../utils/heatmap-grid';
import { contributionKeys } from './contribution.keys';
import { REPORT_STALE_MS } from './report.queries';

/**
 * Biểu đồ hoạt động theo NGÀY của bảng (hoặc của một thành viên). `range` = `null` cho tới khi biết múi giờ của nhóm (mốc "hôm nay"
 * phụ thuộc nó) — không gọi API bằng một khoảng đoán theo giờ máy. Đổi thành viên/khoảng: giữ lưới cũ mờ tới khi lưới mới về.
 */
export function useHeatmap(boardId: string, userId: string | 'all', range: HeatmapRange | null, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(boardId) && range !== null,
    placeholderData: keepPreviousData,
    queryFn: () =>
      contributionService.heatmap(boardId, {
        from: (range as HeatmapRange).from,
        to: (range as HeatmapRange).to,
        userId: userId === 'all' ? undefined : userId,
      }),
    queryKey: contributionKeys.heatmap(boardId, userId, range?.from ?? '', range?.to ?? ''),
    staleTime: REPORT_STALE_MS,
  });
}

const NO_CURSOR = undefined as string | undefined;

/** Thẻ được tính của MỘT thành viên trong kỳ (mới → cũ), cursor 50/trang. `userId = null` (chưa chọn ai) thì không tải. */
export function useMemberTasks(boardId: string, userId: string | null, period: PeriodKey) {
  return useInfiniteQuery({
    enabled: Boolean(boardId) && userId !== null,
    // `queryFn` đứng TRƯỚC `getNextPageParam`: TS suy kiểu trang từ `queryFn` rồi mới gán kiểu cho `last`.
    queryFn: ({ pageParam }) => contributionService.memberTasks(boardId, userId as string, period, pageParam),
    getNextPageParam: (last: MemberTasksPage) => last.nextCursor ?? undefined,
    initialPageParam: NO_CURSOR,
    queryKey: contributionKeys.memberTasks(boardId, userId ?? '', period),
    staleTime: REPORT_STALE_MS,
  });
}

/**
 * Múi giờ ĐANG dùng của nhóm (`effectiveTimezone` của `GET /workspaces/:id`) — mốc "hôm nay" của heatmap cấp nhóm. Khác heatmap của bảng (lấy múi giờ từ
 * `periods`/báo cáo của bảng), nhóm không có endpoint kỳ nên đọc thẳng từ chi tiết nhóm; chung khoá cache với `workspaces`/`boards` (xem `contributionKeys.workspaceDetail`).
 */
export function useWorkspaceTimezone(workspaceId: string, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(workspaceId),
    queryFn: () => contributionService.workspaceTimezone(workspaceId),
    queryKey: contributionKeys.workspaceDetail(workspaceId),
    staleTime: 30_000,
  });
}

/**
 * Biểu đồ hoạt động theo NGÀY của CẢ NHÓM (gộp mọi bảng), hoặc của một thành viên. Cùng luật với `useHeatmap`: `range = null` cho tới khi biết múi giờ,
 * đổi thành viên/khoảng thì giữ lưới cũ mờ tới khi lưới mới về. Khoá nằm dưới tiền tố `workspaceHeatmapAll` để thẻ đổi ở bất kỳ bảng nào làm mới được.
 */
export function useWorkspaceHeatmap(workspaceId: string, userId: string | 'all', range: HeatmapRange | null, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(workspaceId) && range !== null,
    placeholderData: keepPreviousData,
    queryFn: () =>
      contributionService.workspaceHeatmap(workspaceId, {
        from: (range as HeatmapRange).from,
        to: (range as HeatmapRange).to,
        userId: userId === 'all' ? undefined : userId,
      }),
    queryKey: contributionKeys.workspaceHeatmap(workspaceId, userId, range?.from ?? '', range?.to ?? ''),
    staleTime: REPORT_STALE_MS,
  });
}

/** Thành viên ACTIVE của nhóm cho bộ chọn của heatmap cấp nhóm — cache lâu (danh sách đổi chậm), tải cùng lúc với biểu đồ. */
export function useWorkspaceMembers(workspaceId: string, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(workspaceId),
    queryFn: () => contributionService.workspaceMembers(workspaceId),
    queryKey: contributionKeys.workspaceMembers(workspaceId),
    staleTime: 5 * 60_000,
  });
}
