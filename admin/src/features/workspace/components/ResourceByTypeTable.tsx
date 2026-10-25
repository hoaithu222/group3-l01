import { memo, useMemo } from 'react';

import { BoxPanel, Table } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatFileSize, formatNumber } from '@/shared/utils/format';

import type { ResourceTypeStat } from '../types/workspace-resources.types';
import { resourceTypeLabel } from '../utils/workspace-resources.utils';

export interface ResourceByTypeTableProps {
  rows: readonly ResourceTypeStat[];
}

const COLUMNS: TableColumn<ResourceTypeStat>[] = [
  {
    key: 'type',
    header: 'Loại',
    cell: (row) => <span className="text-fg-1">{resourceTypeLabel(row.type)}</span>,
  },
  {
    key: 'count',
    header: 'Số tệp',
    align: 'right',
    width: 120,
    cell: (row) => <span className="tabular-nums text-fg-1">{formatNumber(row.count)}</span>,
  },
  {
    key: 'bytes',
    header: 'Dung lượng',
    align: 'right',
    width: 140,
    cell: (row) => (
      <span className="tabular-nums text-fg-1" title={`${formatNumber(row.bytes)} byte`}>
        {formatFileSize(row.bytes)}
      </span>
    ),
  },
];

const rowKey = (row: ResourceTypeStat) => row.type;

/**
 * Bảng "Theo loại" (p3-01 admin.md §2.1): loại · số tệp · dung lượng, cỡ compact. KHÔNG có cột
 * tên tệp — chỉ ba cột trên; lớn nhất xếp trước.
 */
const ResourceByTypeTable = memo(function ResourceByTypeTable({ rows }: ResourceByTypeTableProps) {
  const sorted = useMemo(() => [...rows].sort((a, b) => b.bytes - a.bytes), [rows]);

  return (
    <BoxPanel border="hairline" className="h-auto" title="Theo loại tệp">
      <Table
        columns={COLUMNS}
        data={sorted}
        emptyMessage="Kho tài liệu chưa có tệp nào"
        pagination={false}
        rowKey={rowKey}
      />
    </BoxPanel>
  );
});

export default ResourceByTypeTable;
