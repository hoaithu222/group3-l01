import { memo, useMemo } from 'react';

import { Badge, BoxGrid, BoxPanel, Table } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import {
  finiteOr,
  formatFileSize,
  formatNumber,
  formatPercent,
  percentOf,
  statusBadge,
} from '@/shared/utils/format';

import {
  labelOf,
  STORAGE_KIND_LABELS,
  STORAGE_STATUS_LABELS,
  STORAGE_STATUS_ORDER,
} from '../constants/storage.constants';
import type { StorageBucket, StorageStats } from '../types/storage.types';

export interface StorageTablesProps {
  stats: StorageStats;
}

interface TableRow {
  key: string;
  label: string;
  count: number;
  bytes: number;
  /** % trên tổng của bảng (dung lượng cho bảng loại tệp, số tệp cho bảng trạng thái); `null` khi tổng = 0. */
  share: number | null;
}

const num = (value: number) => (
  <span className="tabular-nums text-fg-1">{formatNumber(value)}</span>
);
const shareCell = (share: number | null) => (
  <span className="tabular-nums text-fg-3">{share === null ? '—' : formatPercent(share)}</span>
);

const KIND_COLUMNS: TableColumn<TableRow>[] = [
  { key: 'label', header: 'Loại tệp', cell: (r) => <span className="text-fg-1">{r.label}</span> },
  { key: 'count', header: 'Số tệp', align: 'right', width: 110, cell: (r) => num(r.count) },
  {
    key: 'bytes',
    header: 'Dung lượng',
    align: 'right',
    width: 130,
    cell: (r) => <span className="tabular-nums text-fg-1">{formatFileSize(r.bytes)}</span>,
  },
  {
    key: 'share',
    header: '% dung lượng',
    align: 'right',
    width: 130,
    cell: (r) => shareCell(r.share),
  },
];

const STATUS_COLUMNS: TableColumn<TableRow>[] = [
  {
    key: 'label',
    header: 'Trạng thái',
    cell: (r) => {
      const meta = statusBadge('asset', r.key);
      return (
        <Badge color={meta.variant} variant="tinted">
          {labelOf(STORAGE_STATUS_LABELS, r.key)}
        </Badge>
      );
    },
  },
  { key: 'count', header: 'Số tệp', align: 'right', width: 110, cell: (r) => num(r.count) },
  {
    key: 'bytes',
    header: 'Dung lượng',
    align: 'right',
    width: 130,
    cell: (r) => <span className="tabular-nums text-fg-1">{formatFileSize(r.bytes)}</span>,
  },
  { key: 'share', header: '% số tệp', align: 'right', width: 110, cell: (r) => shareCell(r.share) },
];

const rowKey = (row: TableRow) => row.key;

function toRows(
  buckets: readonly StorageBucket[],
  labels: Readonly<Record<string, string>>,
  shareOf: 'bytes' | 'count',
): TableRow[] {
  const total = buckets.reduce((sum, b) => sum + finiteOr(b[shareOf]), 0);
  return buckets.map((b) => ({
    key: b.key,
    label: labelOf(labels, b.key),
    count: b.count,
    bytes: b.bytes,
    share: percentOf(b[shareOf], total, 1),
  }));
}

/**
 * Hai bảng "Theo loại tệp" và "Theo trạng thái" (admin.md p0-05 §2.1).
 *
 * Lệch kế hoạch: kế hoạch ghi cột "% READY/REJECTED" cho bảng loại tệp, nhưng
 * `GET /admin/storage/stats` chỉ nhóm RIÊNG theo kind và RIÊNG theo status (không có
 * kind × status) nên không suy ra được — bảng loại tệp hiện `% dung lượng`, còn tỉ lệ
 * READY/REJECTED nằm ở bảng trạng thái (`% số tệp`).
 */
const StorageTables = memo(function StorageTables({ stats }: StorageTablesProps) {
  const kindRows = useMemo(
    () =>
      toRows(
        [...stats.byKind].sort((a, b) => b.bytes - a.bytes),
        STORAGE_KIND_LABELS,
        'bytes',
      ),
    [stats.byKind],
  );

  // Luôn đủ 5 trạng thái theo thứ tự vòng đời; BE chỉ trả nhóm đã có tệp.
  const statusRows = useMemo(() => {
    const byKey = new Map(stats.byStatus.map((b) => [b.key, b]));
    const filled = STORAGE_STATUS_ORDER.map((key) => byKey.get(key) ?? { key, count: 0, bytes: 0 });
    const extra = stats.byStatus.filter(
      (b) => !(STORAGE_STATUS_ORDER as readonly string[]).includes(b.key),
    );
    return toRows([...filled, ...extra], STORAGE_STATUS_LABELS, 'count');
  }, [stats.byStatus]);

  return (
    <BoxGrid gap="md" min="lg">
      <BoxPanel border="hairline" title="Theo loại tệp">
        <Table
          columns={KIND_COLUMNS}
          data={kindRows}
          emptyMessage="Chưa có tệp nào"
          pagination={false}
          rowKey={rowKey}
        />
      </BoxPanel>
      <BoxPanel border="hairline" title="Theo trạng thái">
        <Table columns={STATUS_COLUMNS} data={statusRows} pagination={false} rowKey={rowKey} />
      </BoxPanel>
    </BoxGrid>
  );
});

export default StorageTables;
