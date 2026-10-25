import { View } from 'react-native';

import { Badge, BadgeAnchor } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';

export interface CalendarHeaderActionsProps {
  /** Bộ lọc đang KHÁC mặc định (nhóm/trạng thái/phạm vi) ⇒ chấm báo trên nút lọc — danh sách trống/thiếu là do lọc, không phải mất dữ liệu. */
  filtered?: boolean;
  /** Ngoại tuyến ⇒ ẩn nút tạo (tạo họp cần mạng — `Idempotency-Key` + server tính lịch). */
  offline: boolean;
  onCreate: () => void;
  onFilter: () => void;
}

/** Hai nút trên AppBar của màn Lịch: lọc và tạo cuộc họp. Nút chỉ có icon ⇒ bắt buộc `accessibilityLabel`. */
export function CalendarHeaderActions({
  filtered = false,
  offline,
  onCreate,
  onFilter,
}: CalendarHeaderActionsProps) {
  return (
    <View className="flex-row items-center gap-2xs">
      <BadgeAnchor
        badge={filtered ? <Badge accessibilityLabel="Đang áp dụng bộ lọc" dot variant="brand" /> : undefined}
      >
        <Button
          accessibilityLabel={filtered ? 'Lọc lịch họp, đang áp dụng bộ lọc' : 'Lọc lịch họp'}
          iconLeft="filter"
          iconOnly
          size="sm"
          variant="tertiary"
          onPress={onFilter}
        />
      </BadgeAnchor>
      {offline ? null : (
        <Button
          accessibilityLabel="Tạo cuộc họp"
          iconLeft="add"
          iconOnly
          size="sm"
          variant="tertiary"
          onPress={onCreate}
        />
      )}
    </View>
  );
}
