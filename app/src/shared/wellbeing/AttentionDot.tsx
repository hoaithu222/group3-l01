import { Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { cn } from '@/shared/utils/style/cn';

export interface AttentionDotProps {
  className?: string;
}

/**
 * Chấm cam "Cần chú ý" (p7-03 P1, app.md §3 "Màn thành viên nhóm") — CHỈ hiển thị khi nơi gọi (feature `members`) đã tự xác định:
 * người xem là OWNER/ADMIN của nhóm VÀ thành viên đó đã tự chia sẻ mức rủi ro (`WellbeingShare`, be.md) với mức hiện tại MEDIUM/HIGH
 * (`GET /workspaces/:id/wellbeing/indicators`). Component THUẦN hiển thị — không gọi API, không biết mức cụ thể (LOW/MEDIUM/HIGH), chữ
 * + màu chứ không chỉ màu (README §7 "vai trò/trạng thái hiển thị bằng chữ").
 *
 * Đặt ở `shared/` (không phải `features/wellbeing`) vì `members` không import chéo feature khác — cùng cách `shared/mentor`
 * (`MemberMentorTag`): nơi gọi tự quyết định CÓ hiện hay không, component này chỉ vẽ tín hiệu.
 */
export function AttentionDot({ className }: AttentionDotProps) {
  return (
    <View
      accessibilityLabel="Cần chú ý — sức khoẻ học tập"
      accessibilityRole="text"
      accessible
      className={cn('flex-row items-center gap-2xs', className)}
    >
      <Badge dot variant="warning" />
      <Text className="text-caption-sm text-warning" numberOfLines={1}>
        Cần chú ý
      </Text>
    </View>
  );
}
