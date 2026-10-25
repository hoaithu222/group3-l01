import { memo } from 'react';
import type { ReactNode } from 'react';

import { Badge, Button, Callout, CopyableText, Drawer, JsonViewer, Text } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import type { FailedJob, FailedJobAction } from '../types/jobs.types';
import { formatEpoch, isTruncatedPreview } from '../utils/jobs-format';

export interface FailedJobDrawerProps {
  /** `null` = đóng — `open` suy từ đây, một nguồn sự thật duy nhất. */
  job: FailedJob | null;
  /** Có `system-config:update` — thiếu thì không có nút hành động nào. */
  canUpdate: boolean;
  onClose: () => void;
  onAction: (job: FailedJob, action: FailedJobAction) => void;
}

const Field = memo(function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Text size="tiny" skin="muted">
        {label}
      </Text>
      <div className="min-w-0 text-body-14 text-fg-1">{children}</div>
    </div>
  );
});

/**
 * Ngăn kéo chi tiết 1 job lỗi: lý do lỗi đầy đủ + payload ĐÃ CHE.
 *
 * ⛔ `dataPreview` là thứ BE đã che (`maskPayload`) — hiện NGUYÊN VĂN, không tìm
 * cách "giải che" hay suy đoán giá trị `***`. Nút hành động nằm ở footer; hộp
 * xác nhận có lý do do component cha dựng (dùng chung với nút ở hàng bảng).
 */
const FailedJobDrawer = memo(function FailedJobDrawer({
  job,
  canUpdate,
  onClose,
  onAction,
}: FailedJobDrawerProps) {
  return (
    <Drawer
      description={job?.queue}
      footer={
        job && canUpdate ? (
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              skin="danger"
              startIcon={<SystemIcon name="trash-can-outline" size={14} />}
              variant="stroke"
              onClick={() => onAction(job, 'remove')}
            >
              Gỡ bỏ
            </Button>
            <Button
              size="sm"
              startIcon={<SystemIcon name="arrows-rotate-outline" size={14} />}
              onClick={() => onAction(job, 'retry')}
            >
              Chạy lại
            </Button>
          </div>
        ) : undefined
      }
      open={job !== null}
      size="lg"
      title={job ? `Job lỗi — ${job.name}` : 'Chi tiết job lỗi'}
      onOpenChange={(open) => !open && onClose()}
    >
      {job && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Hàng đợi">
              <Badge size="sm" variant="tinted">
                {job.queue}
              </Badge>
            </Field>
            <Field label="Số lần thử">
              <span className="tabular-nums">{job.attemptsMade}</span>
            </Field>
            <Field label="Tạo lúc">
              <span className="tabular-nums">{formatEpoch(job.timestamp)}</span>
            </Field>
            <Field label="Lỗi lúc">
              <span className="tabular-nums">{formatEpoch(job.finishedOn)}</span>
            </Field>
          </div>
          <Field label="Job ID">
            <CopyableText label="Job ID" value={job.jobId} />
          </Field>
          <Field label="Lý do lỗi">
            <JsonViewer maxHeight={200} value={job.failedReason ?? '(không có thông điệp lỗi)'} />
          </Field>
          <Field label="Dữ liệu job (đã che thông tin nhạy cảm)">
            <div className="flex flex-col gap-2">
              {isTruncatedPreview(job.dataPreview) && (
                <Callout intent="info" title="Dữ liệu lớn hơn 2 KiB — chỉ hiện phần đầu" />
              )}
              <JsonViewer value={job.dataPreview} />
            </div>
          </Field>
        </div>
      )}
    </Drawer>
  );
});

export default FailedJobDrawer;
