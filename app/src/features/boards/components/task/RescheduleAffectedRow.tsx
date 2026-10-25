import { Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { cn } from '@/shared/utils/style/cn';

import type { RescheduleAffected } from '../../api/critical-path.types';
import { shiftLabel } from '../../utils/reschedule-text';
import { formatDayIn } from '../../utils/zoned-date';

export interface RescheduleAffectedRowProps {
  /** Tên người làm đã tra được từ cache ("Lan, Minh"); rỗng thì không hiện dòng người làm. */
  assignees: string;
  /** Kẻ ngăn dưới hàng — bỏ ở hàng CUỐI (cùng nét `divider` của `ListItem` ở nhóm "Không dời" bên dưới). */
  divider?: boolean;
  item: RescheduleAffected;
  /** Múi giờ của server — ngày cũ/mới hiện theo múi giờ này, không theo máy. */
  timezone: string;
}

/**
 * Một thẻ SẼ BỊ DỜI trong tấm cảnh báo (app.md §3): tiêu đề, người làm, ngày cũ → mới và số ngày dời ("+2 ngày").
 * Chữ nói đủ nghĩa ("Hạn 22/09 chuyển sang 25/09, +3 ngày") — mũi tên và huy hiệu chỉ là hình cho người nhìn.
 */
export function RescheduleAffectedRow({
  assignees,
  divider = false,
  item,
  timezone,
}: RescheduleAffectedRowProps) {
  const oldDue = formatDayIn(item.oldDueDate, timezone, '—');
  const newDue = formatDayIn(item.newDueDate, timezone, '—');
  const shift = shiftLabel(item.shiftDays);

  return (
    <View
      accessibilityLabel={`${item.title}. ${assignees ? `Người làm ${assignees}. ` : ''}Hạn ${oldDue} chuyển sang ${newDue}, ${shift}`}
      accessible
      className={cn('gap-3xs py-xs', divider && 'border-b border-b-divider-1')}
    >
      <Text
        className="text-label-md font-medium text-fg-1"
        maxFontSizeMultiplier={1.3}
        numberOfLines={2}
      >
        {item.title}
      </Text>
      <View className="flex-row flex-wrap items-center gap-xs">
        <Text className="text-caption-lg text-fg-2">{`${oldDue} → ${newDue}`}</Text>
        <Badge label={shift} size="sm" variant="warning" />
      </View>
      {assignees ? (
        <Text className="text-caption-sm text-fg-2">{`Người làm: ${assignees}`}</Text>
      ) : null}
    </View>
  );
}
