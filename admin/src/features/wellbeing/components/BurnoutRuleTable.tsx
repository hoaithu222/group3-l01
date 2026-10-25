import { memo, useMemo } from 'react';

import { Table } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import { AGGREGATE_LABELS, METRIC_LABELS, OP_LABELS } from '../constants/wellbeing.constants';
import type { BurnoutRule } from '../types/wellbeing.types';

export interface BurnoutRuleTableProps {
  rules: readonly BurnoutRule[];
}

/** Ngưỡng có thể lẻ (vd trung bình 2,5) — chỉ hiện phần thập phân khi có. */
const formatThreshold = (n: number): string => formatNumber(n, Number.isInteger(n) ? 0 : 2);

/**
 * Bảng luật đang hiệu lực (admin.md p7-03 §2.2, chỉ đọc): nhãn (+ mã), chỉ số, cách tổng hợp, số ngày, điều kiện (phép so sánh + ngưỡng), điểm cộng.
 * Chỉ số/cách tổng hợp lạ (BE thêm về sau, FE chưa biết) hiện đúng mã thay vì trống.
 */
const BurnoutRuleTable = memo(function BurnoutRuleTable({ rules }: BurnoutRuleTableProps) {
  const columns = useMemo<TableColumn<BurnoutRule>[]>(
    () => [
      {
        key: 'label',
        header: 'Luật',
        cell: (r) => (
          <div className="min-w-0">
            <div className="text-body-14 text-fg-1">{r.label}</div>
            <div className="truncate font-mono text-caption-12 text-fg-4">{r.id}</div>
          </div>
        ),
      },
      { key: 'metric', header: 'Chỉ số', cell: (r) => METRIC_LABELS[r.metric] ?? r.metric },
      {
        key: 'aggregate',
        header: 'Cách tổng hợp',
        cell: (r) => AGGREGATE_LABELS[r.aggregate] ?? r.aggregate,
      },
      {
        key: 'days',
        header: 'Số ngày',
        width: 90,
        align: 'right',
        cell: (r) => <span className="tabular-nums">{r.days}</span>,
      },
      {
        key: 'condition',
        header: 'Điều kiện',
        width: 110,
        align: 'right',
        cell: (r) => (
          <span className="tabular-nums">{`${OP_LABELS[r.op]?.symbol ?? r.op} ${formatThreshold(r.threshold)}`}</span>
        ),
      },
      {
        key: 'points',
        header: 'Điểm cộng',
        width: 100,
        align: 'right',
        cell: (r) => <span className="tabular-nums">{`+${r.points}`}</span>,
      },
    ],
    [],
  );
  const data = useMemo(() => [...rules], [rules]);

  return (
    <Table
      columns={columns}
      data={data}
      emptyMessage="Chưa có luật nào"
      pagination={false}
      rowKey={(r) => r.id}
    />
  );
});

export default BurnoutRuleTable;
