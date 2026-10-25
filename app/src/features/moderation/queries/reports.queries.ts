import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { moderationKeys } from '../api/moderation.keys';
import type { CreateReportPayload, QueueScope, ReportStatus, ResolveReportPayload } from '../api/moderation.types';
import { reportsService } from '../api/reports.service';

const PAGE_SIZE = 20;

/** `POST /reports` — lỗi hiện TRONG `ReportSheet` (service đã `skipErrorToast`). */
export function useCreateReport() {
  return useMutation({ mutationFn: (payload: CreateReportPayload) => reportsService.create(payload) });
}

/**
 * Hàng đợi báo cáo của MỘT phạm vi theo trạng thái (cursor). Không realtime (app.md §4): `staleTime`
 * 0 + vào màn là tải lại; sau khi xử lý thì `useResolveReport` làm mới.
 *
 * `retry: false`: 403/404 ở đây là ĐÁP ÁN ("bạn không phải người kiểm duyệt"), thử lại ba lần chỉ làm
 * màn treo lâu hơn trước khi báo điều hiển nhiên.
 */
export function useScopeReports(scope: QueueScope, status: ReportStatus) {
  return useInfiniteQuery({
    queryKey: moderationKeys.scopeReports(scope, status),
    queryFn: ({ pageParam }) => reportsService.queue(scope, { status, cursor: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined),
    enabled: Boolean(scope.id),
    retry: false,
    staleTime: 0,
  });
}

/**
 * "Có báo cáo cần xử lý không" cho thẻ ở màn tổng quan nhóm. Trả lỗi 403 (không có phạm vi kiểm duyệt
 * nào) là ca BÌNH THƯỜNG với thành viên thường — thẻ tự ẩn, không toast. Khoá nằm dưới tiền tố
 * `scopeReportsAll` nên `useResolveReport` làm mới luôn con số này.
 */
export function useModerationPeek(workspaceId: string, enabled = true) {
  const scope: QueueScope = { type: 'WORKSPACE', id: workspaceId };
  return useQuery({
    queryKey: [...moderationKeys.scopeReportsAll(scope), 'peek'],
    queryFn: () => reportsService.queue(scope, { status: 'OPEN', limit: PAGE_SIZE }),
    enabled: enabled && Boolean(workspaceId),
    retry: false,
    staleTime: 60_000,
  });
}

/** `GET /reports/:id` — chi tiết + `myActions` (chỉ tải khi mở tấm chi tiết). */
export function useReport(reportId: string | undefined) {
  return useQuery({
    queryKey: moderationKeys.report(reportId ?? ''),
    queryFn: () => reportsService.detail(reportId as string),
    enabled: Boolean(reportId),
    retry: false,
    staleTime: 0,
  });
}

/**
 * `POST /reports/:id/resolve` — đóng CẢ NHÓM. Xong (hoặc `MOD_001` = người khác đóng trước) thì làm mới
 * mọi tab của phạm vi này, để nhóm biến khỏi "Đang mở" và hiện ở tab kết quả.
 */
export function useResolveReport(scope: QueueScope) {
  const queryClient = useQueryClient();
  const refresh = (reportId: string) => {
    void queryClient.invalidateQueries({ queryKey: moderationKeys.scopeReportsAll(scope) });
    void queryClient.invalidateQueries({ queryKey: moderationKeys.report(reportId) });
  };

  return useMutation({
    mutationFn: (input: { reportId: string } & ResolveReportPayload) =>
      reportsService.resolve(input.reportId, { action: input.action, reason: input.reason }),
    onSettled: (_data, _error, input) => refresh(input.reportId),
  });
}
