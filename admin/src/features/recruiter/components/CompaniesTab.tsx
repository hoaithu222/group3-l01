import { memo, useCallback } from 'react';

import {
  BoxPanel,
  Button,
  Callout,
  EmptyState,
  PageBody,
  Toolbar,
} from '@/shared/ui';

import { COMPANY_STATUS_META } from '../constants/recruiter.constants';
import { useCompanyFilters, useRecruiterSocket } from '../hooks';
import { useAdminCompanies } from '../service/recruiter.queries';
import type { AdminCompanyItem } from '../types/recruiter.types';
import { isUnavailableError } from '../utils/load-error';
import CompanyDetailDrawer from './CompanyDetailDrawer';
import CompanyFilters from './CompanyFilters';
import CompanyTable from './CompanyTable';

/** `?companyId=` mở ngăn kéo chi tiết trên nền danh sách (giữ bộ lọc/trang đang xem). */
const DETAIL_PARAM = 'companyId';

/**
 * Tab `companies` của `/recruiter` (admin.md p6-08 §2.1) — danh sách doanh nghiệp, lọc "Chờ duyệt" mặc định khi có, mọi bộ lọc/trang nằm trên URL.
 * Realtime: có đăng ký mới/gửi duyệt lại (`notification:created` loại `company.needs-review`) thì làm mới. Quyền vào trang (`recruiter:view`) và cờ `career` do registry chặn.
 *
 * Lỗi tải mà chưa có dữ liệu → Callout + "Thử lại", KHÔNG vẽ bảng trống ("Không có doanh nghiệp nào" là nói dối lúc BE hỏng).
 */
const CompaniesTab = memo(function CompaniesTab() {
  const filters = useCompanyFilters();
  useRecruiterSocket();

  const { getParam, updateParams, searchParams } = filters;
  const detailId = getParam(DETAIL_PARAM) || null;
  const { data, isLoading, isError, error, refetch } = useAdminCompanies(filters.params, filters.ready);
  const rows = data?.data ?? [];
  const total = data?.meta?.total ?? 0;

  const detailHref = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams);
      next.set(DETAIL_PARAM, id);
      return `?${next.toString()}`;
    },
    [searchParams],
  );
  const handleRowClick = useCallback(
    (row: AdminCompanyItem) => updateParams({ [DETAIL_PARAM]: row.id }),
    [updateParams],
  );
  const handleClose = useCallback(() => updateParams({ [DETAIL_PARAM]: null }), [updateParams]);

  const showLoadError = isError && rows.length === 0;
  const emptyTitle = filters.hasActiveFilter
    ? 'Không có doanh nghiệp nào khớp bộ lọc'
    : 'Chưa có doanh nghiệp nào đăng ký';
  const statusLabel = filters.status ? COMPANY_STATUS_META[filters.status].label : null;

  return (
    <>
      <Toolbar
        left={
          <CompanyFilters
            search={filters.search}
            status={filters.statusValue}
            tier={filters.tierValue}
            onSearchChange={filters.setSearch}
            onStatusChange={filters.setStatus}
            onTierChange={filters.setTier}
          />
        }
      />
      <PageBody overflow="hidden" stack={false}>
        <BoxPanel
          bodyOverflow="hidden"
          border="hairline"
          description={total > 0 ? `${total} doanh nghiệp${statusLabel ? ` · ${statusLabel}` : ''}` : undefined}
          title="Doanh nghiệp tuyển dụng"
        >
          {showLoadError && isUnavailableError(error) ? (
            // 403: người này vào được URL nhưng không có quyền vận hành (vd nhân sự doanh nghiệp có `recruiter:view` theo dữ liệu) — "Thử lại" vô ích.
            <EmptyState
              description="Tài khoản của bạn không có quyền vận hành tuyển dụng. Nhà tuyển dụng dùng cổng riêng ở mục Tuyển dụng."
              icon="lock-bold"
              size="sm"
              title="Không xem được danh sách doanh nghiệp"
            />
          ) : showLoadError ? (
            <div className="p-2">
              <Callout
                action={
                  <Button size="sm" variant="stroke" onClick={() => void refetch()}>
                    Thử lại
                  </Button>
                }
                description="Kiểm tra kết nối rồi thử lại."
                intent="error"
                title="Không tải được danh sách doanh nghiệp"
              />
            </div>
          ) : (
            <CompanyTable
              currentPage={filters.page}
              detailHref={detailHref}
              emptyMessage={<EmptyState icon="building-bold" size="sm" title={emptyTitle} />}
              loading={isLoading || !filters.ready}
              pageSize={filters.pageSize}
              rows={rows}
              total={total}
              onPageChange={filters.setPage}
              onPageSizeChange={filters.setPageSize}
              onRowClick={handleRowClick}
            />
          )}
        </BoxPanel>
      </PageBody>
      <CompanyDetailDrawer companyId={detailId} onClose={handleClose} />
    </>
  );
});

export default CompaniesTab;
