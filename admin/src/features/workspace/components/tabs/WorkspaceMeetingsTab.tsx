import type { AxiosError } from 'axios';
import { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import { extractErrorCode } from '@/core/api/error.handler';
import { BoxPanel, Button, Callout, Dropdown, EmptyState, RangeDatePicker, Toolbar } from '@/shared/ui';
import type { DateRange } from '@/shared/ui';
import { useQueryParams } from '@/shared/hooks';

import WorkspaceLoadError from '../WorkspaceLoadError';
import WorkspaceMeetingTable from '../WorkspaceMeetingTable';
import { MEETING_PAGE_SIZE, MEETING_STATUS_FILTER_OPTIONS } from '../../constants/workspace-meetings.constants';
import { useAdminWorkspaceMeetings } from '../../service/workspace-meetings.queries';
import { meetingOpsHref } from '../../utils/meeting-ops-link';
import { dateToUrl, parseMeetingStatus, toMeetingListParams, urlDateToDate } from '../../utils/workspace-meetings.utils';

/** Cờ `meeting` tắt giữa chừng (capabilities cache 5 phút) → BE trả 404 với mã này: hiện "đang tắt", không phải lỗi. */
const MEETING_FEATURE_OFF_CODE = 'CFG_005';
const ALL = 'all';
const STATUS_OPTIONS = [{ value: ALL, label: 'Mọi trạng thái' }, ...MEETING_STATUS_FILTER_OPTIONS];

export interface WorkspaceMeetingsTabProps {
  workspaceId: string;
}

/**
 * Tab "Cuộc họp" của `WorkspaceDetailPage` (admin.md p2-04 §2.1) — CHỈ đọc metadata: tiêu đề, chủ trì, giờ (theo trình duyệt + múi giờ cuộc
 * họp), trạng thái, nền tảng, số người. Admin KHÔNG lên lịch/sửa/kết thúc cuộc họp thay người dùng (force-end ở p2-07) và BE không trả
 * agenda/địa điểm/link/mã họp/tên người tham dự. Bộ lọc (trạng thái, khoảng ngày BẮT ĐẦU) và trang đồng bộ URL (`meetingStatus`, `meetingFrom`,
 * `meetingTo`, `page` — khoá riêng để không dính bộ lọc của tab Báo cáo/Nhóm chat cùng trang); phân trang + lọc phía SERVER.
 * Trang cha chỉ mount tab khi cờ `meeting` bật và có `workspace:view`. Có thêm `meeting:view` thì hiện liên kết "Xem tất cả cuộc họp của workspace" sang
 * trang vận hành gọi & họp đã lọc theo workspace (`/meeting?tab=meetings&workspaceId=`) — ở đó có ngăn kéo chi tiết, phiên họp và ghi hình.
 */
const WorkspaceMeetingsTab = memo(function WorkspaceMeetingsTab({ workspaceId }: WorkspaceMeetingsTabProps) {
  const qp = useQueryParams({ defaultPageSize: MEETING_PAGE_SIZE });
  const canViewMeetingOps = useAuthStore((s) => s.hasPermission('meeting', 'view'));
  const statusParam = qp.getParam('meetingStatus');
  const fromParam = qp.getParam('meetingFrom');
  const toParam = qp.getParam('meetingTo');
  const status = parseMeetingStatus(statusParam);
  const range = useMemo<DateRange>(() => ({ from: urlDateToDate(fromParam), to: urlDateToDate(toParam) }), [fromParam, toParam]);

  const params = useMemo(
    () => toMeetingListParams({ page: qp.page, limit: qp.pageSize, status: statusParam, from: fromParam, to: toParam }),
    [fromParam, qp.page, qp.pageSize, statusParam, toParam],
  );
  const { data, isLoading, error, refetch } = useAdminWorkspaceMeetings(workspaceId, params);
  const filtered = !!(status || range.from || range.to);

  const clearFilters = () => qp.updateParams({ meetingStatus: null, meetingFrom: null, meetingTo: null, page: null });
  const featureOff = !data && !!error && extractErrorCode(error as AxiosError) === MEETING_FEATURE_OFF_CODE;

  return (
    <div className="flex flex-col gap-3">
      <Callout
        description="Vì quyền riêng tư, trang quản trị chỉ hiển thị thông tin chung của cuộc họp (tiêu đề, giờ, chủ trì, trạng thái, số người). Nội dung chương trình, địa điểm, đường dẫn phòng họp và danh sách người tham dự không được hiển thị."
        icon="lock-bold"
        intent="info"
        variant="ghost"
      />

      <Toolbar
        left={
          <>
            <Dropdown
              aria-label="Lọc theo trạng thái"
              className="w-44"
              options={STATUS_OPTIONS}
              size="sm"
              value={status ?? ALL}
              onValueChange={(v) => qp.setParam('meetingStatus', v === ALL ? null : v)}
            />
            <RangeDatePicker
              align="end"
              className="w-64"
              placeholder="Khoảng ngày bắt đầu"
              range={range}
              showQuickSelect
              size="sm"
              onRangeChange={(next) => qp.updateParams({ meetingFrom: dateToUrl(next.from), meetingTo: dateToUrl(next.to), page: null })}
            />
            {filtered && (
              <Button size="sm" variant="ghost" onClick={clearFilters}>
                Xoá bộ lọc
              </Button>
            )}
          </>
        }
        right={
          canViewMeetingOps && (
            <Link
              className="text-body-14 text-link hover:underline"
              to={meetingOpsHref('meetings', workspaceId)}
            >
              Xem tất cả cuộc họp của workspace
            </Link>
          )
        }
      />

      {featureOff ? (
        <EmptyState
          description="Tính năng lịch họp đang tắt trên hệ thống nên chưa có dữ liệu."
          icon="calendar-bold"
          title="Lịch họp đang tắt"
        />
      ) : !data && error ? (
        // 403/404 (thiếu quyền, workspace không còn) → không có nút; mất mạng/5xx → "Thử lại".
        <WorkspaceLoadError
          error={error}
          title="Không tải được danh sách cuộc họp"
          onRetry={() => void refetch()}
        />
      ) : (
        <BoxPanel border="hairline" title="Danh sách cuộc họp">
          <WorkspaceMeetingTable
            currentPage={qp.page}
            filtered={filtered}
            loading={isLoading}
            pageSize={qp.pageSize}
            rows={data?.data ?? []}
            total={data?.meta?.total ?? 0}
            onPageChange={qp.setPage}
            onPageSizeChange={qp.setPageSize}
          />
        </BoxPanel>
      )}
    </div>
  );
});

export default WorkspaceMeetingsTab;
