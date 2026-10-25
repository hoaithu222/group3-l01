import { memo } from 'react';
import { Link } from 'react-router-dom';

import { useFeature } from '@/app/capabilities';
import { Badge, Button, Callout, Text } from '@/shared/ui';
import { formatDate, formatFileSize, statusBadge } from '@/shared/utils/format';
import { AuditTrailPanel } from '@/shared/widgets/audit-trail';

import {
  MEETING_END_REASON_LABELS,
  MEETING_PLATFORM_LABELS,
  VOICE_FEATURE_FLAG,
} from '../../constants/meeting.constants';
import type { AdminMeetingDetail } from '../../types/meeting.types';
import {
  canForceEndMeeting,
  formatCount,
  formatDurationSec,
  formatMeetingTimes,
  meetingOpsPath,
  TIME_FORMAT,
} from '../../utils/meeting-ops.utils';
import Fact from '../common/Fact';
import type { ForceEndMeetingModalProps } from '../common/ForceEndMeetingModal';
import MeetingSessionsTable from './MeetingSessionsTable';

const LINK_CLASS = 'text-body-14 text-link hover:underline';

export interface MeetingDrawerBodyProps {
  meeting: AdminMeetingDetail;
  /** Có `meeting:update` — thiếu thì KHÔNG có nút "Kết thúc khẩn cấp". */
  canForceEnd: boolean;
  onForceEnd: (target: NonNullable<ForceEndMeetingModalProps['meeting']>) => void;
}

/**
 * Nội dung ngăn kéo cuộc họp (admin.md p2-07 §2.2): tổng quan (khi LIVE: phiên hiện tại, số người đang kết nối, khoá phòng), phiên họp (+ liên kết
 * "Xem cuộc gọi" khi cờ `voice` bật), ghi hình (số sẵn sàng/lỗi + dung lượng, liên kết sang tab Ghi hình đã lọc theo cuộc họp), nút "Kết thúc khẩn cấp" và
 * nhật ký (`AuditTrailPanel` target `Meeting`). KHÔNG có agenda/địa điểm/link phòng/tên người tham dự/biên bản (BE không trả, OPC-05).
 */
const MeetingDrawerBody = memo(function MeetingDrawerBody({
  meeting,
  canForceEnd,
  onForceEnd,
}: MeetingDrawerBodyProps) {
  const voiceOff = useFeature(VOICE_FEATURE_FLAG) === false;
  const badge = statusBadge('meeting', meeting.status);
  const { main, zoned } = formatMeetingTimes(meeting);
  const live = meeting.currentSession;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge color={badge.variant} variant="tinted">
          {badge.label}
        </Badge>
        <Badge color="neutral" variant="tinted">
          {MEETING_PLATFORM_LABELS[meeting.platform]}
        </Badge>
        {meeting.status === 'ENDED' && meeting.endReason && (
          <Badge color="neutral" variant="tinted">
            {MEETING_END_REASON_LABELS[meeting.endReason]}
          </Badge>
        )}
      </div>

      {live && (
        <Callout
          description={`Bắt đầu lúc ${formatDate(live.startedAt, TIME_FORMAT)}${live.lockedAt ? ' · Phòng đang được khoá, không nhận thêm người' : ''}.`}
          icon="users-bold"
          intent="success"
          title={`Đang họp — ${formatCount(live.connectedCount)} người đang kết nối`}
        />
      )}

      <dl className="grid grid-cols-2 gap-3">
        <Fact label="Workspace" value={meeting.workspace.name ?? ''} />
        <Fact label="Chủ trì" value={meeting.host.name ?? ''} />
        <Fact label="Thời gian" note={zoned ?? undefined} value={main} />
        <Fact label="Số người dự kiến" value={formatCount(meeting.attendeeCount)} />
        <Fact label="Số phiên" value={formatCount(meeting.sessionCount)} />
        <Fact label="Tổng thời lượng" value={formatDurationSec(meeting.totalDurationSec)} />
        <Fact label="Mã họp" mono value={meeting.code} />
        <Fact label="Mã cuộc họp" mono value={meeting.id} />
      </dl>

      {canForceEnd && canForceEndMeeting(meeting.status) && (
        <div>
          <Button
            size="sm"
            skin="danger"
            variant="stroke"
            onClick={() =>
              onForceEnd({
                id: meeting.id,
                title: meeting.title,
                connectedCount: live?.connectedCount,
              })
            }
          >
            Kết thúc khẩn cấp
          </Button>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Text weight="bold">{`Phiên họp (${formatCount(meeting.sessions.length)})`}</Text>
          {!voiceOff && meeting.sessions.length > 0 && (
            <Link
              className={LINK_CLASS}
              to={meetingOpsPath({ tab: 'calls', meetingId: meeting.id })}
            >
              Xem cuộc gọi
            </Link>
          )}
        </div>
        <MeetingSessionsTable sessions={meeting.sessions} />
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Text weight="bold">Ghi hình</Text>
          {meeting.recordings.ready + meeting.recordings.failed > 0 && (
            <Link
              className={LINK_CLASS}
              to={meetingOpsPath({
                tab: 'recordings',
                workspaceId: meeting.workspace.id,
                meetingId: meeting.id,
              })}
            >
              Xem ghi hình của cuộc họp
            </Link>
          )}
        </div>
        <dl className="grid grid-cols-3 gap-3">
          <Fact label="Sẵn sàng" value={formatCount(meeting.recordings.ready)} />
          <Fact label="Lỗi" value={formatCount(meeting.recordings.failed)} />
          <Fact label="Dung lượng" value={formatFileSize(meeting.recordings.totalBytes)} />
        </dl>
      </section>

      <section className="flex flex-col gap-2">
        <Text weight="bold">Nhật ký</Text>
        <AuditTrailPanel targetId={meeting.id} targetType="Meeting" />
      </section>
    </div>
  );
});

export default MeetingDrawerBody;
