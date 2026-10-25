import { useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { memo, useCallback, useState } from 'react';

import { useCapabilities } from '@/app/capabilities';
import { useAuthStore } from '@/app/store';
import { extractErrorCode } from '@/core/api/error.handler';
import { BoxPanel, Callout, EmptyState } from '@/shared/ui';

import {
  RECORDING_FEATURE_OFF_CODE,
  RECORDING_PRIVACY_NOTE,
  RECORDING_UNAVAILABLE_NOTE,
} from '../../constants/workspace-recordings.constants';
import { useRecordingListState } from '../../hooks';
import {
  useAdminRecordings,
  useAdminRecordingSummary,
  workspaceRecordingsKeys,
} from '../../service/workspace-recordings.queries';
import type { AdminRecordingRow } from '../../types/workspace-recordings.types';
import { isMeetingIdParam } from '../../utils/workspace-recordings.utils';
import RecordingDeleteModal from '../RecordingDeleteModal';
import RecordingDetailDrawer from '../RecordingDetailDrawer';
import RecordingFilters from '../RecordingFilters';
import RecordingSummaryPanel from '../RecordingSummaryPanel';
import WorkspaceLoadError from '../WorkspaceLoadError';
import WorkspaceRecordingTable from '../WorkspaceRecordingTable';

export interface WorkspaceRecordingsTabProps {
  /** Bỏ trống = toàn nền tảng (thêm cột Workspace) — dùng cho trang giám sát chung của p2-07. */
  workspaceId?: string;
  /** Chỉ bản ghi của MỘT cuộc họp (từ ngăn kéo cuộc họp ở trang giám sát chung); id sai định dạng bị bỏ qua. */
  meetingId?: string;
}

/**
 * Tab "Ghi hình" (admin.md p2-06 §2): thẻ tóm tắt, bộ lọc, bảng bản ghi hình, ngăn kéo chi tiết và hộp thoại xoá (có lý do + audit). CHỈ metadata vận
 * hành — admin KHÔNG phát, tải hay xem trước bản ghi, không đọc biên bản (D-24). Bộ lọc/sắp xếp/trang/ngăn kéo đồng bộ URL (`useRecordingListState`,
 * khoá riêng `rec*`); phân trang + lọc + sắp xếp phía SERVER. Trang cha chỉ mount tab khi cờ `meeting` bật và có `workspace:view`.
 */
const WorkspaceRecordingsTab = memo(function WorkspaceRecordingsTab({
  workspaceId,
  meetingId,
}: WorkspaceRecordingsTabProps) {
  const state = useRecordingListState(workspaceId, meetingId);
  // Từ p2-07 BE chặn `DELETE /admin/recordings/:id` bằng `meeting:delete` (chỉ `admin`; `manager` không có) — trước đó tạm dùng `workspace:delete`.
  const canDelete = useAuthStore((s) => s.hasPermission('meeting', 'delete'));
  const qc = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<AdminRecordingRow | null>(null);

  // Thẻ tóm tắt (`GET /admin/recordings/summary`) chỉ tính theo workspace, không theo cuộc họp — hiện nó khi đang xem MỘT cuộc họp sẽ nói số của cả nhóm.
  const meetingScoped = isMeetingIdParam(meetingId);
  const list = useAdminRecordings(state.params);
  const summary = useAdminRecordingSummary(workspaceId, !meetingScoped);
  const recordingFlag = useCapabilities().data?.features.meetingRecording;
  const recordingOff = !!recordingFlag && (!recordingFlag.enabled || !recordingFlag.available);

  // "Thử lại" tải lại CẢ NHÓM (danh sách + thẻ + ngăn kéo): bảng hiện lại mà thẻ còn kẹt "—" là lỗi khó hiểu.
  const reload = useCallback(
    () => void qc.invalidateQueries({ queryKey: workspaceRecordingsKeys.all }),
    [qc],
  );
  const closeDelete = useCallback(() => setPendingDelete(null), []);
  const featureOff =
    !list.data &&
    !!list.error &&
    extractErrorCode(list.error as AxiosError) === RECORDING_FEATURE_OFF_CODE;

  return (
    <div className="flex flex-col gap-3">
      <Callout
        description={RECORDING_PRIVACY_NOTE}
        icon="lock-bold"
        intent="info"
        variant="ghost"
      />
      {recordingOff && (
        <Callout description={RECORDING_UNAVAILABLE_NOTE} intent="warning" variant="ghost" />
      )}

      {!meetingScoped && (
        <RecordingSummaryPanel
          summary={summary.data}
          onShowExpiring={state.showExpiring}
          onShowFailed={state.showFailed}
        />
      )}

      <RecordingFilters
        expiring={state.expiring}
        filtered={state.filtered}
        includeDeleted={state.includeDeleted}
        range={state.range}
        statuses={state.statuses}
        onClear={state.clearFilters}
        onExpiringChange={state.setExpiring}
        onIncludeDeletedChange={state.setIncludeDeleted}
        onRangeChange={state.setRange}
        onStatusesChange={state.setStatuses}
      />

      {featureOff ? (
        <EmptyState
          description="Phân hệ họp đang tắt trên hệ thống nên chưa có dữ liệu."
          icon="camera-bold"
          title="Ghi hình họp đang tắt"
        />
      ) : !list.data && list.error ? (
        // 403/404 (thiếu quyền, workspace không còn) → không có nút; mất mạng/5xx → "Thử lại".
        <WorkspaceLoadError
          error={list.error}
          title="Không tải được danh sách bản ghi hình"
          onRetry={reload}
        />
      ) : (
        <BoxPanel border="hairline" title="Danh sách bản ghi hình">
          <WorkspaceRecordingTable
            canDelete={canDelete}
            currentPage={state.page}
            filtered={state.filtered || meetingScoped}
            loading={list.isLoading}
            pageSize={state.pageSize}
            rows={list.data?.data ?? []}
            showWorkspace={!workspaceId}
            sortDir={state.sort.dir}
            sortKey={state.sort.key}
            total={list.data?.meta?.total ?? 0}
            onDelete={setPendingDelete}
            onPageChange={state.setPage}
            onPageSizeChange={state.setPageSize}
            onRowClick={(row) => state.openDetail(row.id)}
            onSortChange={state.changeSort}
          />
        </BoxPanel>
      )}

      <RecordingDetailDrawer
        canDelete={canDelete}
        recordingId={state.detailId}
        onClose={state.closeDetail}
        onDelete={setPendingDelete}
      />
      <RecordingDeleteModal row={pendingDelete} onClose={closeDelete} />
    </div>
  );
});

export default WorkspaceRecordingsTab;
