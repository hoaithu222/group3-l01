import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { auditLogKeys } from '@/features/audit-log';
import { formatNumber } from '@/shared/utils/format';
import { showToast } from '@/shared/utils/toast.utils';

import { COLLAB_REFRESH_MS, LARGE_DOCUMENTS_LIMIT } from '../constants/collab-ops.constants';
import { collabOpsService } from './collab-ops.service';

/** Query key vận hành collab (admin.md p6-01 §3). */
export const collabOpsKeys = {
  all: ['collab-ops'] as const,
  health: () => ['collab-ops', 'health'] as const,
  stats: () => ['collab-ops', 'stats'] as const,
  large: (limit: number) => ['collab-ops', 'large-documents', limit] as const,
};

/**
 * Sức khoẻ service `collab/` — làm mới 30 giây, CHỈ khi tab trình duyệt đang hiện (`refetchIntervalInBackground: false`).
 * Không `retry`: đây là trang theo dõi có polling sẵn; lỗi thoáng qua tự hết ở lượt sau.
 */
export const useCollabHealth = () =>
  useQuery({
    queryKey: collabOpsKeys.health(),
    queryFn: collabOpsService.health,
    select: (res) => res.data,
    refetchInterval: COLLAB_REFRESH_MS,
    refetchIntervalInBackground: false,
    retry: false,
  });

/** Số liệu tức thời (kết nối/tài liệu đang mở, state chờ lưu) — cùng chu kỳ với sức khoẻ. */
export const useCollabStats = () =>
  useQuery({
    queryKey: collabOpsKeys.stats(),
    queryFn: collabOpsService.stats,
    select: (res) => res.data,
    refetchInterval: COLLAB_REFRESH_MS,
    refetchIntervalInBackground: false,
    retry: false,
  });

/** Top tài liệu theo dung lượng state — CHỈ metadata; không polling (thay đổi chậm). */
export const useLargeDocuments = (limit: number = LARGE_DOCUMENTS_LIMIT) =>
  useQuery({
    queryKey: collabOpsKeys.large(limit),
    queryFn: () => collabOpsService.largeDocuments(limit),
    select: (res) => res.data,
    staleTime: 60_000,
    retry: false,
  });

/** `POST /admin/collab/cleanup-snapshots` — làm mới bảng tài liệu lớn (số snapshot đổi) và nhật ký (audit `collab.cleanup-snapshots`). */
export const useCleanupCollabSnapshots = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: collabOpsService.cleanupSnapshots,
    onSuccess: (res) => {
      const { pruned, scanned } = res.data;
      showToast(
        'success',
        `Đã dọn ${formatNumber(pruned)} bản lưu tự động (đã quét ${formatNumber(scanned)} tài liệu) và ghi nhật ký`,
      );
      void qc.invalidateQueries({ queryKey: [...collabOpsKeys.all, 'large-documents'] });
      void qc.invalidateQueries({ queryKey: auditLogKeys.all });
    },
  });
};
