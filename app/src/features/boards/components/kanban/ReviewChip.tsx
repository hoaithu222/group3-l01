import { Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

import type { TaskCardDto } from '../../api/boards.types';
import { reviewChipA11yLabel, reviewChipSpec, type ReviewChipSpec } from '../../utils/review-chip';

/** Nền/viền theo tông — `surface-*` là màu ĐẶC (đổi đúng theo sáng/tối) nên đi với chữ `fg-1`; icon mang màu ngữ nghĩa. */
const TONE: Record<ReviewChipSpec['tone'], { box: string; icon: 'error' | 'fg-2' | 'success' | 'warning' }> = {
  error: { box: 'border-border-error-subtle bg-surface-error', icon: 'error' },
  neutral: { box: 'border-border-1 bg-surface-neutral', icon: 'fg-2' },
  success: { box: 'border-border-success-subtle bg-surface-success', icon: 'success' },
  warning: { box: 'border-border-warning-subtle bg-surface-warning', icon: 'warning' },
};

export interface ReviewChipProps {
  task: Pick<TaskCardDto, 'review' | 'reviewState'>;
}

/**
 * Chip chấm chéo trên thẻ Kanban (p4-05 app.md §2 `ReviewChip`, "điền chỗ p3-02"): "Chờ duyệt 1/2" · "Cần sửa" · "Đã duyệt". CHỮ + icon,
 * không chỉ màu (§7) — trạng thái đọc được bằng trình đọc màn hình ("Chờ duyệt: đã có 1 trên 2 lượt duyệt"). Không bấm được: cả thẻ đã là
 * nút mở chi tiết, nơi có danh sách người chấm. Thẻ chưa vào chấm chéo (`NONE`) → không vẽ gì.
 */
export function ReviewChip({ task }: ReviewChipProps) {
  const spec = reviewChipSpec(task.reviewState, task.review);
  if (!spec) return null;
  const tone = TONE[spec.tone];

  return (
    <View
      accessibilityLabel={reviewChipA11yLabel(task.reviewState, task.review) ?? spec.label}
      accessible
      className="flex-row"
    >
      <View className={cn('flex-row items-center gap-3xs rounded-full border-hairline px-xs py-3xs', tone.box)}>
        <Icon color={tone.icon} name={spec.icon} size={14} />
        <Text className="text-label-sm text-fg-1" maxFontSizeMultiplier={1.3} numberOfLines={1}>
          {spec.label}
        </Text>
      </View>
    </View>
  );
}
