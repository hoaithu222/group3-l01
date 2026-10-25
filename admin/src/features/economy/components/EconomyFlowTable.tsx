import { memo, useMemo } from 'react';

import { Table } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatDate, formatNumber } from '@/shared/utils/format';

import type { EconomyDayPoint } from '../types/economy.types';
import { formatSignedCoins } from '../utils/economy-format.utils';

export interface EconomyFlowTableProps {
  data: readonly EconomyDayPoint[];
}

/** Bảng số liệu theo ngày — bản thay thế đọc được (a11y) và chính xác của biểu đồ đường; mới nhất trước. */
const EconomyFlowTable = memo(function EconomyFlowTable({ data }: EconomyFlowTableProps) {
  const columns = useMemo<TableColumn<EconomyDayPoint>[]>(() => {
    const amount = (
      key: 'issued' | 'spent' | 'burned',
      header: string,
    ): TableColumn<EconomyDayPoint> => ({
      key,
      header,
      align: 'right',
      cell: (r) => <span className="tabular-nums">{formatNumber(r[key])}</span>,
    });
    return [
      {
        key: 'date',
        header: 'Ngày',
        width: 120,
        cell: (r) => <span className="tabular-nums">{formatDate(r.date)}</span>,
      },
      amount('issued', 'Phát hành'),
      amount('spent', 'Đã tiêu'),
      amount('burned', 'Đốt phí'),
      {
        key: 'adjusted',
        header: 'Điều chỉnh ròng',
        align: 'right',
        cell: (r) => <span className="tabular-nums">{formatSignedCoins(r.adjusted)}</span>,
      },
    ];
  }, []);
  const rows = useMemo(() => [...data].reverse(), [data]);

  return (
    <Table
      columns={columns}
      data={rows}
      emptyMessage="Chưa có số liệu trong khoảng đã chọn"
      pagination={false}
      rowKey={(r) => r.date}
    />
  );
});

export default EconomyFlowTable;
