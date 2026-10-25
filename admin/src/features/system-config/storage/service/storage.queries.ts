import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';

import type { StorageCleanupPayload } from '../types/storage.types';
import { storageService } from './storage.service';

export const storageKeys = {
  all: ['system-config', 'storage'] as const,
  stats: (workspaceId?: string) =>
    ['system-config', 'storage', 'stats', workspaceId ?? 'all'] as const,
};

/** Số liệu lưu trữ — `workspaceId` bỏ trống = toàn hệ thống. Đổi workspace giữ số cũ mờ đi, không nháy skeleton. */
export const useStorageStats = (workspaceId?: string) =>
  useQuery({
    queryKey: storageKeys.stats(workspaceId),
    queryFn: () => storageService.getStats(workspaceId),
    select: (res) => res.data,
    placeholderData: keepPreviousData,
  });

/**
 * "Chạy dọn tệp mồ côi ngay". BE chỉ XẾP job — tệp được xoá bất đồng bộ nên số liệu
 * làm mới ngay có thể chưa đổi; nút "Làm mới" của tab để xem lại sau ít giây.
 * Lỗi (403/400…) do interceptor toast; modal xác nhận tự giữ mở khi mutation ném lỗi.
 */
export const useCleanupStorage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: StorageCleanupPayload) => storageService.cleanup(payload),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: storageKeys.all });
      void qc.invalidateQueries({ queryKey: ['audit-log'] });
      if (res.data.alreadyQueued) {
        showToast('warning', 'Giờ này đã có một lượt dọn thủ công — thử lại ở giờ sau');
      } else {
        showToast(
          'success',
          'Đã xếp lịch dọn tệp mồ côi — số liệu cập nhật sau khi tác vụ chạy xong',
        );
      }
    },
  });
};
