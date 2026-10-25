import { memo } from 'react';

import { BoxPanel, CompactKpiCard, Text } from '@/shared/ui';

import type { MediaStatus } from '../types/media-status.types';

export interface MediaUsageKpiProps {
  status: MediaStatus;
}

/**
 * Phòng đang mở + egress (ghi hình) — CHỈ số đếm. Số cập nhật mỗi 30 giây nên tắt hiệu ứng
 * đếm lên (`animate={false}`). `rooms`/`egress` là `null` khi không với tới máy chủ hoặc máy
 * chủ chạy không kèm egress → hiện "Không khả dụng", không tự bịa số 0.
 *
 * BE chưa phân loại phòng theo tiền tố (gọi/họp/thử nghiệm) nên chỉ có tổng số phòng/người.
 */
const MediaUsageKpi = memo(function MediaUsageKpi({ status }: MediaUsageKpiProps) {
  const { rooms, egress } = status;

  return (
    <BoxPanel
      border="hairline"
      className="h-auto"
      description="Chỉ số lượng — không nêu người hay tên phòng"
      title="Phòng và ghi hình"
    >
      <div className="grid grid-cols-1 items-start gap-2 p-2 sm:grid-cols-2 xl:grid-cols-4">
        {rooms ? (
          <>
            <CompactKpiCard
              animate={false}
              color="blue"
              icon="users-group-bold"
              label="Phòng đang mở"
              value={rooms.active}
            />
            <CompactKpiCard
              animate={false}
              color="green"
              icon="user-bold"
              label="Người đang tham gia"
              value={rooms.participants}
            />
          </>
        ) : (
          <Text className="sm:col-span-2" size="small" skin="muted">
            Không đọc được số phòng (máy chủ media không phản hồi).
          </Text>
        )}
        {egress ? (
          <>
            <CompactKpiCard
              animate={false}
              color="blue"
              icon="circle-play-bold"
              label="Egress đang ghi"
              value={egress.active}
            />
            <CompactKpiCard
              animate={false}
              color={egress.failed24h > 0 ? 'red' : 'gray'}
              icon="triangle-exclamation-bold"
              label="Egress lỗi (24 giờ)"
              value={egress.failed24h}
            />
          </>
        ) : (
          <Text className="sm:col-span-2" size="small" skin="muted">
            Egress không khả dụng (máy chủ chạy không kèm egress hoặc không đọc được).
          </Text>
        )}
      </div>
    </BoxPanel>
  );
});

export default MediaUsageKpi;
