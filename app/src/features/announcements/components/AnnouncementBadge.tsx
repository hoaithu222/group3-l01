import { View } from 'react-native';

import type { ThemeColorKey } from '@/shared/theme';
import { Badge, type BadgeVariant } from '@/shared/ui/badge';
import { Icon, type IconName } from '@/shared/ui/icon';

import { ANNOUNCEMENT_STATUS_LABEL, type AnnouncementStatus } from '../utils/announcement-status';

interface StatusTone {
  icon: IconName;
  iconColor: ThemeColorKey;
  variant: BadgeVariant;
}

/** Mỗi trạng thái có CHỮ + BIỂU TƯỢNG riêng — màu chỉ phụ trợ (người mù màu vẫn phân biệt được). */
const TONE: Record<AnnouncementStatus, StatusTone> = {
  confirmed: { icon: 'checkmark-circle', iconColor: 'success', variant: 'success' },
  // `fg-2` (≥ 3:1) chứ không `fg-3` (2.96:1): biểu tượng là một nửa tín hiệu "đã hết hạn", không được mờ tới mức không thấy.
  expired: { icon: 'clock', iconColor: 'fg-2', variant: 'neutral' },
  pending: { icon: 'alert-information', iconColor: 'warning', variant: 'warning' },
};

export interface AnnouncementBadgeProps {
  status: AnnouncementStatus;
}

/**
 * Huy hiệu trạng thái của yêu cầu xác nhận: "Cần xác nhận" · "Đã xác nhận" · "Đã hết hạn". `Badge` chung chỉ có nhãn (không
 * có khe biểu tượng) nên biểu tượng đứng cạnh; nó trang trí (ẩn khỏi trình đọc màn hình) — chữ của `Badge` đã đọc trạng thái.
 */
export function AnnouncementBadge({ status }: AnnouncementBadgeProps) {
  const tone = TONE[status];
  return (
    <View className="flex-row items-center gap-3xs">
      <Icon color={tone.iconColor} name={tone.icon} size="sm" />
      <Badge label={ANNOUNCEMENT_STATUS_LABEL[status]} size="sm" variant={tone.variant} />
    </View>
  );
}
