import { memo, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import { EmptyState, Table } from '@/shared/ui';

import type { AdminReportGroup } from '../types/moderation.types';
import { reportDetailPath } from '../utils/report-links';
import type { ReportNavState } from '../utils/report-links';
import { buildReportColumns } from './report-queue-table.columns';

const TABLE_MIN_WIDTH = 1100;
const PAGE_SIZE_OPTIONS = [20, 50, 100];

export interface ReportQueueTableProps {
  rows: readonly AdminReportGroup[];
  loading?: boolean;
  /** Trang hiện tại, 1-based — forward thẳng cho `<Table>` (phân trang phía server). */
  currentPage: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  /** Ẩn cột Workspace — dùng ở tab `reports` của workspace. */
  hideWorkspace?: boolean;
  /** Giãn hết chiều cao khung chứa (trang hàng đợi); tab trong trang cuộn thì để `false`. */
  fill?: boolean;
  emptyMessage?: ReactNode;
}

/**
 * Bảng hàng đợi báo cáo gộp theo đích — DÙNG CHUNG cho trang `/moderation` và tab `reports` của
 * workspace (xuất qua `@/features/moderation`). Cột "Đích" là `<Link>` thật sang
 * `/moderation/:reportId` (chuột giữa/Ctrl+click mở tab mới — `navigable-controls.md`), bấm chỗ
 * khác trên dòng cũng đi tới đó. Liên kết mang `state.from` = URL hiện tại để trang chi tiết quay
 * lại ĐÚNG hàng đợi với bộ lọc đang đặt.
 */
const ReportQueueTable = memo(function ReportQueueTable({
  rows,
  loading,
  currentPage,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  hideWorkspace,
  fill = false,
  emptyMessage,
}: ReportQueueTableProps) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const canViewUser = useAuthStore((s) => s.hasPermission('user', 'view'));

  const state = useMemo<ReportNavState>(
    () => ({ from: `${pathname}${search}` }),
    [pathname, search],
  );
  const columns = useMemo(
    () => buildReportColumns({ hideWorkspace, canViewUser, detailState: state }),
    [hideWorkspace, canViewUser, state],
  );

  const rowKey = useCallback((row: AdminReportGroup) => row.groupKey, []);
  const handleRowClick = useCallback(
    (row: AdminReportGroup) => navigate(reportDetailPath(row.reportId), { state }),
    [navigate, state],
  );
  const data = useMemo(() => [...rows], [rows]);

  return (
    <Table
      className={fill ? 'min-h-0 flex-1' : undefined}
      columns={columns}
      currentPage={currentPage}
      data={data}
      emptyMessage={
        emptyMessage ?? (
          <EmptyState icon="shield-check-bold" size="sm" title="Không có báo cáo nào khớp bộ lọc" />
        )
      }
      fill={fill}
      loading={loading}
      minWidth={TABLE_MIN_WIDTH}
      pageSize={pageSize}
      pageSizeOptions={PAGE_SIZE_OPTIONS}
      rowKey={rowKey}
      total={total}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      onRowClick={handleRowClick}
    />
  );
});

export default ReportQueueTable;
