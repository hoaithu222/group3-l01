import type { AxiosError } from 'axios';
import { memo } from 'react';
import { Link } from 'react-router-dom';

import { useFeature } from '@/app/capabilities';
import { extractErrorCode } from '@/core/api/error.handler';
import { useQueryParams } from '@/shared/hooks';
import { BoxPanel, Callout, EmptyState, SegmentToggle, SummaryCard } from '@/shared/ui';
import { formatFileSize } from '@/shared/utils/format';

import { useWorkspaceMediaStats } from '../../service/workspace-media-stats.queries';
import { meetingOpsHref } from '../../utils/meeting-ops-link';
import WorkspaceLoadError from '../WorkspaceLoadError';

const NO_DATA = '—';
const DAYS_KEY = 'mediaDays';
const DAY_OPTIONS = [
  { key: '7', label: '7 ngày' },
  { key: '30', label: '30 ngày' },
  { key: '90', label: '90 ngày' },
];
const DEFAULT_DAYS = 30;
/** Cờ tắt giữa chừng (capabilities cache 5 phút) → BE trả 404 với mã này: hiện "đang tắt", không phải lỗi. */
const FEATURE_OFF_CODE = 'CFG_005';
const LINK_CLASS = 'text-body-14 text-link hover:underline';

export interface WorkspaceMediaStatsTabProps {
  workspaceId: string;
}

/**
 * Tab "Cuộc gọi & họp" của `WorkspaceDetailPage` (admin.md p2-07 §2.7): chọn 7/30/90 ngày (`?mediaDays=`, mặc định 30) → thẻ số liệu cuộc họp (đã lên
 * lịch, đã họp, đã huỷ, tổng phút), cuộc gọi (tổng, đổ chuông, phòng, phút) và ghi hình (sẵn sàng, dung lượng), kèm liên kết sang trang vận hành đã lọc theo
 * workspace. CHỈ số lượng/thời lượng — không bảng người, không danh sách cuộc gọi (OPC-12). Trang cha chỉ mount tab khi cờ `meeting` bật và có `meeting:view`.
 */
const WorkspaceMediaStatsTab = memo(function WorkspaceMediaStatsTab({
  workspaceId,
}: WorkspaceMediaStatsTabProps) {
  const qp = useQueryParams();
  const requested = Number(qp.getParam(DAYS_KEY));
  const days = DAY_OPTIONS.some((o) => Number(o.key) === requested) ? requested : DEFAULT_DAYS;
  const voiceOff = useFeature('voice') === false;

  const { data, error, refetch } = useWorkspaceMediaStats(workspaceId, days);
  const featureOff = !data && !!error && extractErrorCode(error as AxiosError) === FEATURE_OFF_CODE;

  if (featureOff) {
    return (
      <EmptyState
        description="Phân hệ họp đang tắt trên hệ thống nên chưa có số liệu."
        icon="calendar-bold"
        title="Gọi & họp đang tắt"
      />
    );
  }
  if (!data && error) {
    return (
      <WorkspaceLoadError
        error={error}
        title="Không tải được số liệu gọi & họp"
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Callout
        description="Chỉ hiển thị số lượng và thời lượng tổng hợp. Danh sách người tham gia, nội dung cuộc gọi và cuộc họp không được hiển thị."
        icon="lock-bold"
        intent="info"
        variant="ghost"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentToggle
          aria-label="Khoảng thời gian thống kê"
          options={DAY_OPTIONS}
          value={String(days)}
          onValueChange={(v) =>
            qp.updateParams({ [DAYS_KEY]: v === String(DEFAULT_DAYS) ? null : v })
          }
        />
        <div className="flex flex-wrap items-center gap-3">
          <Link className={LINK_CLASS} to={meetingOpsHref('meetings', workspaceId)}>
            Xem cuộc họp của workspace
          </Link>
          {!voiceOff && (
            <Link className={LINK_CLASS} to={meetingOpsHref('calls', workspaceId)}>
              Xem cuộc gọi của workspace
            </Link>
          )}
        </div>
      </div>

      <BoxPanel border="hairline" className="h-auto" title={`Cuộc họp — ${days} ngày gần nhất`}>
        <div className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            animate={false}
            color="blue"
            icon="calendar-bold"
            label="Đã lên lịch"
            value={data ? data.meetings.scheduled : NO_DATA}
          />
          <SummaryCard
            animate={false}
            color="green"
            icon="circle-check-bold"
            label="Đã họp"
            value={data ? data.meetings.held : NO_DATA}
          />
          <SummaryCard
            animate={false}
            color="gray"
            icon="circle-xmark-bold"
            label="Đã huỷ"
            value={data ? data.meetings.cancelled : NO_DATA}
          />
          <SummaryCard
            animate={false}
            color="yellow"
            icon="clock-bold"
            label="Tổng phút họp"
            value={data ? data.meetings.totalMinutes : NO_DATA}
          />
        </div>
      </BoxPanel>

      <BoxPanel border="hairline" className="h-auto" title={`Cuộc gọi — ${days} ngày gần nhất`}>
        <div className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            animate={false}
            color="blue"
            icon="phone-bold"
            label="Tổng cuộc gọi"
            value={data ? data.calls.total : NO_DATA}
          />
          <SummaryCard
            animate={false}
            color="green"
            icon="bolt-bold"
            label="Đổ chuông"
            value={data ? data.calls.ring : NO_DATA}
          />
          <SummaryCard
            animate={false}
            color="gray"
            icon="users-bold"
            label="Phòng"
            value={data ? data.calls.room : NO_DATA}
          />
          <SummaryCard
            animate={false}
            color="yellow"
            icon="clock-bold"
            label="Tổng phút gọi"
            value={data ? data.calls.minutes : NO_DATA}
          />
        </div>
      </BoxPanel>

      <BoxPanel border="hairline" className="h-auto" title="Ghi hình">
        <div className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-2">
          <SummaryCard
            animate={false}
            color="green"
            icon="camera-bold"
            label="Bản ghi sẵn sàng"
            value={data ? data.recordings.ready : NO_DATA}
          />
          <SummaryCard
            animate={false}
            color="blue"
            icon="boxes-stacked-bold"
            label="Dung lượng"
            value={data ? formatFileSize(data.recordings.storageBytes) : NO_DATA}
          />
        </div>
      </BoxPanel>
    </div>
  );
});

export default WorkspaceMediaStatsTab;
