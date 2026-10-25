import { View } from 'react-native';

import { Badge, type BadgeVariant } from '@/shared/ui/badge';
import { Icon } from '@/shared/ui/icon';
import {
  formatGuestExpiryDate,
  formatGuestRemaining,
  getGuestRemaining,
} from '@/shared/utils/format/guest-expiry.utils';
import { cn } from '@/shared/utils/style/cn';

export interface GuestBadgeProps {
  className?: string;
  /** Hạn của khách. Vắng mặt (BE không gửi) thì chỉ hiện "Khách". */
  expiresAt?: string | null;
}

/**
 * "Khách · còn 12 ngày" (app.md p3-04 §2) — CHỮ + ICON, không chỉ màu.
 *
 * Còn < 48 giờ → tông cảnh báo + icon cảnh báo (nhấn bằng cả chữ "còn N giờ" lẫn
 * hình, app.md §7); đã qua hạn → tông lỗi. Nhãn đọc cho trình đọc màn hình nói cả
 * NGÀY cụ thể ("hết hạn 12/10/2026"): người nghe không có "màu" để đoán độ gấp.
 */
export function GuestBadge({ className, expiresAt }: GuestBadgeProps) {
  const remaining = getGuestRemaining(expiresAt);
  const text = remaining ? `Khách · ${formatGuestRemaining(remaining)}` : 'Khách';

  const variant: BadgeVariant = !remaining
    ? 'neutral'
    : remaining.expired
      ? 'error'
      : remaining.urgent
        ? 'warning'
        : 'info';
  const spoken = remaining ? `${text}, ${formatGuestExpiryDate(expiresAt)}` : text;

  return (
    <View
      accessibilityLabel={spoken}
      accessibilityRole="text"
      accessible
      className={cn('flex-row items-center gap-2xs', className)}
    >
      <Icon
        color={variant === 'neutral' || variant === 'info' ? 'fg-2' : variant}
        name={remaining?.urgent ? 'alert-warning' : 'clock'}
        size="sm"
      />
      <Badge label={text} variant={variant} />
    </View>
  );
}
