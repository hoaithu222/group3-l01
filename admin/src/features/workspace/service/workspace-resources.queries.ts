import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';

import { extractErrorCode, getMessageByCode } from '@/core/api/error.handler';
import { showToast } from '@/shared/utils/toast.utils';

import { workspaceKeys } from './workspace.queries';
import { workspaceResourcesService } from './workspace-resources.service';

/** Key theo admin.md p3-01 §3: `['workspace', 'resource-stats', id]`. */
export const workspaceResourcesKeys = {
  stats: (workspaceId: string) => ['workspace', 'resource-stats', workspaceId] as const,
};

/** Chỉ mount khi cờ `project` bật (xem `WorkspaceDetailPage`); dữ liệu chỉ là số đo, không tên tệp. */
export const useWorkspaceResourceStats = (workspaceId: string | undefined) =>
  useQuery({
    queryKey: workspaceResourcesKeys.stats(workspaceId ?? ''),
    queryFn: () => workspaceResourcesService.stats(workspaceId as string),
    enabled: !!workspaceId,
  });

/**
 * Sau khi đổi hạn mức: làm mới số liệu tab + chi tiết nhóm + nhật ký. `['system-config']` vì
 * hạn mức riêng nằm trong khoá `resource` của cấu hình hệ thống (tab Lưu trữ đọc lại). Dùng
 * khoá chuỗi thay vì import feature khác (`feature-structure.md`).
 */
function useAfterQuotaChange(workspaceId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: workspaceResourcesKeys.stats(workspaceId) });
    void qc.invalidateQueries({ queryKey: workspaceKeys.detail(workspaceId) });
    void qc.invalidateQueries({ queryKey: ['system-config'] });
    void qc.invalidateQueries({ queryKey: ['audit-log'] });
  };
}

/** 409 `RES_003` có banner riêng ở modal — không toast; mọi lỗi khác toast một lần. */
function toastUnlessConflict(err: unknown) {
  const code = extractErrorCode(err as AxiosError);
  if (code === 'RES_003') return;
  showToast('error', getMessageByCode(code));
}

export const useSetResourceQuota = (workspaceId: string) => {
  const afterChange = useAfterQuotaChange(workspaceId);
  return useMutation({
    mutationFn: (payload: { bytes: number; reason: string }) =>
      workspaceResourcesService.setQuota(workspaceId, payload),
    onSuccess: () => {
      afterChange();
      showToast('success', 'Đã đặt hạn mức riêng và ghi nhật ký');
    },
    onError: toastUnlessConflict,
  });
};

export const useResetResourceQuota = (workspaceId: string) => {
  const afterChange = useAfterQuotaChange(workspaceId);
  return useMutation({
    mutationFn: (payload: { reason: string }) =>
      workspaceResourcesService.resetQuota(workspaceId, payload),
    onSuccess: () => {
      afterChange();
      showToast('success', 'Đã về hạn mức mặc định và ghi nhật ký');
    },
    onError: toastUnlessConflict,
  });
};
