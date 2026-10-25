import { memo } from 'react';

import type { InsightsRange } from '@/core/api/admin';
import { useConnectionStatus } from '@/core/socket';
import { Badge, Button, SegmentToggle, Text, Toolbar } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { formatDate, formatNumber } from '@/shared/utils/format';

import { INSIGHTS_RANGE_OPTIONS } from '../constants/insights.constants';

export interface DashboardToolbarProps {
  range: InsightsRange;
  onRangeChange: (next: string) => void;
  /** `AdminInsights.generatedAt` (ISO) — thời điểm BE tính. Vắng ⇒ không hiện "Cập nhật lúc". */
  generatedAt?: string;
  /** `overview.realtime.onlineUsers`. Vắng (chưa tải) ⇒ chấm chỉ báo trạng thái, không kèm số — không bịa 0. */
  onlineUsers?: number;
  /** Có truy vấn nào đang chạy (tải lần đầu / đổi khoảng / poll nền / bấm Làm mới) ⇒ nút xoay. */
  refreshing: boolean;
  onRefresh: () => void;
}

/**
 * Hàng điều khiển của trang Tổng quan, ghim trên vùng cuộn: chọn khoảng thời gian · chấm "trực tuyến" · "Cập nhật lúc" · Làm mới.
 *
 * Chấm trực tuyến gộp HAI nguồn: số người trực tuyến (`ops:stats`, cập nhật 30 s/lần) và trạng thái socket của CHÍNH tab này (`useConnectionStatus`).
 * Socket đứt thì số trên thẻ có thể đã cũ — chấm chuyển vàng "Đang kết nối lại" để người đọc biết đừng tin số đó là hiện tại.
 *
 * "Cập nhật lúc" lấy từ `generatedAt` của BE (có thể cũ hơn lúc gọi tới ~60 s vì BE cache), KHÔNG phải giờ máy — đó mới là độ mới thật của số liệu.
 */
const DashboardToolbar = memo(function DashboardToolbar({
  range,
  onRangeChange,
  generatedAt,
  onlineUsers,
  refreshing,
  onRefresh,
}: DashboardToolbarProps) {
  const connected = useConnectionStatus() === 'connected';
  const onlineLabel = !connected
    ? 'Đang kết nối lại'
    : onlineUsers !== undefined
      ? `${formatNumber(onlineUsers)} trực tuyến`
      : 'Realtime';

  return (
    <Toolbar
      left={
        <SegmentToggle
          aria-label="Khoảng thời gian của số liệu"
          options={INSIGHTS_RANGE_OPTIONS}
          size="sm"
          value={range}
          variant="subtle"
          onValueChange={onRangeChange}
        />
      }
      right={
        <>
          <Badge
            color={connected ? 'success' : 'warning'}
            dot
            size="md"
            title={
              connected
                ? 'Số người trực tuyến cập nhật theo thời gian thực'
                : 'Mất kết nối realtime — số người trực tuyến có thể đã cũ'
            }
            variant="tinted"
          >
            {onlineLabel}
          </Badge>
          {generatedAt && (
            <span className="max-sm:hidden" title="Thời điểm máy chủ tính số liệu (có thể cũ hơn khoảng 1 phút)">
              <Text className="whitespace-nowrap tabular-nums" size="tiny" skin="muted">
                Cập nhật lúc {formatDate(generatedAt, 'HH:mm')}
              </Text>
            </span>
          )}
          <Button
            loading={refreshing}
            size="sm"
            startIcon={<SystemIcon name="arrows-rotate-outline" size={14} />}
            variant="stroke"
            onClick={onRefresh}
          >
            Làm mới
          </Button>
        </>
      }
    />
  );
});

export default DashboardToolbar;
