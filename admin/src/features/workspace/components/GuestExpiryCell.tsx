import { memo } from 'react';

import { Badge } from '@/shared/ui';
import { formatDate } from '@/shared/utils/format';

import { guestExpiryState } from '../utils/workspace-access.utils';

export interface GuestExpiryCellProps {
  /** ISO-8601 hoặc `null` (không phải khách). */
  expiresAt: string | null;
}

/**
 * Ô "Hết hạn" của khách (p3-04 admin.md §1/§4): ngày giờ hết hạn; còn ≤ 48 giờ thì kèm nhãn "Sắp hết
 * hạn", đã quá hạn (chưa được quét thu hồi) thì "Đã quá hạn". Không phải khách → "—".
 */
const GuestExpiryCell = memo(function GuestExpiryCell({ expiresAt }: GuestExpiryCellProps) {
  if (!expiresAt) return <span className="text-fg-4">—</span>;
  const state = guestExpiryState(expiresAt);

  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="tabular-nums text-caption-12 text-fg-3">
        {formatDate(expiresAt, 'HH:mm DD/MM/YYYY')}
      </span>
      {state === 'soon' && (
        <Badge color="warning" size="sm" variant="tinted">
          Sắp hết hạn
        </Badge>
      )}
      {state === 'expired' && (
        <Badge color="error" size="sm" variant="tinted">
          Đã quá hạn
        </Badge>
      )}
    </div>
  );
});

export default GuestExpiryCell;
