import { memo, useMemo } from 'react';

import { Badge, Text } from '@/shared/ui';

import { reasonLabel } from '../constants/notifications.constants';
import type { ReasonCounts } from '../types/notifications-config.types';

export interface ReasonChipsProps {
  counts: ReasonCounts;
  /** Bảng `mã → nhãn`; mã ngoài bảng hiện thô. */
  labels: Record<string, string>;
  /** Câu hiện khi không có lý do nào (số liệu bằng 0). */
  emptyText: string;
}

/** Danh sách "nhãn · số" của một `ReasonCounts`, nhiều trước — dùng làm `footer` của KPI. */
const ReasonChips = memo(function ReasonChips({ counts, labels, emptyText }: ReasonChipsProps) {
  const entries = useMemo(
    () =>
      Object.entries(counts)
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1]),
    [counts],
  );

  if (entries.length === 0) {
    return (
      <Text size="tiny" skin="muted">
        {emptyText}
      </Text>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([code, n]) => (
        <Badge key={code} color="neutral" size="sm" variant="tinted">
          {reasonLabel(labels, code)} · {n}
        </Badge>
      ))}
    </div>
  );
});

export default ReasonChips;
