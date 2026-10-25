import { memo } from 'react';

import { CopyableText, Drawer } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import type { AdminCoinTransaction } from '../types/economy.types';
import {
  formatDateTime,
  formatSignedCoins,
  shortId,
  txTypeLabel,
} from '../utils/economy-format.utils';

export interface LedgerDetailDrawerProps {
  /** `null` = đóng. */
  tx: AdminCoinTransaction | null;
  onClose: () => void;
}

const Field = memo(function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-body-13 text-fg-3">{label}</dt>
      <dd className="text-body-14 text-fg-1">{children}</dd>
    </div>
  );
});

const Id = memo(function Id({ value, label }: { value: string | null; label: string }) {
  return value ? (
    <CopyableText display={shortId(value)} label={label} value={value} />
  ) : (
    <span className="text-fg-4">—</span>
  );
});

/**
 * Chi tiết MỘT dòng sổ cái (admin.md p7-02 §2.2): số xu, số dư sau, mã tham chiếu (loại + id), đối tác, người thực hiện điều chỉnh và lý do đầy đủ —
 * những thứ quá dài để đặt trong bảng. Sổ cái chỉ thêm, không sửa: ngăn kéo chỉ ĐỌC, không có hành động nào.
 */
const LedgerDetailDrawer = memo(function LedgerDetailDrawer({
  tx,
  onClose,
}: LedgerDetailDrawerProps) {
  return (
    <Drawer open={!!tx} title="Chi tiết giao dịch xu" onOpenChange={(open) => !open && onClose()}>
      {tx && (
        <dl className="flex flex-col gap-3 p-4">
          <Field label="Thời điểm">{formatDateTime(tx.at)}</Field>
          <Field label="Loại">{txTypeLabel(tx)}</Field>
          <Field label="Số xu">{formatSignedCoins(tx.amount)}</Field>
          <Field label="Số dư sau giao dịch">{formatNumber(tx.balanceAfter)} xu</Field>
          <Field label="Tham chiếu">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-fg-3">{tx.refType}</span>
              <Id label="mã tham chiếu" value={tx.refId} />
            </span>
          </Field>
          <Field label="Đối tác">
            <Id label="ID đối tác" value={tx.counterpartyId} />
          </Field>
          <Field label="Người thực hiện">
            <Id label="ID người thực hiện" value={tx.actorId} />
          </Field>
          <Field label="Lý do / ghi chú">
            {tx.note ? (
              <span className="whitespace-pre-wrap break-words">{tx.note}</span>
            ) : (
              <span className="text-fg-4">—</span>
            )}
          </Field>
        </dl>
      )}
    </Drawer>
  );
});

export default LedgerDetailDrawer;
