import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { auditLogKeys } from '@/features/audit-log';
import { showToast } from '@/shared/utils/toast.utils';

import type { AdminRecordingListParams } from '../types/workspace-recordings.types';
import { workspaceRecordingsService } from './workspace-recordings.service';

/** Query key ghi hình họp (admin.md p2-06 §3) — `all` là gốc để một lần `invalidate` làm mới cả danh sách, thẻ tóm tắt lẫn ngăn kéo. */
export const workspaceRecordingsKeys = {
  all: ['workspace', 'recordings'] as const,
  list: (params: AdminRecordingListParams) => ['workspace', 'recordings', 'list', params] as const,
  summary: (workspaceId: string | undefined) =>
    ['workspace', 'recordings', 'summary', workspaceId ?? null] as const,
  detail: (recordingId: string) => ['workspace', 'recordings', 'detail', recordingId] as const,
};

/**
 * Danh sách bản ghi hình (chỉ metadata). Đổi trang/lọc giữ bảng cũ mờ đi thay vì nháy trắng (`keepPreviousData`);
 * `retry: false` — lỗi thật (403, 404 `CFG_005` khi cờ tắt giữa chừng) không nên thử lại lặp.
 */
export const useAdminRecordings = (params: AdminRecordingListParams) =>
  useQuery({
    queryKey: workspaceRecordingsKeys.list(params),
    queryFn: () => workspaceRecordingsService.list(params),
    placeholderData: keepPreviousData,
    retry: false,
  });

/** Bốn thẻ tóm tắt (`workspaceId` bỏ trống = toàn nền tảng). */
export const useAdminRecordingSummary = (workspaceId?: string, enabled = true) =>
  useQuery({
    queryKey: workspaceRecordingsKeys.summary(workspaceId),
    queryFn: () => workspaceRecordingsService.summary(workspaceId),
    select: (res) => res.data,
    retry: false,
    enabled,
  });

/**
 * Chi tiết một bản ghi cho ngăn kéo. `staleTime` 60 giây khớp admin.md §2.3 ("trạng thái object từ `HEAD` khi mở drawer, cache 60 s"):
 * mở lại cùng bản ghi trong phút đó không gọi lại storage.
 */
export const useAdminRecordingDetail = (recordingId: string | undefined) =>
  useQuery({
    queryKey: workspaceRecordingsKeys.detail(recordingId ?? ''),
    queryFn: () => workspaceRecordingsService.detail(recordingId as string),
    select: (res) => res.data,
    enabled: !!recordingId,
    staleTime: 60_000,
    retry: false,
  });

/**
 * `DELETE /admin/recordings/:id?reason=` — thành công hay lỗi đều làm mới danh sách/thẻ/chi tiết (lỗi `REC_005`/`MEET_009` nghĩa là trạng
 * thái đã đổi ở nơi khác); nhật ký cũng làm mới để ngăn kéo hiện dòng `recording.delete` vừa ghi. Interceptor lo toast lỗi.
 */
export const useDeleteAdminRecording = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: workspaceRecordingsService.remove,
    onSuccess: () => showToast('success', 'Đã xoá và ghi nhật ký'),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: workspaceRecordingsKeys.all });
      void qc.invalidateQueries({ queryKey: auditLogKeys.all });
    },
  });
};
