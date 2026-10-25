import { Button } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatDate, formatNumber } from '@/shared/utils/format';

import { CONTENT_TYPE_LABELS } from '../constants/economy.constants';
import type { AdminListing } from '../types/marketplace.types';

export type ListingActionKind = 'approve' | 'reject';

export interface PendingListingColumnActions {
  /** Có `gamification:update` — thiếu thì không có nút hành động (chỉ xem). */
  canUpdate: boolean;
  onAction: (listing: AdminListing, action: ListingActionKind) => void;
}

/** Cột bảng "Tin chờ duyệt" (admin.md p7-02 §2.1 "Chợ"): tiêu đề + loại, người bán, giá, ngày gửi, Duyệt/Từ chối. */
export function buildPendingListingColumns({
  canUpdate,
  onAction,
}: PendingListingColumnActions): TableColumn<AdminListing>[] {
  return [
    {
      key: 'listing',
      header: 'Tin niêm yết',
      cell: (r) => (
        <div className="min-w-0">
          <div className="truncate text-body-14 text-fg-1">{r.title}</div>
          <div className="truncate text-caption-12 text-fg-4">{CONTENT_TYPE_LABELS[r.contentType]}</div>
        </div>
      ),
    },
    {
      key: 'seller',
      header: 'Người bán',
      width: 180,
      cell: (r) => <span className="truncate text-fg-2">{r.sellerName ?? r.sellerId}</span>,
    },
    {
      key: 'price',
      header: 'Giá (xu)',
      width: 100,
      align: 'right',
      cell: (r) => <span className="tabular-nums">{formatNumber(r.price)}</span>,
    },
    {
      key: 'createdAt',
      header: 'Ngày gửi',
      width: 140,
      cell: (r) => <span className="text-fg-3">{formatDate(r.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: 180,
      cell: (r) =>
        canUpdate ? (
          <div className="flex justify-end gap-2">
            <Button
              aria-label={`Duyệt tin ${r.title}`}
              size="sm"
              variant="stroke"
              onClick={() => onAction(r, 'approve')}
            >
              Duyệt
            </Button>
            <Button
              aria-label={`Từ chối tin ${r.title}`}
              size="sm"
              variant="ghost"
              onClick={() => onAction(r, 'reject')}
            >
              Từ chối
            </Button>
          </div>
        ) : null,
    },
  ];
}
