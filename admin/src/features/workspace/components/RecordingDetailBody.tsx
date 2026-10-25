import { memo } from 'react';

import { Badge, Button, Callout, CopyableText, Text, Tooltip } from '@/shared/ui';
import { formatDate, formatFileSize, formatNumber, statusBadge } from '@/shared/utils/format';
import { AuditTrailPanel } from '@/shared/widgets/audit-trail';

import {
  RECORDING_LAYOUT_LABELS,
  RECORDING_STOP_REASON_LABELS,
} from '../constants/workspace-recordings.constants';
import type { AdminRecordingDetail, AdminRecordingRow } from '../types/workspace-recordings.types';
import {
  deleteBlockedReason,
  formatRecordingDuration,
  objectStatusOf,
  retentionLabel,
} from '../utils/workspace-recordings.utils';

const TIME_FORMAT = 'HH:mm DD/MM/YYYY';
const DASH = '—';
const when = (iso: string | null): string => (iso ? formatDate(iso, TIME_FORMAT) : DASH);

/** Một cặp nhãn/giá trị của ngăn kéo; `mono` = mã/ID bấm để chép (không có giá trị → `—`). */
const Fact = memo(function Fact({
  label,
  value,
  note,
  mono = false,
}: {
  label: string;
  value: string;
  note?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-body-13 text-fg-3">{label}</dt>
      <dd className="min-w-0 text-body-14 text-fg-1">
        {mono && value ? <CopyableText label={label.toLowerCase()} value={value} /> : value || DASH}
      </dd>
      {note && <dd className="text-caption-12 text-fg-4">{note}</dd>}
    </div>
  );
});

export interface RecordingDetailBodyProps {
  rec: AdminRecordingDetail;
  canDelete: boolean;
  onDelete: (row: AdminRecordingRow) => void;
}

/**
 * Nội dung ngăn kéo bản ghi hình (admin.md p2-06 §2.3): metadata vận hành, lỗi đã làm sạch, khoá object che một phần + trạng thái tệp (HEAD),
 * nút Xoá (chỉ `admin`, tắt kèm lý do khi còn đang ghi) và nhật ký (`AuditTrailPanel` target `MeetingRecording`). KHÔNG có phát/tải/xem trước và
 * KHÔNG liệt kê tên người đồng ý — chỉ `consentCount` (D-24).
 */
const RecordingDetailBody = memo(function RecordingDetailBody({
  rec,
  canDelete,
  onDelete,
}: RecordingDetailBodyProps) {
  const badge = statusBadge('recording', rec.status);
  const object = objectStatusOf(rec, formatFileSize);
  const blocked = deleteBlockedReason(rec);
  const deleteButton = (
    <Button
      disabled={blocked !== null}
      size="sm"
      skin="danger"
      variant="stroke"
      onClick={() => onDelete(rec)}
    >
      Xoá bản ghi
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge color={badge.variant} variant="tinted">
          {badge.label}
        </Badge>
        <Badge color="neutral" variant="tinted">
          {`Bố cục: ${RECORDING_LAYOUT_LABELS[rec.layout]}`}
        </Badge>
      </div>

      {rec.deletedAt && (
        <Callout
          description={rec.deleteReason ? `Lý do: ${rec.deleteReason}` : undefined}
          intent="neutral"
          title={`Đã xoá lúc ${when(rec.deletedAt)}`}
        />
      )}
      {rec.error && (
        <Callout description={rec.error} intent="error" title="Lỗi khi ghi hoặc xử lý bản ghi" />
      )}

      <dl className="grid grid-cols-2 gap-3">
        <Fact label="Workspace" value={rec.workspace.name ?? DASH} />
        <Fact label="Người bắt đầu" value={rec.startedBy.name ?? DASH} />
        <Fact label="Bắt đầu ghi" value={when(rec.startedAt)} />
        <Fact label="Dừng ghi" value={when(rec.stoppedAt)} />
        <Fact label="Người dừng" value={rec.stoppedBy?.name ?? DASH} />
        <Fact
          label="Lý do dừng"
          value={rec.stopReason ? RECORDING_STOP_REASON_LABELS[rec.stopReason] : DASH}
        />
        <Fact label="Thời lượng" value={formatRecordingDuration(rec.durationSec)} />
        <Fact
          label="Dung lượng"
          value={rec.fileSizeBytes === null ? DASH : formatFileSize(rec.fileSizeBytes)}
        />
        <Fact
          label="Số người đã đồng ý"
          note="Chỉ đếm số người, không nêu tên"
          value={formatNumber(rec.consentCount)}
        />
        <Fact
          label="Hạn lưu trữ"
          value={
            rec.retentionExpiresAt
              ? `${formatDate(rec.retentionExpiresAt)} · ${retentionLabel(rec)}`
              : DASH
          }
        />
        <Fact label="Mã bản ghi" mono value={rec.id} />
        <Fact label="Mã cuộc họp" mono value={rec.meeting.id} />
        <Fact label="Mã cuộc gọi" mono value={rec.callId} />
        <Fact label="Mã egress" mono value={rec.egressId ?? ''} />
      </dl>

      <section className="flex flex-col gap-2">
        <Text weight="bold">Lưu trữ</Text>
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={object.tone} variant="tinted">
            {object.label}
          </Badge>
          <span className="truncate font-mono text-caption-12 text-fg-3">
            {rec.storageKeyMasked}
          </span>
        </div>
        <Text size="tiny" skin="muted">
          Đường dẫn được che một phần; quản trị viên không có đường dẫn tải hay phát bản ghi.
        </Text>
      </section>

      {canDelete && !rec.deletedAt && (
        <div>
          {blocked ? (
            <Tooltip content={blocked}>
              <span className="inline-flex">{deleteButton}</span>
            </Tooltip>
          ) : (
            deleteButton
          )}
        </div>
      )}

      <section className="flex flex-col gap-2">
        <Text weight="bold">Nhật ký</Text>
        <AuditTrailPanel targetId={rec.id} targetType="MeetingRecording" />
      </section>
    </div>
  );
});

export default RecordingDetailBody;
