import { memo } from 'react';

import { ConfirmWithReasonModal } from '@/shared/ui';

import { FAILED_JOB_ACTION_COPY } from '../constants/jobs.constants';
import { useRemoveJob, useRetryJob } from '../service/jobs.queries';
import type { FailedJob, FailedJobAction } from '../types/jobs.types';
import { tolerateStaleJob } from '../utils/job-errors';

export interface FailedJobActionModalProps {
  job: FailedJob;
  action: FailedJobAction;
  onClose: () => void;
  /** Sau khi thao tác xong (kể cả khi job đã đổi trạng thái) — vd đóng drawer. */
  onDone?: () => void;
}

/**
 * Xác nhận CÓ LÝ DO cho "Chạy lại" / "Gỡ bỏ" (admin.md p0-04 §2.4). Mount khi có
 * thao tác chờ xác nhận, gỡ khi xong — mỗi lần mở là một form sạch.
 */
const FailedJobActionModal = memo(function FailedJobActionModal({
  job,
  action,
  onClose,
  onDone,
}: FailedJobActionModalProps) {
  const retry = useRetryJob();
  const remove = useRemoveJob();
  const copy = FAILED_JOB_ACTION_COPY[action];
  const mutation = action === 'retry' ? retry : remove;

  return (
    <ConfirmWithReasonModal
      confirmLabel={copy.confirm}
      confirmTone={copy.tone}
      impact={
        <div className="flex flex-col gap-1">
          <span>{copy.impact}</span>
          <span className="font-mono text-caption-12 text-fg-3">
            {job.queue} · {job.jobId}
          </span>
        </div>
      }
      open
      title={`${copy.title} — ${job.name}`}
      onConfirm={async (reason) => {
        await tolerateStaleJob(() =>
          mutation.mutateAsync({ queue: job.queue, jobId: job.jobId, reason }),
        );
        onDone?.();
      }}
      onOpenChange={(next) => !next && onClose()}
    />
  );
});

export default FailedJobActionModal;
