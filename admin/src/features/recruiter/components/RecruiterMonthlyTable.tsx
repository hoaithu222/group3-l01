import { memo, useMemo } from 'react';

import { Table } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import { OFFER_SERIES } from '../constants/recruiter-chart.constants';
import type { MonthlyOfferStats } from '../types/recruiter.types';
import { periodLabel } from '../utils/stats.utils';

export interface RecruiterMonthlyTableProps {
  data: readonly MonthlyOfferStats[];
}

/** Bảng số liệu theo tháng — bản thay thế đọc được (a11y) và chính xác của biểu đồ cột. */
const RecruiterMonthlyTable = memo(function RecruiterMonthlyTable({
  data,
}: RecruiterMonthlyTableProps) {
  const columns = useMemo<TableColumn<MonthlyOfferStats>[]>(
    () => [
      {
        key: 'period',
        header: 'Tháng',
        width: 100,
        cell: (r) => <span className="tabular-nums">{periodLabel(r.period)}</span>,
      },
      ...OFFER_SERIES.map(
        (s): TableColumn<MonthlyOfferStats> => ({
          key: s.key,
          header: s.label,
          width: 110,
          align: 'right',
          cell: (r) => <span className="tabular-nums">{formatNumber(r[s.key])}</span>,
        }),
      ),
    ],
    [],
  );

  return (
    <Table
      columns={columns}
      data={[...data]}
      emptyMessage="Không có lời mời nào trong khoảng đã chọn"
      pagination={false}
      rowKey={(r) => r.period}
    />
  );
});

export default RecruiterMonthlyTable;
