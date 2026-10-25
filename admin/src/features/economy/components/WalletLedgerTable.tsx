import { memo, useCallback, useMemo, useState } from 'react';

import { useQueryParams } from '@/shared/hooks';
import { Button, Dropdown, Table, Text, Toolbar } from '@/shared/ui';

import {
  ALL_FILTER,
  COIN_TX_TYPE_FILTER_OPTIONS,
  COIN_TX_TYPES,
  LEDGER_PAGE_SIZE,
} from '../constants/economy.constants';
import { useCursorStack } from '../hooks';
import { useUserTransactions } from '../service/economy.queries';
import type { AdminCoinTransaction } from '../types/economy.types';
import EconomyLoadError from './EconomyLoadError';
import LedgerDetailDrawer from './LedgerDetailDrawer';
import { buildLedgerColumns } from './wallet-ledger.columns';

export interface WalletLedgerTableProps {
  userId: string;
}

/**
 * Sổ cái của một người (admin.md p7-02 §2.2): mới → cũ, phân trang CURSOR (không biết tổng số nên chỉ có "Trang trước/sau"), lọc theo loại (`?type=` trên URL).
 * Đổi bộ lọc thì về trang đầu (cursor cũ không dùng được cho lọc mới). Mỗi dòng có "Chi tiết" mở ngăn kéo (mã tham chiếu, người thực hiện, lý do đầy đủ).
 * Nơi dùng đặt `key={userId}` để đổi người là chồng cursor và ngăn kéo về trạng thái sạch.
 */
const WalletLedgerTable = memo(function WalletLedgerTable({ userId }: WalletLedgerTableProps) {
  const { getParam, setParam } = useQueryParams();
  const type = COIN_TX_TYPES.find((t) => t === getParam('type'));
  const pages = useCursorStack();
  const [detail, setDetail] = useState<AdminCoinTransaction | null>(null);

  const { data, error, isLoading, refetch } = useUserTransactions({
    userId,
    type,
    cursor: pages.cursor,
    limit: LEDGER_PAGE_SIZE,
  });

  const handleType = useCallback(
    (next: string) => {
      setParam('type', next === ALL_FILTER ? null : next);
      pages.reset();
    },
    [pages, setParam],
  );
  const columns = useMemo(() => buildLedgerColumns({ onOpen: setDetail }), []);
  const nextCursor = data?.meta.hasMore ? data.meta.nextCursor : null;

  return (
    <section className="flex flex-col gap-2">
      <Text weight="bold">Sổ cái</Text>
      <Toolbar
        left={
          <Dropdown
            aria-label="Lọc theo loại giao dịch"
            className="w-56"
            options={COIN_TX_TYPE_FILTER_OPTIONS}
            size="sm"
            value={type ?? ALL_FILTER}
            onValueChange={handleType}
          />
        }
      />
      {error && !data ? (
        <EconomyLoadError
          error={error}
          title="Không tải được sổ cái"
          onRetry={() => void refetch()}
        />
      ) : (
        <Table
          columns={columns}
          data={data?.data ?? []}
          emptyMessage={
            type
              ? 'Không có giao dịch nào thuộc loại này'
              : 'Người dùng này chưa có giao dịch xu nào'
          }
          loading={isLoading}
          pagination={false}
          rowKey={(r) => r.id}
        />
      )}
      <div className="flex justify-end gap-2">
        {pages.hasPrev && (
          <Button size="sm" variant="ghost" onClick={pages.pop}>
            Trang trước
          </Button>
        )}
        {nextCursor && (
          <Button size="sm" variant="stroke" onClick={() => pages.push(nextCursor)}>
            Trang sau
          </Button>
        )}
      </div>
      <LedgerDetailDrawer tx={detail} onClose={() => setDetail(null)} />
    </section>
  );
});

export default WalletLedgerTable;
