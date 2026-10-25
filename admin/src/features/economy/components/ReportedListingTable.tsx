import { memo, useCallback, useMemo, useState } from 'react';

import { useAuthStore } from '@/app/store';
import { Button, Callout, ConfirmWithReasonModal, Table, Text } from '@/shared/ui';

import { useCursorStack } from '../hooks';
import { useHideListing, useRestoreListing } from '../service/economy.mutations';
import { useReportedListings } from '../service/economy.queries';
import type { AdminListing } from '../types/marketplace.types';
import EconomyLoadError from './EconomyLoadError';
import { buildReportedListingColumns, type ListingModerationAction } from './reported-listing-table.columns';

interface PendingModeration {
  listing: AdminListing;
  action: ListingModerationAction;
}

/**
 * Bảng "Tin bị báo cáo" (admin.md p7-02 §2.3 "Moderation — listing") — `GET /admin/economy/listings/reported` (nhiều báo cáo nhất trước).
 * ⚠️ KHÁC bảng "Tin chờ duyệt": tin ở đây ĐÃ được duyệt (`ACTIVE`/`HIDDEN`) và bị người dùng báo cáo (`reportCount` — cột riêng của
 * `MarketplaceListing`, KHÔNG đi qua hàng đợi báo cáo chung `moderation` targetType — xem báo cáo bàn giao). Ẩn tin tự động hoàn xu cho
 * người mua trong hạn (`refundWindowDays`) — BE xử lý, ở đây chỉ nói rõ tác động trước khi xác nhận. Quyền `moderation:update`.
 */
const ReportedListingTable = memo(function ReportedListingTable() {
  const canModerate = useAuthStore((s) => s.hasPermission)('moderation', 'update');
  const pages = useCursorStack();
  const { data, error, isLoading, refetch } = useReportedListings(pages.cursor);
  const hide = useHideListing();
  const restore = useRestoreListing();
  const [pending, setPending] = useState<PendingModeration | null>(null);

  const handleAction = useCallback(
    (listing: AdminListing, action: ListingModerationAction) => setPending({ listing, action }),
    [],
  );

  const handleConfirm = useCallback(
    async (reason: string) => {
      if (!pending) return;
      const mutation = pending.action === 'hide' ? hide : restore;
      await mutation.mutateAsync({ id: pending.listing.id, reason });
      setPending(null);
    },
    [pending, hide, restore],
  );

  const columns = useMemo(
    () => buildReportedListingColumns({ canModerate, onAction: handleAction }),
    [canModerate, handleAction],
  );
  const nextCursor = data?.meta.hasMore ? data.meta.nextCursor : null;
  const failed = !!error && !data;

  return (
    <div className="flex flex-col gap-2">
      <Text weight="bold">Tin bị báo cáo</Text>
      {failed ? (
        <EconomyLoadError error={error} title="Không tải được tin bị báo cáo" onRetry={() => void refetch()} />
      ) : (
        <Table
          columns={columns}
          data={data?.data ?? []}
          emptyMessage="Không có tin niêm yết nào bị báo cáo"
          loading={isLoading}
          pagination={false}
          rowKey={(r) => r.id}
        />
      )}
      <div className="flex justify-end gap-2">
        {pages.hasPrev && (
          <Button size="sm" variant="ghost" onClick={pages.pop}>
            Trang trước
          </Button>
        )}
        {nextCursor && (
          <Button size="sm" variant="stroke" onClick={() => pages.push(nextCursor)}>
            Trang sau
          </Button>
        )}
      </div>

      <ConfirmWithReasonModal
        confirmLabel={pending?.action === 'hide' ? 'Ẩn tin' : 'Khôi phục tin'}
        confirmTone={pending?.action === 'hide' ? 'danger' : 'primary'}
        impact={
          pending ? (
            <div className="flex flex-col gap-2">
              <span>
                {pending.action === 'hide' ? 'Ẩn' : 'Khôi phục'} tin “{pending.listing.title}” của{' '}
                {pending.listing.sellerName ?? pending.listing.sellerId} ({pending.listing.reportCount} lượt báo cáo).
              </span>
              {pending.action === 'hide' && pending.listing.sales > 0 && (
                <Callout
                  description={`Tối đa ${pending.listing.sales} người đã mua tin này trong vòng hoàn tiền sẽ được hoàn xu tự động; người bán bị trừ xu tương ứng (trừ tối đa số dư hiện có).`}
                  intent="warning"
                  variant="ghost"
                />
              )}
            </div>
          ) : null
        }
        open={pending !== null}
        title={pending ? `${pending.action === 'hide' ? 'Ẩn' : 'Khôi phục'} tin niêm yết` : ''}
        onConfirm={handleConfirm}
        onOpenChange={(open) => !open && setPending(null)}
      />
    </div>
  );
});

export default ReportedListingTable;
