import { Badge, Button } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatNumber, statusBadge } from '@/shared/utils/format';

import { CONTENT_TYPE_LABELS } from '../constants/economy.constants';
import type { AdminListing } from '../types/marketplace.types';

export type ListingModerationAction = 'hide' | 'restore';

export interface ReportedListingColumnActions {
  /** Có `moderation:update` — thiếu thì không có nút hành động (chỉ xem). */
  canModerate: boolean;
  onAction: (listing: AdminListing, action: ListingModerationAction) => void;
}

/** Cột bảng "Tin bị báo cáo" (admin.md p7-02 §2.3 "Moderation — listing"): tin, người bán, số báo cáo, lượt mua, Ẩn/Khôi phục. */
export function buildReportedListingColumns({
  canModerate,
  onAction,
}: ReportedListingColumnActions): TableColumn<AdminListing>[] {
  return [
    {
      key: 'listing',
      header: 'Tin niêm yết',
      cell: (r) => (
        <div className="min-w-0">
          <div className="truncate text-body-14 text-fg-1">{r.title}</div>
          <div className="truncate text-caption-12 text-fg-4">
            {CONTENT_TYPE_LABELS[r.contentType]} · {r.sellerName ?? r.sellerId}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: 120,
      cell: (r) => {
        const meta = statusBadge('listing', r.status);
        return (
          <Badge color={meta.variant} size="sm" variant="tinted">
            {meta.label}
          </Badge>
        );
      },
    },
    {
      key: 'reportCount',
      header: 'Báo cáo',
      width: 90,
      align: 'right',
      cell: (r) => <span className="tabular-nums text-warning-5">{formatNumber(r.reportCount)}</span>,
    },
    {
      key: 'sales',
      header: 'Lượt mua',
      width: 90,
      align: 'right',
      cell: (r) => <span className="tabular-nums">{formatNumber(r.sales)}</span>,
    },
    {
      key: 'actions',
      header: '',
      width: 160,
      cell: (r) =>
        canModerate ? (
          <div className="flex justify-end">
            {r.status === 'ACTIVE' ? (
              <Button aria-label={`Ẩn tin ${r.title}`} size="sm" variant="ghost" onClick={() => onAction(r, 'hide')}>
                Ẩn
              </Button>
            ) : (
              <Button
                aria-label={`Khôi phục tin ${r.title}`}
                size="sm"
                variant="stroke"
                onClick={() => onAction(r, 'restore')}
              >
                Khôi phục
              </Button>
            )}
          </div>
        ) : null,
    },
  ];
}
