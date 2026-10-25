import { memo, useMemo } from 'react';

import { Table, Text } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatNumber, formatPercent } from '@/shared/utils/format';

import { LEVEL_LABELS, LEVEL_OTHER_HINT } from '../constants/wellbeing.constants';
import type { LevelBucket } from '../types/wellbeing.types';
import { toLevelRows, type LevelRow } from '../utils/overview.utils';

export interface LevelDistributionTableProps {
  data: readonly LevelBucket[];
}

/** Bảng "phân bố mức hiện tại" — bản thay thế đọc được (a11y) và chính xác của biểu đồ cột ngang. Có nhóm "Khác" thì giải thích vì sao gộp. */
const LevelDistributionTable = memo(function LevelDistributionTable({
  data,
}: LevelDistributionTableProps) {
  const columns = useMemo<TableColumn<LevelRow>[]>(
    () => [
      { key: 'level', header: 'Mức', cell: (r) => LEVEL_LABELS[r.level] },
      {
        key: 'count',
        header: 'Số người',
        align: 'right',
        cell: (r) => <span className="tabular-nums">{formatNumber(r.count)}</span>,
      },
      {
        key: 'share',
        header: 'Tỉ lệ',
        align: 'right',
        cell: (r) => <span className="tabular-nums">{formatPercent(r.share)}</span>,
      },
    ],
    [],
  );
  const rows = useMemo(() => toLevelRows(data), [data]);

  return (
    <div className="flex flex-col gap-2">
      <Table
        columns={columns}
        data={rows}
        emptyMessage="Chưa có số liệu"
        pagination={false}
        rowKey={(r) => r.level}
      />
      {data.some((b) => b.level === 'OTHER') && (
        <Text size="tiny" skin="muted">
          {LEVEL_OTHER_HINT}
        </Text>
      )}
    </div>
  );
});

export default LevelDistributionTable;
