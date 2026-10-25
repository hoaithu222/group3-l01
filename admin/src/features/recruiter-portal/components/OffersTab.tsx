import { memo, useCallback, useMemo } from 'react';

import { useQueryParams } from '@/shared/hooks';
import { BoxPanel, Button, Callout, EmptyState, PageBody, Toolbar } from '@/shared/ui';

import { OFFER_DRAWER_PARAM } from '../constants/portal.constants';
import { useOfferFilters } from '../hooks/useOfferFilters';
import { useCompanyMembers } from '../service/company.queries';
import { useOffers } from '../service/offer.queries';
import type { OfferItem } from '../types/offer.types';
import OfferDetailDrawer from './OfferDetailDrawer';
import OfferFilters from './OfferFilters';
import OfferTable from './OfferTable';

export interface OffersTabProps {
  companyId: string;
  /** `recruiter:create` — cho phép thu hồi lời mời. */
  canWithdraw: boolean;
}

/**
 * Tab `offers` của `/recruiter/portal` (admin.md p6-08 §2.6): bảng lời mời của doanh nghiệp (cursor "Tải thêm") + lọc trạng thái/người gửi/ngày (URL-synced) + ngăn kéo chi tiết `?offerId=`.
 * Realtime do `useOfferSocket` (gắn ở trang): `offer:updated` làm mới danh sách, `offer:message-created` đẩy "Tin mới". Khoảng ngày lọc phía client trên phần ĐÃ TẢI (BE chưa có tham số ngày) — có ghi chú.
 * Lỗi tải mà chưa có dữ liệu → Callout + "Thử lại", không vẽ "Chưa có lời mời nào" khi BE hỏng.
 */
const OffersTab = memo(function OffersTab({ companyId, canWithdraw }: OffersTabProps) {
  const filters = useOfferFilters();
  const qp = useQueryParams({ resetPageOnChange: false });
  const { getParam, updateParams, searchParams } = qp;
  const offers = useOffers(companyId, filters.params);
  const members = useCompanyMembers(companyId);

  const { filterByRange } = filters;
  const rows = useMemo<OfferItem[]>(() => {
    const seen = new Map<string, OfferItem>();
    for (const page of offers.data?.pages ?? []) for (const o of page.data) seen.set(o.id, o);
    return filterByRange([...seen.values()]);
  }, [offers.data, filterByRange]);

  const openOfferId = getParam(OFFER_DRAWER_PARAM) || null;
  const detailHref = useCallback(
    (offerId: string) => {
      const next = new URLSearchParams(searchParams);
      next.set(OFFER_DRAWER_PARAM, offerId);
      return `?${next.toString()}`;
    },
    [searchParams],
  );
  const handleRowClick = useCallback(
    (o: OfferItem) => updateParams({ [OFFER_DRAWER_PARAM]: o.id }),
    [updateParams],
  );
  const handleClose = useCallback(() => updateParams({ [OFFER_DRAWER_PARAM]: null }), [updateParams]);

  const showLoadError = offers.isError && rows.length === 0;
  const emptyTitle = filters.hasFilter
    ? 'Không có lời mời nào khớp bộ lọc'
    : 'Chưa gửi lời mời nào. Tìm ứng viên rồi gửi lời mời đầu tiên.';

  return (
    <>
      <Toolbar
        left={
          <OfferFilters
            hasFilter={filters.hasFilter}
            members={members.data ?? []}
            range={filters.range}
            recruiter={filters.recruiterValue}
            status={filters.statusValue}
            onClear={filters.clear}
            onRangeChange={filters.setRange}
            onRecruiterChange={filters.setRecruiter}
            onStatusChange={filters.setStatus}
          />
        }
      />
      <PageBody overflow="hidden" stack={false}>
        <BoxPanel
          bodyOverflow="hidden"
          border="hairline"
          description={
            filters.hasRange && offers.hasNextPage
              ? 'Khoảng ngày chỉ lọc trên phần đã tải — bấm "Tải thêm" để xem tiếp.'
              : undefined
          }
          title="Lời mời đã gửi"
        >
          {showLoadError ? (
            <div className="p-2">
              <Callout
                action={
                  <Button size="sm" variant="stroke" onClick={() => void offers.refetch()}>
                    Thử lại
                  </Button>
                }
                description="Kiểm tra kết nối rồi thử lại."
                intent="error"
                title="Không tải được danh sách lời mời"
              />
            </div>
          ) : (
            <OfferTable
              detailHref={detailHref}
              emptyMessage={<EmptyState icon="inbox-bold" size="sm" title={emptyTitle} />}
              hasMore={!!offers.hasNextPage}
              loading={offers.isLoading}
              loadingMore={offers.isFetchingNextPage}
              rows={rows}
              onLoadMore={() => void offers.fetchNextPage()}
              onRowClick={handleRowClick}
            />
          )}
        </BoxPanel>
      </PageBody>
      <OfferDetailDrawer
        canWithdraw={canWithdraw}
        companyId={companyId}
        offerId={openOfferId}
        onClose={handleClose}
      />
    </>
  );
});

export default OffersTab;
