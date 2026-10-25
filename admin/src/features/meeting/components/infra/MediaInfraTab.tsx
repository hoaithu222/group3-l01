import { memo } from 'react';
import { Link } from 'react-router-dom';

import { Button, Callout } from '@/shared/ui';
import { formatDate, formatRelativeTime } from '@/shared/utils/format';

import { TURN_NO_PROBE_TEXT } from '../../constants/media-health.constants';
import { NO_DATA } from '../../constants/meeting.constants';
import { useMediaHealth } from '../../service/meeting.queries';
import { formatCount, meetingOpsPath } from '../../utils/meeting-ops.utils';
import { overallViewOf } from '../../utils/media-health.utils';
import MediaLoadError from '../common/MediaLoadError';
import MediaHealthBlock from './MediaHealthBlock';
import type { MediaHealthRow } from './MediaHealthBlock';

const num = (value: number | undefined): string =>
  value === undefined ? NO_DATA : formatCount(value);
const ago = (iso: string | undefined): string => (iso ? formatRelativeTime(iso) : NO_DATA);

/**
 * Tab "Hạ tầng media" (admin.md p2-07 §2.5) — CHỈ ĐỌC `GET /admin/media/health`: khung tổng trạng thái (LiveKit DOWN → đỏ "cuộc gọi mới sẽ thất bại"), rồi
 * các khối LiveKit, Egress, Webhook, TURN, Hàng đợi. Mỗi khối có trạng thái + lỗi riêng nên một phần hỏng KHÔNG làm vỡ trang (OPC-07). Không lộ URL/khoá:
 * BE trả lỗi đã làm sạch. Tự làm mới ~15 giây (khớp cache BE) + nút "Làm mới"; refetch lỗi giữ số liệu cũ kèm cảnh báo.
 */
const MediaInfraTab = memo(function MediaInfraTab() {
  const health = useMediaHealth();
  const { data } = health;

  if (!data) {
    return health.error ? (
      <MediaLoadError
        error={health.error}
        title="Không tải được tình trạng hạ tầng media"
        onRetry={() => void health.refetch()}
      />
    ) : (
      <Callout description="Đang kiểm tra hạ tầng media…" intent="neutral" variant="ghost" />
    );
  }

  const overall = overallViewOf(data);
  const { livekit, egress, webhook, turn, queues } = data;
  const failed24h = egress.failed24h;

  const egressRows: MediaHealthRow[] = [
    { label: 'Đang ghi hình', value: num(egress.active) },
    {
      label: 'Lỗi 24 giờ',
      value:
        failed24h !== undefined && failed24h > 0 ? (
          <Link
            className="text-link hover:underline"
            to={meetingOpsPath({ tab: 'recordings', recStatus: 'FAILED' })}
          >
            {`${formatCount(failed24h)} — xem bản lỗi`}
          </Link>
        ) : (
          num(failed24h)
        ),
    },
  ];
  const turnRows: MediaHealthRow[] = [
    { label: 'Lần thăm dò gần nhất', value: ago(turn.lastProbeAt) },
    {
      label: 'Kết quả',
      value:
        turn.lastProbeOk === undefined ? NO_DATA : turn.lastProbeOk ? 'Thành công' : 'Thất bại',
    },
  ];
  const noProbe = turn.status === 'UNKNOWN' && !turn.lastProbeAt;

  return (
    <div className="flex flex-col gap-3">
      <Callout
        action={
          <Button
            disabled={health.isFetching}
            loading={health.isFetching}
            size="sm"
            variant="stroke"
            onClick={() => void health.refetch()}
          >
            Làm mới
          </Button>
        }
        description={`${overall.description} Kiểm tra lúc ${formatDate(data.checkedAt, 'HH:mm:ss DD/MM/YYYY')}.`}
        intent={overall.intent}
        title={overall.title}
      />
      {health.isRefetchError && (
        <Callout
          description="Không làm mới được — đang hiện số liệu của lần kiểm tra trước."
          intent="warning"
          variant="ghost"
        />
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <MediaHealthBlock
          error={livekit.error}
          rows={[
            {
              label: 'Độ trễ',
              value:
                livekit.latencyMs === undefined ? NO_DATA : `${formatCount(livekit.latencyMs)} ms`,
            },
            { label: 'Số phòng', value: num(livekit.rooms) },
            { label: 'Số người', value: num(livekit.participants) },
          ]}
          status={livekit.status}
          title="LiveKit"
        />
        <MediaHealthBlock
          error={egress.error}
          rows={egressRows}
          status={egress.status}
          title="Ghi hình (Egress)"
        />
        <MediaHealthBlock
          rows={[
            { label: 'Lần nhận gần nhất', value: ago(webhook.lastReceivedAt) },
            { label: 'Nhận trong 1 giờ', value: formatCount(webhook.received1h) },
            { label: 'Lỗi trong 1 giờ', value: formatCount(webhook.failed1h) },
          ]}
          status={webhook.status}
          title="Webhook"
        />
        <MediaHealthBlock
          error={turn.error}
          note={noProbe ? TURN_NO_PROBE_TEXT : undefined}
          rows={turnRows}
          status={turn.status}
          title="TURN"
        />
        {(['calls', 'media'] as const).map((name) => {
          const q = queues[name];
          return (
            <MediaHealthBlock
              key={name}
              error={q.error}
              rows={[
                { label: 'Đang chờ', value: q.error ? NO_DATA : formatCount(q.waiting) },
                { label: 'Hẹn giờ', value: q.error ? NO_DATA : formatCount(q.delayed) },
                { label: 'Lỗi', value: q.error ? NO_DATA : formatCount(q.failed) },
              ]}
              title={`Hàng đợi ${name}`}
            />
          );
        })}
      </div>
    </div>
  );
});

export default MediaInfraTab;
