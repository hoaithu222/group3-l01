import { memo, useCallback, useMemo } from 'react';

import { useAuthStore } from '@/app/store';
import { useNavHref } from '@/shared/hooks';
import {
  BoxPanel,
  Button,
  Callout,
  Dropdown,
  EmptyState,
  PageBody,
  SegmentToggle,
  Table,
  Toolbar,
} from '@/shared/ui';

import {
  DEFAULT_MIN_REPORTS,
  MIN_REPORTS_OPTIONS,
  REPORTED_SETS_PAGE_SIZE,
  REPORTED_SETS_URL,
} from '../constants/study-set-moderation.constants';
import { useReportedStudySetFilters } from '../hooks';
import { useReportedStudySets } from '../service/study-set-moderation.queries';
import type { AdminStudySet } from '../types/study-set-moderation.types';
import { buildReportedStudySetColumns } from './reported-study-sets.columns';
import StudySetDetailDrawer from './StudySetDetailDrawer';

const STATUS_OPTIONS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'ACTIVE', label: 'Đang hiển thị' },
  { key: 'HIDDEN', label: 'Đã ẩn' },
];
const MIN_REPORTS_DROPDOWN = MIN_REPORTS_OPTIONS.map((n) => ({
  value: String(n),
  label: n === DEFAULT_MIN_REPORTS ? `Từ ${n} báo cáo (mặc định)` : `Từ ${n} báo cáo`,
}));

/**
 * Tab `content` của `/moderation` (admin.md p4-01 §1): bộ học CÔNG KHAI bị báo cáo nhiều (≥ ngưỡng báo cáo đang mở, mặc định 5), sắp giảm dần
 * — `GET /admin/study-sets` (`moderation:view`). Bảng chỉ có metadata; mở một dòng → ngăn kéo `?setId=` với ngữ cảnh, nội dung (chỉ bộ PUBLIC) và
 * ẩn/khôi phục (`moderation:update`, dùng lại khối của trang chi tiết báo cáo). Bộ WORKSPACE/PRIVATE không bao giờ có trong danh sách.
 */
const ReportedStudySetsTab = memo(function ReportedStudySetsTab() {
  const canUpdate = useAuthStore((s) => s.hasPermission('moderation', 'update'));
  const canViewUser = useAuthStore((s) => s.hasPermission('user', 'view'));
  const buildHref = useNavHref();
  const filters = useReportedStudySetFilters();
  const { openSet } = filters;

  const { data, isLoading, isError, refetch } = useReportedStudySets(filters.params);
  const rows = useMemo(() => data?.data ?? [], [data]);
  const total = data?.meta?.total ?? 0;

  const columns = useMemo(
    () =>
      buildReportedStudySetColumns({
        canViewUser,
        hrefFor: (s: AdminStudySet) => buildHref({ [REPORTED_SETS_URL.setId]: s.id }),
        onOpen: (s: AdminStudySet) => openSet(s.id),
      }),
    [buildHref, canViewUser, openSet],
  );
  const handleRetry = useCallback(() => void refetch(), [refetch]);
  const rowKey = useCallback((s: AdminStudySet) => s.id, []);

  return (
    <>
      <Toolbar
        left={
          <>
            <SegmentToggle
              aria-label="Lọc theo trạng thái bộ học"
              options={STATUS_OPTIONS}
              value={filters.values.status}
              onValueChange={filters.setStatus}
            />
            <Dropdown
              aria-label="Ngưỡng số báo cáo đang mở"
              className="w-52"
              options={MIN_REPORTS_DROPDOWN}
              size="sm"
              value={String(filters.values.minReports)}
              onValueChange={filters.setMinReports}
            />
          </>
        }
      />
      <PageBody overflow="scroll">
        <BoxPanel
          border="hairline"
          description={total > 0 ? `${total} bộ học công khai` : undefined}
          title="Bộ học bị báo cáo nhiều"
        >
          {isError && rows.length === 0 ? (
            <div className="p-2">
              <Callout
                action={
                  <Button size="sm" variant="stroke" onClick={handleRetry}>
                    Thử lại
                  </Button>
                }
                description="Kiểm tra kết nối rồi thử lại."
                intent="error"
                title="Không tải được danh sách bộ học"
              />
            </div>
          ) : (
            <Table
              columns={columns}
              currentPage={filters.page}
              data={rows}
              emptyMessage={
                <EmptyState
                  description={`Chỉ tính bộ học công khai có từ ${filters.values.minReports} báo cáo đang mở trở lên.`}
                  icon="shield-check-bold"
                  size="sm"
                  title="Chưa có bộ học nào bị báo cáo nhiều"
                />
              }
              loading={isLoading}
              pageSize={REPORTED_SETS_PAGE_SIZE}
              rowKey={rowKey}
              total={total}
              onPageChange={filters.setPage}
            />
          )}
        </BoxPanel>
      </PageBody>
      <StudySetDetailDrawer canUpdate={canUpdate} setId={filters.values.setId} onClose={filters.closeSet} />
    </>
  );
});

export default ReportedStudySetsTab;
