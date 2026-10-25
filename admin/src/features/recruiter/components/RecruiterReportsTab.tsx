import { memo, useMemo } from 'react';

import {
  ReportQueueTable,
  useAdminReports,
  useModerationSocket,
} from '@/features/moderation';
import type { AdminReportListParams, ReportStatus } from '@/features/moderation';
import { useQueryParams } from '@/shared/hooks';
import {
  BoxPanel,
  Button,
  Callout,
  Dropdown,
  EmptyState,
  PageBody,
  SegmentToggle,
  Toolbar,
} from '@/shared/ui';
import { statusBadge } from '@/shared/utils/format';

/** Hai loại đích báo cáo của tuyển dụng (BE `REPORT_TARGET_TYPES`): lời mời việc làm lạm dụng và doanh nghiệp. */
type RecruiterReportKind = 'JOB_OFFER' | 'COMPANY';

const KIND_OPTIONS = [
  { key: 'JOB_OFFER', label: 'Lời mời' },
  { key: 'COMPANY', label: 'Doanh nghiệp' },
];
const REPORT_STATUSES: readonly ReportStatus[] = ['OPEN', 'RESOLVED', 'DISMISSED'];
const STATUS_OPTIONS = REPORT_STATUSES.map((value) => ({
  value,
  label: statusBadge('report', value).label,
}));

const isKind = (v: string): v is RecruiterReportKind => v === 'JOB_OFFER' || v === 'COMPANY';
const isStatus = (v: string): v is ReportStatus => (REPORT_STATUSES as readonly string[]).includes(v);

/**
 * Tab `reports` của `/recruiter` (admin.md p6-08 §2.3) — DÙNG LẠI bảng hàng đợi báo cáo của `moderation` (p1-08), cố định `targetType` ∈ {`JOB_OFFER`, `COMPANY`}.
 * BE chỉ lọc được MỘT loại đích mỗi lần nên có công tắc "Lời mời | Doanh nghiệp" (mặc định Lời mời — loại phát sinh nhiều hơn) thay vì trộn hai loại. Bộ lọc và trang nằm trên URL.
 * Bấm dòng mở trang chi tiết báo cáo của moderation (`/moderation/:id`) — nơi có khối riêng của lời mời/doanh nghiệp và quyết định; nút "Quay lại" về đúng tab này.
 */
const RecruiterReportsTab = memo(function RecruiterReportsTab() {
  const qp = useQueryParams({ defaultPageSize: 20 });
  useModerationSocket();

  const kindRaw = qp.getParam('targetType');
  const statusRaw = qp.getParam('status');
  const kind: RecruiterReportKind = isKind(kindRaw) ? kindRaw : 'JOB_OFFER';
  const status: ReportStatus = isStatus(statusRaw) ? statusRaw : 'OPEN';

  const params = useMemo<AdminReportListParams>(
    () => ({ page: qp.page, limit: qp.pageSize, status, targetType: kind, sort: 'latest' }),
    [kind, qp.page, qp.pageSize, status],
  );
  const { data, isLoading, isError, refetch } = useAdminReports(params);
  const rows = data?.data ?? [];
  const total = data?.meta?.total ?? 0;
  const showLoadError = isError && rows.length === 0;

  return (
    <>
      <Toolbar
        left={
          <>
            <SegmentToggle
              aria-label="Loại báo cáo tuyển dụng"
              options={KIND_OPTIONS}
              value={kind}
              onValueChange={(v) => qp.setParam('targetType', v === 'JOB_OFFER' ? null : v)}
            />
            <Dropdown
              aria-label="Lọc theo trạng thái báo cáo"
              className="w-40"
              options={STATUS_OPTIONS}
              size="sm"
              value={status}
              onValueChange={(v) => qp.setParam('status', v === 'OPEN' ? null : v)}
            />
          </>
        }
      />
      <PageBody overflow="hidden" stack={false}>
        <BoxPanel
          bodyOverflow="hidden"
          border="hairline"
          description={total > 0 ? `${total} nhóm báo cáo` : undefined}
          title={kind === 'JOB_OFFER' ? 'Báo cáo lời mời việc làm' : 'Báo cáo doanh nghiệp'}
        >
          {showLoadError ? (
            <div className="p-2">
              <Callout
                action={
                  <Button size="sm" variant="stroke" onClick={() => void refetch()}>
                    Thử lại
                  </Button>
                }
                description="Kiểm tra kết nối rồi thử lại. Cần quyền xem kiểm duyệt."
                intent="error"
                title="Không tải được báo cáo"
              />
            </div>
          ) : (
            <ReportQueueTable
              currentPage={qp.page}
              emptyMessage={
                <EmptyState icon="shield-check-bold" size="sm" title="Không có báo cáo nào ở trạng thái này" />
              }
              fill
              hideWorkspace
              loading={isLoading}
              pageSize={qp.pageSize}
              rows={rows}
              total={total}
              onPageChange={qp.setPage}
              onPageSizeChange={qp.setPageSize}
            />
          )}
        </BoxPanel>
      </PageBody>
    </>
  );
});

export default RecruiterReportsTab;
