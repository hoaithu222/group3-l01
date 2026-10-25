import { useState } from 'react';

import { showToast } from '@/shared/utils/toast.utils';

import type { QueueScope, ResolveAction } from '../api/moderation.types';
import { useResolveReport } from '../queries/reports.queries';
import { resolveReasonSchema } from '../schemas/moderation.schemas';
import { isAlreadyResolved, resolveErrorMessage } from '../utils/moderation-errors';

/**
 * Luồng XỬ LÝ một nhóm báo cáo trong `ReportReviewSheet`: chọn hành động → nhập lý do (≥ 10 ký tự, khớp
 * `reasonSchema` của BE) → xác nhận → `POST /reports/:id/resolve` (đóng CẢ NHÓM).
 *
 * `MOD_001` (người khác đã đóng trước) không phải "thất bại" của người dùng: báo nhẹ, đóng tấm, và
 * `useResolveReport` đã làm mới hàng đợi — nhóm sẽ tự sang tab kết quả.
 */
export function useResolveFlow(reportId: string, scope: QueueScope, onClose: () => void) {
  const resolve = useResolveReport(scope);
  const [action, setAction] = useState<ResolveAction | null>(null);
  const [reason, setReason] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const parsed = resolveReasonSchema.safeParse(reason);
  const canConfirm = action !== null && parsed.success && !resolve.isPending;
  /** Chỉ mắng khi người dùng ĐÃ gõ gì đó — ô trống chưa phải lỗi. */
  const reasonError = reason.length > 0 && !parsed.success ? parsed.error.issues[0]?.message : undefined;

  function choose(next: ResolveAction): void {
    setAction(next);
    setReason('');
    setErrorMessage(null);
  }

  function back(): void {
    setAction(null);
    setErrorMessage(null);
  }

  function confirm(): void {
    if (!action || !parsed.success) return;
    setErrorMessage(null);
    resolve.mutate(
      { reportId, action, reason: parsed.data },
      {
        onSuccess: () => {
          showToast('success', 'Đã xử lý báo cáo');
          onClose();
        },
        onError: (error) => {
          if (isAlreadyResolved(error)) {
            showToast('info', resolveErrorMessage(error));
            onClose();
            return;
          }
          setErrorMessage(resolveErrorMessage(error));
        },
      },
    );
  }

  return {
    action,
    reason,
    setReason,
    reasonError,
    errorMessage,
    canConfirm,
    isPending: resolve.isPending,
    choose,
    back,
    confirm,
  };
}
