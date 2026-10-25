import { memo } from 'react';

import { Text } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import type { NotificationLimitsView } from '../types/notification-stats.types';

interface LimitRow {
  key: keyof NotificationLimitsView;
  label: string;
  unit: string;
}

const LIMIT_ROWS: LimitRow[] = [
  { key: 'pushBatchWindowSeconds', label: 'Cửa sổ gộp push', unit: 'giây' },
  { key: 'inboxRetentionDays', label: 'Giữ mục hộp thư (Hoạt động)', unit: 'ngày' },
  { key: 'fanoutChunkSize', label: 'Cỡ lô fan-out', unit: 'người nhận' },
  { key: 'maxDevicesPerUser', label: 'Thiết bị nhận push tối đa', unit: 'thiết bị / người' },
  { key: 'statsRetentionDays', label: 'Giữ số liệu thông báo', unit: 'ngày' },
];

interface NotificationLimitsListProps {
  limits: NotificationLimitsView;
}

/**
 * Khối "Giới hạn (chỉ đọc)" — `limits` của `GET /admin/notifications/stats` (BE lấy từ
 * `LIMITS.notification`). Chỉ hiển thị: các giá trị này không nằm trong registry
 * `/admin/system-config` nên admin không sửa được ở đây.
 */
const NotificationLimitsList = memo(function NotificationLimitsList({
  limits,
}: NotificationLimitsListProps) {
  return (
    <div className="flex flex-col gap-1">
      <Text size="small" weight="medium">
        Giới hạn (chỉ đọc)
      </Text>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 md:grid-cols-2">
        {LIMIT_ROWS.map((row) => (
          <div key={row.key} className="flex items-baseline justify-between gap-2">
            <dt>
              <Text size="small" skin="muted">
                {row.label}
              </Text>
            </dt>
            <dd>
              <Text size="small">
                <span className="tabular-nums">{formatNumber(limits[row.key])}</span> {row.unit}
              </Text>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
});

export default NotificationLimitsList;
