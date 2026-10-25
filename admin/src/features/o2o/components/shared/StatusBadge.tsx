import { memo } from 'react';

import { Badge } from '@/shared/ui';

import type { StatusMeta } from '../../constants/print.constants';

export interface StatusBadgeProps {
  /** `undefined` khi BE trả trạng thái lạ (thêm mới) — hiện chính mã (`fallback`) thay vì trống. */
  meta: StatusMeta | undefined;
  fallback: string;
}

/** Badge trạng thái CÓ CHỮ + màu (không chỉ dựa vào màu). */
const StatusBadge = memo(function StatusBadge({ meta, fallback }: StatusBadgeProps) {
  return (
    <Badge color={meta?.color ?? 'neutral'} variant="tinted">
      {meta?.label ?? fallback}
    </Badge>
  );
});

export default StatusBadge;
