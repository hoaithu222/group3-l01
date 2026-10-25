import { useState } from 'react';

import type { ReportRequest } from '@/shared/stores/moderation-intent.store';

import type { CreateReportPayload, CreateReportResult, ReportReason } from '../api/moderation.types';
import { reportFormSchema } from '../schemas/moderation.schemas';
import { useBlockUser } from '../queries/blocks.queries';
import { useCreateReport } from '../queries/reports.queries';
import { reportSubmitErrorMessage } from '../utils/moderation-errors';

/** Người sẽ bị chặn nếu tick "Chặn người này" — tin: tác giả; người dùng: chính họ; kênh/nhóm chat: không có. */
export function blockTargetOf(request: ReportRequest): string | null {
  if (request.targetType === 'MESSAGE') return request.authorId;
  if (request.targetType === 'USER') return request.targetId;
  return null;
}

/** Payload `POST /reports` — `description` rỗng thì BỎ HẲN (BE coi rỗng và vắng mặt như nhau, nhưng gọn hơn). */
export function buildReportPayload(
  request: ReportRequest,
  values: { reason: ReportReason; description: string },
): CreateReportPayload {
  return {
    targetType: request.targetType,
    targetId: request.targetId,
    reason: values.reason,
    ...(values.description ? { description: values.description } : {}),
    ...(request.targetType === 'USER' && request.contextWorkspaceId
      ? { contextWorkspaceId: request.contextWorkspaceId }
      : {}),
  };
}

export interface ReportOutcome {
  report: CreateReportResult;
  /** `'done'` = đã chặn · `'failed'` = báo cáo xong nhưng chặn thất bại · `'none'` = không yêu cầu chặn. */
  block: 'done' | 'failed' | 'none';
}

/**
 * Trạng thái + luồng gửi của `ReportSheet` (app.md p1-08 §3–§4): chọn lý do → mô tả → (tuỳ chọn) chặn
 * → gửi. `alsoBlock` gọi TIẾP `POST /me/blocks` SAU khi báo cáo thành công — chặn hỏng không được làm
 * mất báo cáo đã gửi, nên hiện riêng ở biên nhận (`block: 'failed'`).
 *
 * `canSubmit` chạy đúng luật của BE bằng Zod ngay trên máy: `OTHER` mà mô tả < 10 ký tự thì nút Gửi
 * khoá, thay vì đợi 400 `VAL_001`.
 */
export function useReportForm(request: ReportRequest) {
  const createReport = useCreateReport();
  const blockUser = useBlockUser();

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ReportOutcome | null>(null);

  const parsed = reason ? reportFormSchema.safeParse({ reason, description }) : null;
  const canSubmit = parsed?.success === true && !createReport.isPending;
  /** Chỉ báo lỗi mô tả KHI ĐÃ CHỌN lý do (chưa chọn gì thì chưa có gì để mắng). */
  const descriptionError =
    parsed && !parsed.success ? parsed.error.issues.find((issue) => issue.path[0] === 'description')?.message : undefined;

  async function submit(): Promise<void> {
    if (!parsed?.success) return;
    setErrorMessage(null);

    let report: CreateReportResult;
    try {
      report = await createReport.mutateAsync(buildReportPayload(request, parsed.data));
    } catch (error) {
      setErrorMessage(reportSubmitErrorMessage(error));
      return;
    }

    const blockTarget = blockTargetOf(request);
    if (!alsoBlock || !blockTarget) {
      setOutcome({ report, block: 'none' });
      return;
    }
    try {
      await blockUser.mutateAsync(blockTarget);
      setOutcome({ report, block: 'done' });
    } catch {
      setOutcome({ report, block: 'failed' });
    }
  }

  return {
    reason,
    setReason,
    description,
    setDescription,
    alsoBlock,
    setAlsoBlock,
    canBlock: blockTargetOf(request) !== null,
    canSubmit,
    descriptionError,
    isSubmitting: createReport.isPending || blockUser.isPending,
    errorMessage,
    outcome,
    submit,
  };
}
