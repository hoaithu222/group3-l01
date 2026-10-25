import { memo, useCallback } from 'react';

import { BoxPanel, Button, Callout, EmptyState, PageBody, Toolbar } from '@/shared/ui';

import { useModerationSocket, useReportFilters } from '../hooks';
import { useAdminReports } from '../service/moderation.queries';
import ReportFilters from './ReportFilters';
import ReportQueueTable from './ReportQueueTable';

/**
 * Tab `reports` của `/moderation` (admin.md p1-08 §2.1) — báo cáo GỘP THEO ĐÍCH, lọc theo trạng thái/loại đích/lý do/workspace/ngày, sắp theo
 * số báo cáo hoặc mới nhất; toàn bộ bộ lọc và trang nằm trên URL. Realtime: vào phòng `admin:moderation`, có `moderation:report-*` thì làm
 * mới. Quyền vào trang (`moderation:view`) và cờ `communication` do registry chặn.
 *
 * Bảng CHỈ có metadata — không tên kênh riêng tư/nhóm chat, không nội dung; xem nội dung riêng tư
 * là việc ở trang chi tiết (D-06, có xác nhận + ghi nhật ký).
 */
const ReportsTab = memo(function ReportsTab() {
  const filters = useReportFilters();
  useModerationSocket();

  const { data, isLoading, isError, refetch } = useAdminReports(filters.params);
  const rows = data?.data ?? [];
  const total = data?.meta?.total ?? 0;
  const handleRetry = useCallback(() => void refetch(), [refetch]);

  const showLoadError = isError && rows.length === 0;
  const emptyTitle = filters.hasActiveFilter
    ? 'Không có báo cáo nào khớp bộ lọc'
    : 'Chưa có báo cáo nào ở trạng thái này';

  return (
    <>
      <Toolbar left={<ReportFilters state={filters} />} />
      <PageBody overflow="hidden" stack={false}>
        <BoxPanel
          bodyOverflow="hidden"
          border="hairline"
          description={total > 0 ? `${total} nhóm báo cáo` : undefined}
          title="Hàng đợi báo cáo"
        >
          {showLoadError ? (
            <div className="p-2">
              <Callout
                action={
                  <Button size="sm" variant="stroke" onClick={handleRetry}>
                    Thử lại
                  </Button>
                }
                description="Kiểm tra kết nối rồi thử lại."
                intent="error"
                title="Không tải được hàng đợi báo cáo"
              />
            </div>
          ) : (
            <ReportQueueTable
              currentPage={filters.page}
              emptyMessage={<EmptyState icon="shield-check-bold" size="sm" title={emptyTitle} />}
              fill
              loading={isLoading}
              pageSize={filters.pageSize}
              rows={rows}
              total={total}
              onPageChange={filters.setPage}
              onPageSizeChange={filters.setPageSize}
            />
          )}
        </BoxPanel>
      </PageBody>
    </>
  );
});

export default ReportsTab;
