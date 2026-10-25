import { memo } from 'react';
import { Link } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import type { AdminOverviewMedia } from '@/core/api/admin';
import { CompactKpiCard } from '@/shared/ui';
import { formatFileSize } from '@/shared/utils/format';

export interface OverviewMediaKpisProps {
  media: AdminOverviewMedia;
  /** `true` = tắt hiệu ứng đếm số (giá trị hiện NGAY). */
  loading: boolean;
  /** Đích liên kết "Xem" của thẻ "Cuộc họp đang diễn ra" (cha dựng từ registry — file này không import registry). */
  liveMeetingsHref: string;
}

/**
 * Nhóm KPI gọi & họp của trang tổng quan (admin.md p2-07 §2.6, OPC-11): cuộc họp đang diễn ra (kèm liên kết "Xem" sang danh sách đã lọc LIVE khi có
 * `meeting:view`), cuộc gọi hôm nay, phút gọi 7 ngày, dung lượng ghi hình, egress lỗi 24 giờ (đỏ khi > 0). Chỉ SỐ ĐẾM tổng hợp. Cha chỉ render khi
 * `overview.media` có mặt (BE bỏ trường này khi cờ tắt).
 *
 * Bố cục CỘT DỌC (thân panel bên phải biểu đồ, `DashboardHero`): mỗi thẻ `flex-1` nên 5 thẻ chia đều chiều cao
 * cột — mép dưới thẻ cuối thẳng hàng mép dưới biểu đồ ở mọi cỡ màn, không để một khoảng trống lửng dưới đáy cột.
 */
const OverviewMediaKpis = memo(function OverviewMediaKpis({
  media,
  loading,
  liveMeetingsHref,
}: OverviewMediaKpisProps) {
  const canViewMeeting = useAuthStore((s) => s.hasPermission('meeting', 'view'));

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <CompactKpiCard
        animate={!loading}
        className="min-h-0 flex-1"
        color="green"
        icon="users-bold"
        label="Cuộc họp đang diễn ra"
        size="md"
        trailing={
          canViewMeeting ? (
            <Link className="text-caption-12 text-link hover:underline" to={liveMeetingsHref}>
              Xem
            </Link>
          ) : undefined
        }
        value={media.liveMeetings}
      />
      <CompactKpiCard
        animate={!loading}
        className="min-h-0 flex-1"
        color="blue"
        icon="phone-bold"
        label="Cuộc gọi hôm nay"
        size="md"
        value={media.callsToday}
      />
      <CompactKpiCard
        animate={!loading}
        className="min-h-0 flex-1"
        color="yellow"
        icon="clock-bold"
        label="Phút gọi (7 ngày)"
        size="md"
        value={media.callMinutes7d}
      />
      <CompactKpiCard
        animate={!loading}
        className="min-h-0 flex-1"
        color="gray"
        icon="boxes-stacked-bold"
        label="Dung lượng ghi hình"
        size="md"
        value={formatFileSize(media.recordingStorageBytes)}
      />
      <CompactKpiCard
        animate={!loading}
        className="min-h-0 flex-1"
        color={media.egressFailed24h > 0 ? 'red' : 'gray'}
        icon="triangle-exclamation-bold"
        label="Egress lỗi (24 giờ)"
        size="md"
        value={media.egressFailed24h}
      />
    </div>
  );
});

export default OverviewMediaKpis;
