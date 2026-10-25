import { memo } from 'react';

import { Badge, Text } from '@/shared/ui';
import { formatDate, formatNumber, statusBadge } from '@/shared/utils/format';
import { AuditTrailPanel } from '@/shared/widgets/audit-trail';

import {
  liveQuizEndReasonLabel,
  LIVE_QUIZ_PLAYERS_MAX,
} from '../constants/live-quiz-ops.constants';
import type { AdminLiveQuizSessionDetail } from '../types/live-quiz-ops.types';
import { progressLabel, shortId } from '../utils/live-quiz-ops.utils';
import LiveQuizEndSession from './LiveQuizEndSession';
import LiveQuizResultsTable from './LiveQuizResultsTable';

const when = (iso: string | null) => (iso ? formatDate(iso, 'HH:mm:ss DD/MM/YYYY') : '—');

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption-12 text-fg-4">{label}</dt>
      <dd className="break-words text-body-14 text-fg-1">{value}</dd>
    </div>
  );
}

/** Vì sao chưa có bảng kết quả — nói đúng theo trạng thái thay vì một câu "chưa có dữ liệu" chung chung. */
function noResultsNote(session: AdminLiveQuizSessionDetail): string {
  if (session.status === 'CANCELLED') return 'Phiên đã huỷ nên không lưu bảng kết quả.';
  if (session.status === 'FINISHED') return 'Kết quả đang được tổng hợp, sẽ hiện sau ít phút.';
  return 'Phiên chưa kết thúc nên chưa có bảng kết quả.';
}

export interface LiveQuizSessionBodyProps {
  session: AdminLiveQuizSessionDetail;
}

/**
 * Thân ngăn kéo phiên (admin.md p5-01 §2.2): tổng quan, hành động kết thúc khẩn cấp, bảng kết quả bền, nhật ký. BE chỉ trả metadata —
 * KHÔNG có PIN, nội dung câu hỏi hay đáp án từng người, nên màn này cũng không có.
 */
const LiveQuizSessionBody = memo(function LiveQuizSessionBody({
  session,
}: LiveQuizSessionBodyProps) {
  const status = statusBadge('liveQuiz', session.status);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-body-16-semibold text-fg-1">{session.setTitle}</div>
          <Text size="small" skin="muted">
            Bộ câu hỏi {shortId(session.setId)}
          </Text>
        </div>
        <Badge color={status.variant} variant="tinted">
          {status.label}
        </Badge>
      </div>

      <dl className="grid grid-cols-2 gap-3">
        <Fact label="Tạo lúc" value={when(session.createdAt)} />
        <Fact label="Bắt đầu lúc" value={when(session.startedAt)} />
        <Fact label="Kết thúc lúc" value={when(session.endedAt)} />
        <Fact label="Lý do kết thúc" value={liveQuizEndReasonLabel(session.endReason)} />
        <Fact
          label="Người chơi"
          value={`${formatNumber(session.playersCount)} / ${LIVE_QUIZ_PLAYERS_MAX}`}
        />
        <Fact label="Câu hỏi" value={progressLabel(session)} />
        <Fact label="Tự chuyển câu" value={session.autoAdvance ? 'Bật' : 'Tắt'} />
        <Fact label="Người tổ chức" value={shortId(session.hostId)} />
        <Fact
          label="Workspace"
          value={session.workspaceId ? shortId(session.workspaceId) : 'Không thuộc nhóm nào'}
        />
        <Fact label="Kết quả đã lưu lúc" value={when(session.resultsPersistedAt)} />
      </dl>

      <LiveQuizEndSession session={session} />

      <div className="flex flex-col gap-1">
        <Text size="small" weight="medium">
          Bảng kết quả
        </Text>
        {session.results.length > 0 ? (
          <LiveQuizResultsTable rows={session.results} />
        ) : (
          <Text size="small" skin="muted">
            {noResultsNote(session)}
          </Text>
        )}
        <Text size="small" skin="muted">
          Vì quyền riêng tư, trang quản trị không hiển thị mã PIN, nội dung câu hỏi hay đáp án từng
          người.
        </Text>
      </div>

      <div className="flex flex-col gap-1">
        <Text size="small" weight="medium">
          Nhật ký
        </Text>
        <AuditTrailPanel targetId={session.id} targetType="LiveQuizSession" />
      </div>
    </div>
  );
});

export default LiveQuizSessionBody;
