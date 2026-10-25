import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getMessageByCode } from '@/core/api/error.handler';
import { showToast } from '@/shared/utils/toast.utils';

import type { TemplateOrderChange, UpdateTemplatePayload } from '../types/templates.types';
import { INLINE_TEMPLATE_ERRORS, templateErrorCode } from '../utils/template-errors';
import { templatesService } from './templates.service';

/** Khoá query — nằm dưới `['system-config']` nên mọi lần ghi cấu hình chung cũng làm mới danh sách mẫu. */
export const templateKeys = {
  list: () => ['system-config', 'templates'] as const,
  detail: (code: string) => ['system-config', 'template', code] as const,
};

export const useWorkspaceTemplates = () =>
  useQuery({
    queryKey: templateKeys.list(),
    queryFn: () => templatesService.list(),
    select: (res) => res.data,
  });

/** Sau khi ghi: làm mới danh sách + nhật ký của mẫu (`AuditTrailPanel targetType="WorkspaceTemplate"`). */
function useAfterWrite() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: templateKeys.list() });
    void qc.invalidateQueries({ queryKey: ['audit-log'] });
  };
}

/** Toast lỗi chung — trừ mã có giao diện riêng (409 banner, 400 gắn ô, 404 đóng ngăn kéo). */
function toastUnlessInline(err: unknown) {
  const code = templateErrorCode(err);
  if (INLINE_TEMPLATE_ERRORS.has(code)) return;
  showToast('error', getMessageByCode(code));
}

export const useUpdateWorkspaceTemplate = () => {
  const afterWrite = useAfterWrite();
  return useMutation({
    mutationFn: ({ code, ...payload }: { code: string } & UpdateTemplatePayload) =>
      templatesService.update(code, payload),
    onSuccess: () => {
      afterWrite();
      showToast('success', 'Đã lưu mẫu và ghi nhật ký');
    },
    onError: toastUnlessInline,
  });
};

/**
 * Lưu thứ tự mới: mỗi mẫu đổi vị trí là MỘT lần `PUT` (BE khoá lạc quan từng mẫu, không có API gộp) — chạy TUẦN TỰ,
 * dừng ở lỗi đầu tiên. Danh sách luôn được tải lại sau đó (kể cả khi dừng giữa chừng) để bảng khớp máy chủ.
 */
export const useReorderTemplates = () => {
  const afterWrite = useAfterWrite();
  return useMutation({
    mutationFn: async ({ changes, reason }: { changes: TemplateOrderChange[]; reason: string }) => {
      for (const { code, order, expectedVersion } of changes) {
        await templatesService.update(code, { order, expectedVersion, reason });
      }
    },
    onSuccess: () => showToast('success', 'Đã lưu thứ tự mẫu và ghi nhật ký'),
    onError: toastUnlessInline,
    onSettled: afterWrite,
  });
};
