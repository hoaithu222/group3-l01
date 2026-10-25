import { View } from 'react-native';

import { useIsScreenFocused } from '@/shared/hooks/useIsScreenFocused';
import { PulseDot } from '@/shared/ui';
import { Badge, type BadgeVariant } from '@/shared/ui/badge';

import type { MeetingStatus } from '../../api/meetings.types';
import { STATUS_LABEL } from '../../constants/meetings.constants';

const VARIANT: Record<MeetingStatus, BadgeVariant> = {
  CANCELLED: 'error',
  ENDED: 'neutral',
  LIVE: 'success',
  SCHEDULED: 'info',
};

export interface MeetingStatusBadgeProps {
  /**
   * Chấm nhịp cạnh nhãn khi `status === 'LIVE'` — bật ở thẻ agenda (`MeetingCard`), trạng thái khác thì bỏ qua.
   * ⚠️ Chấm KHÔNG có nhãn trợ năng: chữ "Đang diễn ra" của badge liền kề đã nói trạng thái, nhịp/màu chỉ là phụ.
   */
  pulse?: boolean;
  status: MeetingStatus;
}

/** Nhãn trạng thái cuộc họp — LUÔN có chữ ("Sắp tới", "Đang diễn ra", "Đã kết thúc", "Đã huỷ"), màu chỉ là phụ (trợ năng). */
export function MeetingStatusBadge({ pulse = false, status }: MeetingStatusBadgeProps) {
  const badge = (
    <Badge appearance="soft" label={STATUS_LABEL[status]} size="sm" variant={VARIANT[status]} />
  );
  if (!pulse || status !== 'LIVE') return badge;

  return (
    <View className="flex-row items-center gap-3xs">
      <LivePulse />
      {badge}
    </View>
  );
}

/**
 * ✅ Tách riêng để CHỈ thẻ đang diễn ra mới đăng ký `useIsScreenFocused` (điều hướng + AppState) — agenda dài mà mỗi thẻ đều
 * nghe thì trả giá cho cả những thẻ không có chấm. Nhịp dừng khi sang tab khác/app xuống nền, tự tắt khi "Giảm chuyển động".
 */
function LivePulse() {
  const focused = useIsScreenFocused();
  // ⚠️ `success` chứ không phải đỏ mặc định của `PulseDot`: CÙNG bảng màu trạng thái (vạch + badge "Đang diễn ra" đều xanh lá).
  return <PulseDot active={focused} size={6} tone="success" />;
}
