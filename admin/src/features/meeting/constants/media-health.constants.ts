import type { HealthState } from '../types/media-health.types';

/** Nhãn tổng trạng thái hạ tầng media (admin.md p2-07 §2.5) — `Callout` theo `status`. */
export const MEDIA_HEALTH_OVERALL: Record<
  HealthState,
  { intent: 'success' | 'warning' | 'error' | 'neutral'; title: string; description: string }
> = {
  OK: {
    intent: 'success',
    title: 'Hạ tầng media hoạt động bình thường',
    description: 'LiveKit, ghi hình, webhook và hàng đợi đều phản hồi đúng.',
  },
  DEGRADED: {
    intent: 'warning',
    title: 'Hạ tầng media đang suy giảm',
    description: 'Một số thành phần phản hồi chậm hoặc lỗi — xem chi tiết từng khối bên dưới.',
  },
  DOWN: {
    intent: 'error',
    title: 'LiveKit không truy cập được',
    description: 'Cuộc gọi và cuộc họp mới sẽ thất bại cho tới khi máy chủ media hoạt động lại.',
  },
  DISABLED: {
    intent: 'neutral',
    title: 'Gọi & họp đang tắt hoặc chưa cấu hình máy chủ media',
    description: 'Bật cờ tính năng và cấu hình LiveKit ở Cấu hình hệ thống để dùng.',
  },
  UNKNOWN: {
    intent: 'neutral',
    title: 'Chưa xác định được tình trạng hạ tầng media',
    description: 'Chưa có đủ dữ liệu thăm dò.',
  },
};

/** TURN chưa được thăm dò lần nào (`UNKNOWN`) — nói rõ thay vì hiện "lỗi". */
export const TURN_NO_PROBE_TEXT = 'Chưa có dữ liệu thăm dò';
