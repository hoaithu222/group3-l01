import type { AxiosError } from 'axios';
import { memo, useCallback, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import { extractErrorCode } from '@/core/api/error.handler';
import { useNavHref } from '@/shared/hooks';
import { BoxPanel, Callout, EmptyState } from '@/shared/ui';

import { CALL_PRIVACY_NOTE } from '../../constants/call.constants';
import { FEATURE_OFF_CODE } from '../../constants/meeting.constants';
import { useCallListState } from '../../hooks';
import { useAdminCalls } from '../../service/meeting.queries';
import type { AdminCallRow } from '../../types/call.types';
import { meetingOpsPath } from '../../utils/meeting-ops.utils';
import ForceEndCallModal from '../common/ForceEndCallModal';
import MediaLoadError from '../common/MediaLoadError';
import CallFilters from './CallFilters';
import CallOpsDrawer from './CallOpsDrawer';
import CallStatsPanel from './CallStatsPanel';
import CallsTable from './CallsTable';

type ForceEndTarget = Pick<AdminCallRow, 'id' | 'label' | 'peakParticipants'>;

/**
 * Tab "Cuộc gọi" (admin.md p2-07 §2.3): thống kê (`CallStatsPanel`), bộ lọc, bảng cuộc gọi toàn nền tảng, ngăn kéo chi tiết và hộp thoại "Kết thúc cuộc
 * gọi" (cần `meeting:update`, chỉ với cuộc gọi chưa kết thúc và không thuộc cuộc họp). CHỈ metadata + nhãn đã che (OPC-05); bộ lọc/sắp xếp/trang/ngăn kéo
 * đồng bộ URL (`useCallListState` — F5 giữ bộ lọc, OPC-09). Bảng tự làm mới khi có `admin:media-updated kind=CALL` (`useAdminMediaSocket` ở trang).
 * Cuộc gọi của cuộc họp mà vẫn bị kết thúc từ đây (`ADMIN_MEDIA_002`) → khung "Mở cuộc họp" ngay đầu tab.
 */
const CallsTab = memo(function CallsTab() {
  const state = useCallListState();
  const buildHref = useNavHref();
  const canForceEnd = useAuthStore((s) => s.hasPermission('meeting', 'update'));
  const [target, setTarget] = useState<ForceEndTarget | null>(null);
  const [meetingRedirect, setMeetingRedirect] = useState<string | null>(null);

  const list = useAdminCalls(state.params);
  const { openDetail } = state;
  const hrefFor = useCallback((row: AdminCallRow) => buildHref({ id: row.id }), [buildHref]);
  const openRow = useCallback((row: AdminCallRow) => openDetail(row.id), [openDetail]);
  const closeForceEnd = useCallback(() => setTarget(null), []);

  const featureOff =
    !list.data && !!list.error && extractErrorCode(list.error as AxiosError) === FEATURE_OFF_CODE;

  return (
    <div className="flex flex-col gap-3">
      <Callout description={CALL_PRIVACY_NOTE} icon="lock-bold" intent="info" variant="ghost" />
      {meetingRedirect && (
        <Callout
          action={
            <Link
              className="text-body-14 text-link hover:underline"
              to={meetingOpsPath({ tab: 'meetings', id: meetingRedirect })}
            >
              Mở cuộc họp
            </Link>
          }
          closable
          description="Cuộc gọi này thuộc một cuộc họp, hãy kết thúc cuộc họp thay vì kết thúc riêng cuộc gọi."
          intent="warning"
          title="Không kết thúc riêng được cuộc gọi của cuộc họp"
          onClose={() => setMeetingRedirect(null)}
        />
      )}

      <CallStatsPanel workspaceId={state.workspaceId || undefined} />

      <CallFilters
        endReasons={state.endReasons}
        filtered={state.filtered}
        mediaKind={state.mediaKind}
        meetingId={state.meetingId}
        mode={state.mode}
        range={state.range}
        scopeType={state.scopeType}
        statuses={state.statuses}
        workspaceId={state.workspaceId}
        onClear={state.clearFilters}
        onClearMeeting={state.clearMeeting}
        onEndReasonsChange={state.setEndReasons}
        onMediaKindChange={state.setMediaKind}
        onModeChange={state.setMode}
        onRangeChange={state.setRange}
        onScopeTypeChange={state.setScopeType}
        onStatusesChange={state.setStatuses}
        onWorkspaceChange={state.setWorkspaceId}
      />

      {featureOff ? (
        <EmptyState
          description="Gọi thoại/video đang tắt trên hệ thống nên chưa có dữ liệu."
          icon="phone-bold"
          title="Gọi thoại đang tắt"
        />
      ) : !list.data && list.error ? (
        <MediaLoadError
          error={list.error}
          title="Không tải được danh sách cuộc gọi"
          onRetry={() => void list.refetch()}
        />
      ) : (
        <BoxPanel border="hairline" title="Danh sách cuộc gọi">
          <CallsTable
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
            onForceEnd={setTarget}
            onOpen={openRow}
            onPageChange={state.setPage}
            onPageSizeChange={state.setPageSize}
            onSortChange={state.changeSort}
          />
        </BoxPanel>
      )}

      <CallOpsDrawer
        callId={state.detailId}
        canForceEnd={canForceEnd}
        onClose={state.closeDetail}
        onForceEnd={setTarget}
      />
      <ForceEndCallModal
        call={target}
        onBelongsToMeeting={setMeetingRedirect}
        onClose={closeForceEnd}
      />
    </div>
  );
});

export default CallsTab;
