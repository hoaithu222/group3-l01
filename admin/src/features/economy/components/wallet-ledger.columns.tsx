import { Button } from '@/shared/ui';
import type { TableColumn } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';
import { cn } from '@/shared/utils/style/cn';

import type { AdminCoinTransaction } from '../types/economy.types';
import { formatDateTime, formatSignedCoins, txTypeLabel } from '../utils/economy-format.utils';

export interface LedgerColumnActions {
  onOpen: (tx: AdminCoinTransaction) => void;
}

/**
 * Cột bảng sổ cái của một người (admin.md p7-02 §2.2): thời điểm, loại, số xu có dấu (xanh nhận / đỏ tiêu), số dư sau giao dịch, ghi chú (lý do điều chỉnh).
 * Mã tham chiếu, đối tác và người thực hiện dài nên nằm ở ngăn kéo "Chi tiết" (nút mỗi dòng, có tên truy cập theo dòng để bàn phím/đọc màn hình phân biệt được).
 */
export function buildLedgerColumns({
  onOpen,
}: LedgerColumnActions): TableColumn<AdminCoinTransaction>[] {
  return [
    {
      key: 'at',
      header: 'Thời điểm',
      width: 150,
      cell: (r) => (
        <span className="tabular-nums text-caption-12 text-fg-3">{formatDateTime(r.at)}</span>
      ),
    },
    { key: 'type', header: 'Loại', width: 160, cell: (r) => txTypeLabel(r) },
    {
      key: 'amount',
      header: 'Số xu',
      width: 110,
      align: 'right',
      cell: (r) => (
        <span
          className={cn(
            'tabular-nums',
            r.amount > 0 && 'text-success',
            r.amount < 0 && 'text-error',
          )}
        >
          {formatSignedCoins(r.amount)}
        </span>
      ),
    },
    {
      key: 'balanceAfter',
      header: 'Số dư sau',
      width: 120,
      align: 'right',
      cell: (r) => <span className="tabular-nums">{formatNumber(r.balanceAfter)}</span>,
    },
    {
      key: 'note',
      header: 'Ghi chú',
      cell: (r) =>
        r.note ? (
          <span className="block truncate text-fg-2" title={r.note}>
            {r.note}
          </span>
        ) : (
          <span className="text-fg-4">—</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      width: 90,
      cell: (r) => (
        <Button
          aria-label={`Chi tiết giao dịch ${txTypeLabel(r)} lúc ${formatDateTime(r.at)}`}
          size="sm"
          variant="ghost"
          onClick={() => onOpen(r)}
        >
          Chi tiết
        </Button>
      ),
    },
  ];
}
