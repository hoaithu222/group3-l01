import { memo, useMemo } from 'react';

import { Table, Text } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import type { EconomyTopItem } from '../types/economy.types';

export interface TopItemsTableProps {
  items: readonly EconomyTopItem[];
}

/** Top vật phẩm theo số người đang sở hữu (BE trả tối đa 5). Danh sách "top listing" của chợ thuộc P1 — chợ chưa làm nên chưa có. */
const TopItemsTable = memo(function TopItemsTable({ items }: TopItemsTableProps) {
  const columns = useMemo<TableColumn<EconomyTopItem>[]>(
    () => [
      {
        key: 'item',
        header: 'Vật phẩm',
        cell: (r) => (
          <div className="min-w-0">
            <div className="truncate text-body-14 text-fg-1">{r.name}</div>
            <div className="truncate text-caption-12 text-fg-4">{r.code}</div>
          </div>
        ),
      },
      {
        key: 'owners',
        header: 'Người sở hữu',
        width: 130,
        align: 'right',
        cell: (r) => <span className="tabular-nums">{formatNumber(r.owners)}</span>,
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-1">
      <Text weight="bold">Top vật phẩm</Text>
      <Table
        columns={columns}
        data={[...items]}
        emptyMessage="Chưa có ai sở hữu vật phẩm nào"
        pagination={false}
        rowKey={(r) => r.itemId}
      />
    </div>
  );
});

export default TopItemsTable;
