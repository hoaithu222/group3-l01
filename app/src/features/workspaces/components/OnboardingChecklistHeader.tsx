import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { ProgressRing } from '@/shared/ui/progress-ring';

export interface OnboardingChecklistHeaderProps {
  doneCount: number;
  expanded: boolean;
  onToggle: () => void;
  total: number;
}

/**
 * Đầu thẻ checklist nhóm mới: vòng tiến độ "2/3" (`ProgressRing` — TĨNH, chỉ quay khi `indeterminate`, nên không tốn quỹ vòng
 * lặp của màn) + tiêu đề + câu "Còn N việc…" + nút thu gọn/mở rộng danh sách bước.
 *
 * ✅ Tiến độ nói bằng CHỮ ở ba chỗ, không chỉ bằng cung màu: số "2/3" giữa vòng, câu phụ, và `accessibilityValue` của vòng
 * (trình đọc màn hình đọc phần trăm). ⚠️ Chữ giữa vòng chặn trần cỡ chữ 1.3: vòng 44dp có đường kính CỨNG (lòng 36dp) —
 * phóng 2× là "2/3" tràn qua nét vòng (cùng lý do trần của `Badge`/`AvatarGroup`).
 *
 * Nút thu gọn là nút chỉ-icon `xs` (32dp + `hitSlop` của `Button` = 44dp), nhãn nói đúng việc sắp làm.
 */
export function OnboardingChecklistHeader({
  doneCount,
  expanded,
  onToggle,
  total,
}: OnboardingChecklistHeaderProps) {
  const remaining = Math.max(total - doneCount, 0);

  return (
    <View className="flex-row items-center gap-sm">
      <ProgressRing
        label={`Tiến độ bắt đầu nhóm mới: đã xong ${String(doneCount)} trên ${String(total)} việc`}
        progress={total > 0 ? doneCount / total : 0}
        size={44}
        strokeWidth={4}
      >
        <Text className="text-label-sm font-semibold text-fg-1" maxFontSizeMultiplier={1.3}>
          {`${String(doneCount)}/${String(total)}`}
        </Text>
      </ProgressRing>
      <View className="flex-1 gap-3xs">
        <Text accessibilityRole="header" className="text-body-lg font-semibold text-fg-1">
          Bắt đầu với nhóm mới
        </Text>
        <Text className="text-caption-lg text-fg-2">
          {remaining > 0 ? `Còn ${String(remaining)} việc để nhóm sẵn sàng` : 'Đã xong mọi việc'}
        </Text>
      </View>
      <Button
        accessibilityLabel={expanded ? 'Thu gọn danh sách việc' : 'Mở danh sách việc'}
        iconLeft={expanded ? 'arrow-up-small' : 'arrow-down-small'}
        iconOnly
        size="xs"
        variant="neutral-tertiary"
        onPress={onToggle}
      />
    </View>
  );
}
