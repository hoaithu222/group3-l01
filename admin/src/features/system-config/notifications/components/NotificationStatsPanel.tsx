import { memo, useCallback, useMemo } from 'react';

import { useQueryParams } from '@/shared/hooks';
import { BoxPanel, Button, Callout, SegmentToggle, Skeleton, Table, Text } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { cn } from '@/shared/utils/style';

import {
  NOTIFICATION_STATS_DEFAULT_RANGE,
  NOTIFICATION_STATS_RANGE_OPTIONS,
  NOTIFICATION_STATS_RANGE_PARAM,
} from '../constants/notifications.constants';
import { useNotificationStats } from '../service/notifications-config.queries';
import type { NotificationStatsRange } from '../types/notification-stats.types';
import { formatFanoutP95, toSuppressedPoints } from '../utils/notification-stats';
import NotificationLimitsList from './NotificationLimitsList';
import NotificationStatsKpis from './NotificationStatsKpis';
import NotificationSuppressedChart from './NotificationSuppressedChart';
import { NOTIFICATION_TYPE_COLUMNS, type NotificationTypeRow } from './notification-type.columns';

/**
 * Số liệu thông báo tin nhắn gộp (admin.md p1-07 §2.1) — CHỈ đọc, từ `GET /admin/notifications/stats`:
 * push đã gửi/thất bại, token hỏng đã dọn, mục Hoạt động tạo mới, p95 thời gian fan-out, push bị chặn theo
 * lý do và theo loại, kèm khối "Giới hạn (chỉ đọc)" (`limits`). Khoảng 24 giờ / 7 ngày. KHÔNG có bảng người dùng hay tra cứu hộp thư/cài đặt của một
 * người: BE chỉ trả chỉ số gộp và panel không dựng thêm trường định danh nào.
 *
 * Cờ `push` tắt hoặc Redis không khả dụng → BE trả toàn số 0; panel hiện 0 an toàn (không lỗi).
 */
const NotificationStatsPanel = memo(function NotificationStatsPanel() {
  const { getParam, updateParams } = useQueryParams();
  const range: NotificationStatsRange =
    getParam(NOTIFICATION_STATS_RANGE_PARAM) === '7d' ? '7d' : NOTIFICATION_STATS_DEFAULT_RANGE;

  const { data, isLoading, isError, isFetching, isPlaceholderData, refetch } =
    useNotificationStats(range);

  const handleRange = useCallback(
    (next: string) =>
      updateParams({ [NOTIFICATION_STATS_RANGE_PARAM]: next === '7d' ? '7d' : null }),
    [updateParams],
  );

  const suppressed = useMemo(() => (data ? toSuppressedPoints(data.suppressed) : []), [data]);
  const typeRows = useMemo<NotificationTypeRow[]>(
    () =>
      Object.entries(data?.byType ?? {})
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
    [data],
  );

  return (
    <BoxPanel
      border="hairline"
      className="h-auto"
      description="Chỉ số gộp — không có người dùng hay nội dung tin nhắn"
      headerRight={
        <div className="flex items-center gap-2">
          <SegmentToggle
            aria-label="Khoảng thời gian số liệu thông báo"
            fitContent
            options={[...NOTIFICATION_STATS_RANGE_OPTIONS]}
            size="sm"
            value={range}
            variant="subtle"
            onValueChange={handleRange}
          />
          <Button
            loading={isFetching && !isLoading}
            size="sm"
            startIcon={<SystemIcon name="arrows-rotate-outline" size={14} />}
            variant="ghost"
            onClick={() => void refetch()}
          >
            Làm mới
          </Button>
        </div>
      }
      title="Số liệu thông báo tin nhắn"
    >
      <div className="flex flex-col gap-2 p-2">
        {isLoading && (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        )}

        {isError && (
          <Callout
            action={
              <Button size="sm" variant="stroke" onClick={() => void refetch()}>
                Thử lại
              </Button>
            }
            intent="error"
            title="Không tải được số liệu thông báo tin nhắn"
          />
        )}

        {data && (
          // Đổi khoảng: giữ số cũ mờ đi tới khi số mới về — không đọc nhầm số 24 giờ là 7 ngày.
          <div className={cn('flex flex-col gap-2', isPlaceholderData && 'opacity-50')}>
            <NotificationStatsKpis stats={data} />

            <Text size="small" skin="muted">
              Thời gian fan-out p95: {formatFanoutP95(data.fanoutP95Ms)}
            </Text>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Text size="small" weight="medium">
                  Push bị chặn theo lý do
                </Text>
                <div className="h-52">
                  <NotificationSuppressedChart points={suppressed} />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Text size="small" weight="medium">
                  Push theo loại
                </Text>
                <Table
                  columns={NOTIFICATION_TYPE_COLUMNS}
                  data={typeRows}
                  emptyMessage="Chưa có push nào trong khoảng này"
                  pagination={false}
                  rowKey={(row) => row.type}
                />
              </div>
            </div>

            {/* BE cũ chưa trả `limits` → ẩn khối thay vì hiện ô trống. */}
            {data.limits && <NotificationLimitsList limits={data.limits} />}
          </div>
        )}
      </div>
    </BoxPanel>
  );
});

export default NotificationStatsPanel;
