import { memo } from 'react';

import { CompactKpiCard } from '@/shared/ui';

import { useCompanyStatusCount } from '../service/recruiter.queries';
import type { RecruiterStats } from '../types/recruiter.types';
import { ratePercent, totalOffers } from '../utils/stats.utils';

/** Giá trị KPI khi chưa có số liệu (đang tải / lỗi) — KHÔNG được thay bằng 0: 0 là một con số thật. */
const NO_DATA = '—';

export interface RecruiterStatsKpisProps {
  stats: RecruiterStats | undefined;
  loading: boolean;
}

const percent = (value: number | null): string | number => (value === null ? NO_DATA : `${value}%`);

/**
 * Dải KPI của tab "Thống kê" (admin.md p6-08 §2.2): doanh nghiệp đã duyệt · chờ duyệt (đếm hiện tại, không theo khoảng) · ứng viên đang Open to work ·
 * lời mời đã gửi · tỉ lệ đã xem · tỉ lệ quan tâm (theo khoảng ngày đã chọn, theo tháng GỬI). Chưa có số → "—", không bao giờ "0".
 */
const RecruiterStatsKpis = memo(function RecruiterStatsKpis({
  stats,
  loading,
}: RecruiterStatsKpisProps) {
  const approved = useCompanyStatusCount('APPROVED');
  const pending = useCompanyStatusCount('PENDING');
  const totals = stats ? totalOffers(stats.byMonth) : null;

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      <CompactKpiCard
        animate={!approved.isPending}
        color="green"
        icon="building-bold"
        label="Doanh nghiệp đã duyệt"
        value={approved.data ?? NO_DATA}
      />
      <CompactKpiCard
        animate={!pending.isPending}
        color="yellow"
        icon="clock-bold"
        label="Chờ duyệt"
        value={pending.data ?? NO_DATA}
      />
      <CompactKpiCard
        animate={!loading}
        color="blue"
        icon="user-bold"
        label="Ứng viên Open to work"
        value={stats ? stats.openToWorkCount : NO_DATA}
      />
      <CompactKpiCard
        animate={!loading}
        color="blue"
        icon="paper-plane-top-bold"
        label="Lời mời đã gửi"
        value={totals ? totals.sent : NO_DATA}
      />
      <CompactKpiCard
        animate={!loading}
        color="gray"
        icon="eye-bold"
        label="Tỉ lệ đã xem"
        value={totals ? percent(ratePercent(totals.read, totals.sent)) : NO_DATA}
      />
      <CompactKpiCard
        animate={!loading}
        color="green"
        icon="circle-check-bold"
        label="Tỉ lệ quan tâm"
        value={totals ? percent(ratePercent(totals.interested, totals.sent)) : NO_DATA}
      />
    </div>
  );
});

export default RecruiterStatsKpis;
