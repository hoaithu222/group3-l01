import { Text, View } from 'react-native';

import { Chip } from '@/shared/ui/chip';
import { formatDate } from '@/shared/utils/format/date.utils';

import { GUEST_DAYS_MAX } from '../api';
import { buildDayOptions, expiryAfterDays } from '../utils/guest-days';

export interface GuestDaysSelectorProps {
  disabled?: boolean;
  /** `guestPolicy.maxDays` của nhóm; mặc định trần hệ thống 90. */
  maxDays?: number;
  onChange: (days: number) => void;
  value: number;
}

/**
 * Chọn số ngày khách được vào (app.md p3-04 §2): 7 / 14 / 30 / 60 / 90, kèm NGÀY
 * HẾT HẠN cụ thể bên dưới — hạn luôn hiển thị cả "N ngày" lẫn ngày, người mời
 * không phải tự cộng nhẩm (§7).
 */
export function GuestDaysSelector({ disabled, maxDays = GUEST_DAYS_MAX, onChange, value }: GuestDaysSelectorProps) {
  const expiryText = formatDate(expiryAfterDays(value));

  return (
    <View className="gap-xs">
      <Text className="text-label-md text-fg-1">Thời hạn</Text>
      <View className="flex-row flex-wrap gap-xs">
        {buildDayOptions(maxDays).map((days) => (
          <Chip
            key={days}
            disabled={disabled}
            label={`${days} ngày`}
            role="radio"
            selected={value === days}
            onPress={() => onChange(days)}
          />
        ))}
      </View>
      <Text className="text-caption-sm text-fg-2">Khách mất quyền tự động vào ngày {expiryText}.</Text>
    </View>
  );
}
