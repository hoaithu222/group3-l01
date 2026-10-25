import type { AxiosError } from 'axios';
import { memo, useCallback, useState } from 'react';

import { useAuthStore } from '@/app/store';
import { extractErrorCode } from '@/core/api/error.handler';
import { useNavHref } from '@/shared/hooks';
import { BoxPanel, Callout, EmptyState } from '@/shared/ui';

import { FEATURE_OFF_CODE, MEETING_PRIVACY_NOTE } from '../../constants/meeting.constants';
import { useMeetingListState } from '../../hooks';
import { useAdminMeetings } from '../../service/meeting.queries';
import type { AdminMeetingRow } from '../../types/meeting.types';
import ForceEndMeetingModal from '../common/ForceEndMeetingModal';
import type { ForceEndMeetingModalProps } from '../common/ForceEndMeetingModal';
import MediaLoadError from '../common/MediaLoadError';
import MeetingFilters from './MeetingFilters';
import MeetingOpsDrawer from './MeetingOpsDrawer';
import MeetingsTable from './MeetingsTable';

/**
 * Tab "Cuộc họp" (admin.md p2-07 §2.2): bộ lọc + bảng cuộc họp toàn nền tảng + ngăn kéo chi tiết + hộp thoại "Kết thúc cuộc họp" (cần
 * `meeting:update`, chỉ với cuộc họp đang diễn ra). CHỈ metadata vận hành (OPC-05). Bộ lọc/sắp xếp/trang/ngăn kéo đồng bộ URL
 * (`useMeetingListState`); phân trang + lọc + sắp xếp phía SERVER. Bảng tự làm mới khi có `admin:media-updated` (`useAdminMediaSocket` ở trang).
 */
const MeetingsTab = memo(function MeetingsTab() {
  const state = useMeetingListState();
  const buildHref = useNavHref();
  const canForceEnd = useAuthStore((s) => s.hasPermission('meeting', 'update'));
  const [target, setTarget] = useState<ForceEndMeetingModalProps['meeting']>(null);

  const list = useAdminMeetings(state.params);
  const { openDetail } = state;
  const hrefFor = useCallback((row: AdminMeetingRow) => buildHref({ id: row.id }), [buildHref]);
  const openRow = useCallback((row: AdminMeetingRow) => openDetail(row.id), [openDetail]);
  const startForceEnd = useCallback(
    (row: AdminMeetingRow) => setTarget({ id: row.id, title: row.title }),
    [],
  );
  const closeForceEnd = useCallback(() => setTarget(null), []);

  const featureOff =
    !list.data && !!list.error && extractErrorCode(list.error as AxiosError) === FEATURE_OFF_CODE;

  return (
    <div className="flex flex-col gap-3">
      <Callout description={MEETING_PRIVACY_NOTE} icon="lock-bold" intent="info" variant="ghost" />

      <MeetingFilters
        filtered={state.filtered}
        platform={state.platform}
        range={state.range}
        search={state.search}
        statuses={state.statuses}
        workspaceId={state.workspaceId}
        onClear={state.clearFilters}
        onPlatformChange={state.setPlatform}
        onRangeChange={state.setRange}
        onSearchChange={state.setSearch}
        onStatusesChange={state.setStatuses}
        onWorkspaceChange={state.setWorkspaceId}
      />

      {featureOff ? (
        <EmptyState
          description="Phân hệ họp đang tắt trên hệ thống nên chưa có dữ liệu."
          icon="calendar-bold"
          title="Lịch họp đang tắt"
        />
      ) : !list.data && list.error ? (
        <MediaLoadError
          error={list.error}
          title="Không tải được danh sách cuộc họp"
          onRetry={() => void list.refetch()}
        />
      ) : (
        <BoxPanel border="hairline" title="Danh sách cuộc họp">
          <MeetingsTable
            canForceEnd={canForceEnd}
            currentPage={state.page}
            filtered={state.filtered}
            hrefFor={hrefFor}
            loading={list.isLoading}
            pageSize={state.pageSize}
            rows={list.data?.data ?? []}
            sortDir={state.sort.dir}
            sortKey={state.sort.key}
            total={list.data?.meta?.total ?? 0}
            onForceEnd={startForceEnd}
            onOpen={openRow}
            onPageChange={state.setPage}
            onPageSizeChange={state.setPageSize}
            onSortChange={state.changeSort}
          />
        </BoxPanel>
      )}

      <MeetingOpsDrawer
        canForceEnd={canForceEnd}
        meetingId={state.detailId}
        onClose={state.closeDetail}
        onForceEnd={setTarget}
      />
      <ForceEndMeetingModal meeting={target} onClose={closeForceEnd} />
    </div>
  );
});

export default MeetingsTab;
