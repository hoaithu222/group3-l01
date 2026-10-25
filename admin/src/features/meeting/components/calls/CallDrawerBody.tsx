import { memo } from 'react';
import { Link } from 'react-router-dom';

import { Badge, Button, Callout, Text } from '@/shared/ui';
import { formatDate, statusBadge } from '@/shared/utils/format';
import { AuditTrailPanel } from '@/shared/widgets/audit-trail';

import {
  CALL_MEDIA_LABELS,
  CALL_MODE_LABELS,
  CALL_PARTICIPANT_STAT_LABELS,
  CALL_SCOPE_LABELS,
} from '../../constants/call.constants';
import type { AdminCallDetail, AdminCallRow } from '../../types/call.types';
import { canForceEndCall } from '../../utils/call-ops.utils';
import {
  formatCount,
  formatDurationSec,
  formatRate,
  meetingOpsPath,
  TIME_FORMAT,
} from '../../utils/meeting-ops.utils';
import Fact from '../common/Fact';

const when = (iso?: string): string => (iso ? formatDate(iso, TIME_FORMAT) : '');

export interface CallDrawerBodyProps {
  call: AdminCallDetail;
  /** Có `meeting:update` — thiếu thì KHÔNG có nút "Kết thúc khẩn cấp". */
  canForceEnd: boolean;
  onForceEnd: (target: Pick<AdminCallRow, 'id' | 'label' | 'peakParticipants'>) => void;
}

/**
 * Nội dung ngăn kéo cuộc gọi (admin.md p2-07 §2.3): metadata + nhãn ĐÃ CHE, `participantStats` (chỉ SỐ ĐẾM theo trạng thái: được mời, trả lời, kết
 * nối, nhỡ, từ chối, bận, bị mời ra), `setup` (tỉ lệ kết nối ≤ 20 giây), "Phòng LiveKit còn mở", nút "Kết thúc khẩn cấp" (chưa kết thúc và không thuộc
 * cuộc họp) và nhật ký (`AuditTrailPanel` target `Call`). KHÔNG có danh tính người tham gia (OPC-05).
 */
const CallDrawerBody = memo(function CallDrawerBody({
  call,
  canForceEnd,
  onForceEnd,
}: CallDrawerBodyProps) {
  const status = statusBadge('call', call.status);
  const endReason = call.endReason ? statusBadge('callEndReason', call.endReason) : null;
  const { attempts, successWithin20s } = call.setup;
  const roomText = call.roomActive === undefined ? '' : call.roomActive ? 'Có' : 'Không';
  // Đang ACTIVE mà phòng media không còn: dấu hiệu phòng treo (kịch bản trực ca) — gợi ý kết thúc.
  const suspectStuck = call.status === 'ACTIVE' && call.roomActive === false;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge color={status.variant} variant="tinted">
          {status.label}
        </Badge>
        {endReason && (
          <Badge color={endReason.variant} variant="tinted">
            {endReason.label}
          </Badge>
        )}
        <Badge color="neutral" variant="tinted">
          {`${CALL_MODE_LABELS[call.mode]} · ${CALL_MEDIA_LABELS[call.mediaKind]}`}
        </Badge>
      </div>

      {suspectStuck && (
        <Callout
          description="Cuộc gọi đang diễn ra nhưng phòng LiveKit không còn mở — có thể là cuộc gọi treo. Cân nhắc kết thúc khẩn cấp."
          intent="warning"
          title="Phòng media không còn"
        />
      )}

      <dl className="grid grid-cols-2 gap-3">
        <Fact label="Cuộc gọi" value={call.label} />
        <Fact label="Phạm vi" value={CALL_SCOPE_LABELS[call.scopeType]} />
        <Fact label="Workspace" value={call.workspace?.name ?? ''} />
        <Fact label="Kênh" value={call.channel?.name ?? ''} />
        <Fact label="Bắt đầu" value={when(call.startedAt)} />
        <Fact label="Kết thúc" value={when(call.endedAt)} />
        <Fact label="Thời lượng" value={formatDurationSec(call.durationSec)} />
        <Fact label="Tối đa người cùng lúc" value={formatCount(call.peakParticipants)} />
        <Fact label="Phòng LiveKit còn mở" value={roomText} />
        <Fact label="Mã cuộc gọi" mono value={call.id} />
      </dl>

      {call.meeting && (
        <Link
          className="text-body-14 text-link hover:underline"
          to={meetingOpsPath({ tab: 'meetings', id: call.meeting.id })}
        >
          {`Mở cuộc họp "${call.meeting.title}"`}
        </Link>
      )}

      <section className="flex flex-col gap-2">
        <Text weight="bold">Người tham gia (chỉ số đếm)</Text>
        <dl className="grid grid-cols-4 gap-3">
          {CALL_PARTICIPANT_STAT_LABELS.map(([key, label]) => (
            <Fact key={key} label={label} value={formatCount(call.participantStats[key])} />
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-2">
        <Text weight="bold">Kết nối</Text>
        <dl className="grid grid-cols-3 gap-3">
          <Fact label="Số lần kết nối" value={formatCount(attempts)} />
          <Fact label="Kết nối ≤ 20 giây" value={formatCount(successWithin20s)} />
          <Fact
            label="Tỉ lệ kết nối ≤ 20 giây"
            value={formatRate(attempts > 0 ? successWithin20s / attempts : null)}
          />
        </dl>
      </section>

      {canForceEnd && canForceEndCall(call) && (
        <div>
          <Button
            size="sm"
            skin="danger"
            variant="stroke"
            onClick={() =>
              onForceEnd({
                id: call.id,
                label: call.label,
                peakParticipants: call.peakParticipants,
              })
            }
          >
            Kết thúc khẩn cấp
          </Button>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <Text weight="bold">Nhật ký</Text>
        <AuditTrailPanel targetId={call.id} targetType="Call" />
      </section>
    </div>
  );
});

export default CallDrawerBody;
