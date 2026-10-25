import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

import { auditLogKeys } from '@/features/audit-log';
import type { ApiResponse } from '@/shared/types/api.types';
import { showToast } from '@/shared/utils/toast.utils';

import type { AdminReportListParams, PrivateContent } from '../types/moderation.types';
import { isAlreadyHandled } from '../utils/report-errors';
import { moderationService } from './moderation.service';

const WORKSPACE_OPTIONS_STALE_MS = 5 * 60_000;

export const moderationKeys = {
  all: ['moderation'] as const,
  /** Tiền tố — mọi bộ lọc/trang của hàng đợi. */
  lists: () => ['moderation', 'list'] as const,
  list: (p: AdminReportListParams) => ['moderation', 'list', p] as const,
  details: () => ['moderation', 'detail'] as const,
  detail: (id: string) => ['moderation', 'detail', id] as const,
  content: (id: string) => ['moderation', 'content', id] as const,
  workspaceOptions: () => ['moderation', 'workspace-options'] as const,
  /** Số nhóm báo cáo đang chờ (chấm số ở menu) — tách khỏi `lists()` để trang đang lọc không kéo theo. */
  openCount: () => ['moderation', 'open-count'] as const,
};

/**
 * Làm mới hàng đợi + chi tiết + nhật ký. ⛔ KHÔNG dùng `moderationKeys.all`: nó cũng khớp khoá
 * `content` — refetch nội dung riêng tư = thêm một dòng audit `moderation.view-private` và một
 * thông báo cho người trong cuộc mà không ai bấm gì. Nội dung chỉ được tải lại do người dùng.
 */
export function refreshModeration(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: moderationKeys.lists() });
  void qc.invalidateQueries({ queryKey: moderationKeys.openCount() });
  void qc.invalidateQueries({ queryKey: moderationKeys.details() });
  void qc.invalidateQueries({ queryKey: auditLogKeys.all });
}

/** `placeholderData: keepPreviousData` — đổi trang/lọc không nháy trắng bảng. */
export const useAdminReports = (params: AdminReportListParams, enabled = true) =>
  useQuery({
    queryKey: moderationKeys.list(params),
    queryFn: () => moderationService.list(params),
    placeholderData: keepPreviousData,
    enabled,
  });

export const useAdminReport = (reportId: string | undefined) =>
  useQuery({
    queryKey: moderationKeys.detail(reportId ?? ''),
    queryFn: () => moderationService.detail(reportId as string),
    enabled: !!reportId,
  });

/**
 * Nội dung riêng tư (D-06). `enabled` chỉ bật SAU KHI người dùng xác nhận; mỗi lần gọi thật là
 * một dòng audit + thông báo cho chủ nhóm/người trong cuộc, nên:
 *  - `staleTime: Infinity` + tắt mọi `refetchOn*` + `retry: false`: không có lần gọi lại ngầm nào
 *    (đổi tab trình duyệt, mạng chập chờn, mount lại) — muốn xem lại phải xác nhận lại;
 *  - `gcTime: 0` (+ `removeQueries` khi rời trang ở `PrivateContentGate`): nội dung không nằm lại
 *    trong cache để phiên/khung nhìn khác dùng lại.
 */
export const usePrivateContent = (reportId: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: moderationKeys.content(reportId ?? ''),
    queryFn: () => moderationService.privateContent(reportId as string),
    enabled: enabled && !!reportId,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });

/** `PATCH /admin/reports/:id` — đóng CẢ NHÓM báo cáo cùng đích. */
export const useReportAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: moderationService.act,
    onSuccess: () => {
      refreshModeration(qc);
      showToast('success', 'Đã xử lý báo cáo và ghi nhật ký');
    },
    // `MOD_001` = người khác đã đóng nhóm này — làm mới để khối quyết định chuyển sang chỉ đọc.
    onError: (err) => {
      if (isAlreadyHandled(err)) refreshModeration(qc);
    },
  });
};

/**
 * `POST /admin/messages/:id/remove`. `reportId` để cập nhật tại chỗ nội dung riêng tư đang hiện
 * (đánh dấu tin đã gỡ) mà KHÔNG refetch nó — xem `refreshModeration`.
 */
export const useRemoveMessage = (reportId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: moderationService.removeMessage,
    onSuccess: (res, { messageId }) => {
      qc.setQueryData<ApiResponse<PrivateContent>>(moderationKeys.content(reportId), (old) =>
        old
          ? {
              ...old,
              data: {
                ...old.data,
                messages: old.data.messages.map((m) =>
                  m.id === messageId
                    ? {
                        ...m,
                        deleted: true,
                        deletedAt: res.data.deletedAt,
                        content: null,
                        attachments: [],
                      }
                    : m,
                ),
              },
            }
          : old,
      );
      refreshModeration(qc);
      showToast('success', 'Đã gỡ tin nhắn và ghi nhật ký');
    },
  });
};

/** Danh sách workspace cho ô lọc — `enabled` theo quyền `workspace:view` của người xem. */
export const useModerationWorkspaceOptions = (enabled: boolean) =>
  useQuery({
    queryKey: moderationKeys.workspaceOptions(),
    queryFn: moderationService.workspaceOptions,
    enabled,
    staleTime: WORKSPACE_OPTIONS_STALE_MS,
  });
