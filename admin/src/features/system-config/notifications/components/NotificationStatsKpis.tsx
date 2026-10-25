import { memo } from 'react';

import { CompactKpiCard } from '@/shared/ui';

import type { NotificationStats } from '../types/notification-stats.types';

export interface NotificationStatsKpisProps {
  stats: NotificationStats;
}

/**
 * Bốn thẻ số của khối "Số liệu thông báo tin nhắn" (admin.md p1-07 §2.1): push đã gửi, push thất bại,
 * token hỏng đã dọn, mục Hoạt động mới. Chỉ số đếm gộp — `animate={false}` vì số đổi theo khoảng 24 giờ/7 ngày
 * (đếm lên mỗi lần đổi khoảng chỉ gây nhiễu).
 */
const NotificationStatsKpis = memo(function NotificationStatsKpis({
  stats,
}: NotificationStatsKpisProps) {
  return (
    <div className="grid grid-cols-1 items-start gap-2 md:grid-cols-2 xl:grid-cols-4">
      <CompactKpiCard
        animate={false}
        color="green"
        icon="paper-plane-top-bold"
        label="Push đã gửi"
        value={stats.pushSent}
      />
      <CompactKpiCard
        animate={false}
        color={stats.pushFailed > 0 ? 'red' : 'gray'}
        icon="triangle-exclamation-bold"
        label="Push thất bại"
        value={stats.pushFailed}
      />
      <CompactKpiCard
        animate={false}
        color="gray"
        icon="trash-bold"
        label="Token hỏng đã dọn"
        value={stats.invalidTokensRemoved}
      />
      <CompactKpiCard
        animate={false}
        color="blue"
        icon="bell-bold"
        label="Mục Hoạt động mới"
        value={stats.inboxCreated}
      />
    </div>
  );
});

export default NotificationStatsKpis;
