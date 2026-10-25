import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { CAPABILITIES_KEY } from '@/app/capabilities';
import { getMessageByCode } from '@/core/api/error.handler';
import { showToast } from '@/shared/utils/toast.utils';

import type {
  ResetSystemConfigPayload,
  UpdateSystemConfigPayload,
} from '../types/system-config.types';
import { configErrorCode, featureBlockReason, INLINE_CONFIG_ERRORS } from '../utils/config-errors';
import { systemConfigService } from './system-config.service';

export const systemConfigKeys = {
  all: ['system-config'] as const,
  list: () => ['system-config', 'list'] as const,
  detail: (key: string) => ['system-config', 'detail', key] as const,
};

export const useSystemConfigList = () =>
  useQuery({
    queryKey: systemConfigKeys.list(),
    queryFn: () => systemConfigService.list(),
    select: (res) => res.data,
  });

/**
 * Sau khi ghi: làm mới danh sách + capabilities (registry lọc module theo cờ)
 * + nhật ký của khoá vừa đổi (`AuditTrailPanel targetType="SystemConfig"`).
 */
function useAfterWrite() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: systemConfigKeys.all });
    void qc.invalidateQueries({ queryKey: CAPABILITIES_KEY });
    void qc.invalidateQueries({ queryKey: ['audit-log'] });
  };
}

/** Toast lỗi chung — trừ mã có giao diện riêng (409/CFG_002 ở trang). */
function toastUnlessInline(err: unknown) {
  const code = configErrorCode(err);
  if (INLINE_CONFIG_ERRORS.has(code)) return;
  if (code === 'CFG_003' && featureBlockReason(err) === 'missing-env') {
    showToast('error', 'Thiếu cấu hình hạ tầng (LiveKit…) trên server');
    return;
  }
  showToast('error', getMessageByCode(code));
}

export const useUpdateSystemConfig = () => {
  const afterWrite = useAfterWrite();
  return useMutation({
    mutationFn: ({ key, ...payload }: { key: string } & UpdateSystemConfigPayload) =>
      systemConfigService.update(key, payload),
    onSuccess: () => {
      afterWrite();
      showToast('success', 'Đã lưu cấu hình và ghi nhật ký');
    },
    onError: toastUnlessInline,
  });
};

export const useResetSystemConfig = () => {
  const afterWrite = useAfterWrite();
  return useMutation({
    mutationFn: ({ key, ...payload }: { key: string } & ResetSystemConfigPayload) =>
      systemConfigService.reset(key, payload),
    onSuccess: () => {
      afterWrite();
      showToast('success', 'Đã khôi phục mặc định và ghi nhật ký');
    },
    onError: toastUnlessInline,
  });
};
