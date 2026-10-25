import { memo, useCallback, useMemo, useState } from 'react';

import { useAuthStore } from '@/app/store';
import { Button, ConfirmWithReasonModal, Table, Text } from '@/shared/ui';

import { useCursorStack } from '../hooks';
import { useApproveListing, useRejectListing } from '../service/economy.mutations';
import { usePendingListings } from '../service/economy.queries';
import type { AdminListing } from '../types/marketplace.types';
import EconomyLoadError from './EconomyLoadError';
import { buildPendingListingColumns, type ListingActionKind } from './pending-listing-table.columns';

interface PendingAction {
  listing: AdminListing;
  action: ListingActionKind;
}

/**
 * Bảng "Tin chờ duyệt" (admin.md p7-02 §2.1 "Chợ") — `GET /admin/economy/listings` (cursor, chỉ `PENDING_REVIEW`). Duyệt/Từ chối đều bắt buộc
 * lý do (audit `marketplace.listing.approve|reject`, quyền `gamification:update` — cùng nhóm quyền "sửa vật phẩm/rule/quest" của tab Kinh tế xu,
 * admin.md §1). Ẩn/khôi phục tin ĐANG BÁN (đã duyệt) là việc của `moderation` (`moderation:update`) — nằm ở khu vực Kiểm duyệt, KHÔNG lặp lại ở đây
 * (xem báo cáo bàn giao: hàng đợi Kiểm duyệt dùng targetType riêng của module đó, chợ tài liệu tự quản lý listing của chính nó qua các route này).
 */
const PendingListingTable = memo(function PendingListingTable() {
  const canUpdate = useAuthStore((s) => s.hasPermission)('gamification', 'update');
  const pages = useCursorStack();
  const { data, error, isLoading, refetch } = usePendingListings(pages.cursor);
  const approve = useApproveListing();
  const reject = useRejectListing();
  const [pending, setPending] = useState<PendingAction | null>(null);

  const handleAction = useCallback(
    (listing: AdminListing, action: ListingActionKind) => setPending({ listing, action }),
    [],
  );

  const handleConfirm = useCallback(
    async (reason: string) => {
      if (!pending) return;
      const mutation = pending.action === 'approve' ? approve : reject;
      await mutation.mutateAsync({ id: pending.listing.id, reason });
      setPending(null);
    },
    [pending, approve, reject],
  );

  const columns = useMemo(
    () => buildPendingListingColumns({ canUpdate, onAction: handleAction }),
    [canUpdate, handleAction],
  );
  const nextCursor = data?.meta.hasMore ? data.meta.nextCursor : null;
  const failed = !!error && !data;

  return (
    <div className="flex flex-col gap-2">
      <Text weight="bold">Tin chờ duyệt</Text>
      {failed ? (
        <EconomyLoadError error={error} title="Không tải được tin chờ duyệt" onRetry={() => void refetch()} />
      ) : (
        <Table
          columns={columns}
          data={data?.data ?? []}
          emptyMessage="Không có tin niêm yết nào đang chờ duyệt"
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
        confirmLabel={pending?.action === 'approve' ? 'Duyệt tin' : 'Từ chối tin'}
        confirmTone={pending?.action === 'reject' ? 'danger' : 'primary'}
        impact={
          pending ? (
            <div className="flex flex-col gap-1">
              <span>
                {pending.action === 'approve' ? 'Duyệt' : 'Từ chối'} tin “{pending.listing.title}” của{' '}
                {pending.listing.sellerName ?? pending.listing.sellerId}.
              </span>
              <span className="text-fg-4">
                {pending.action === 'approve'
                  ? 'Tin chuyển sang Đang bán, hiện ngay trong chợ tài liệu cho người dùng.'
                  : 'Tin chuyển sang Đã gỡ — người bán phải niêm yết lại nếu muốn bán tiếp.'}
              </span>
            </div>
          ) : null
        }
        open={pending !== null}
        title={pending ? `${pending.action === 'approve' ? 'Duyệt' : 'Từ chối'} tin niêm yết` : ''}
        onConfirm={handleConfirm}
        onOpenChange={(open) => !open && setPending(null)}
      />
    </div>
  );
});

export default PendingListingTable;
