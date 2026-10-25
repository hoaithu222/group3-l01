import { memo } from 'react';

import { ConfirmWithReasonModal } from '@/shared/ui';

import { useRequeueOutbox } from '../service/jobs.queries';
import type { OutboxEvent } from '../types/jobs.types';
import { tolerateStaleJob } from '../utils/job-errors';

export interface OutboxRequeueModalProps {
  event: OutboxEvent;
  onClose: () => void;
}

/** Xác nhận CÓ LÝ DO cho "Đưa lại hàng đợi" (admin.md p0-04 §2.4). Mount khi có thao tác chờ. */
const OutboxRequeueModal = memo(function OutboxRequeueModal({
  event,
  onClose,
}: OutboxRequeueModalProps) {
  const requeue = useRequeueOutbox();

  return (
    <ConfirmWithReasonModal
      confirmLabel="Đưa lại hàng đợi"
      impact={
        <div className="flex flex-col gap-1">
          <span>
            Sự kiện được đặt lại về &ldquo;Chờ gửi&rdquo; với số lần thử về 0 và sẽ được gửi vào
            hàng đợi ngay.
          </span>
          <span className="font-mono text-caption-12 text-fg-3">
            {event.type} · {event.id}
          </span>
        </div>
      }
      open
      title="Đưa sự kiện outbox về hàng đợi"
      onConfirm={async (reason) => {
        await tolerateStaleJob(() => requeue.mutateAsync({ id: event.id, reason }));
      }}
      onOpenChange={(next) => !next && onClose()}
    />
  );
});

export default OutboxRequeueModal;
