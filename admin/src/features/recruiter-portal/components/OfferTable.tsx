import { memo, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';

import { Button, Table } from '@/shared/ui';

import type { OfferItem } from '../types/offer.types';
import { buildOfferColumns } from './offer-table.columns';

const TABLE_MIN_WIDTH = 1160;

export interface OfferTableProps {
  rows: readonly OfferItem[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onRowClick: (offer: OfferItem) => void;
  detailHref: (offerId: string) => string;
  emptyMessage: ReactNode;
}

/** Bảng lời mời — danh sách theo CURSOR nên KHÔNG có phân trang số trang: "Tải thêm" nạp tiếp phía dưới. Bấm dòng mở ngăn kéo chi tiết (`?offerId=`). */
const OfferTable = memo(function OfferTable({
  rows,
  loading,
  hasMore,
  loadingMore,
  onLoadMore,
  onRowClick,
  detailHref,
  emptyMessage,
}: OfferTableProps) {
  const columns = useMemo(() => buildOfferColumns({ detailHref }), [detailHref]);
  const rowKey = useCallback((o: OfferItem) => o.id, []);
  const data = useMemo(() => [...rows], [rows]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <Table
        className="min-h-0 flex-1"
        columns={columns}
        data={data}
        emptyMessage={emptyMessage}
        fill
        loading={loading}
        minWidth={TABLE_MIN_WIDTH}
        pagination={false}
        rowKey={rowKey}
        onRowClick={onRowClick}
      />
      {hasMore ? (
        <div className="flex shrink-0 justify-center pb-2">
          <Button loading={loadingMore} size="sm" variant="stroke" onClick={onLoadMore}>
            Tải thêm
          </Button>
        </div>
      ) : null}
    </div>
  );
});

export default OfferTable;
