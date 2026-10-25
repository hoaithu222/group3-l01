import { Text, View } from 'react-native';

import { checklistPercent, checklistProgressLabel } from '../../utils/checklist';

/**
 * Thanh tiến độ checklist + nhãn "2/4 · 50 %" (app.md §2). `Progress` của bộ chung là thanh CÁC BƯỚC
 * (stepper), không phải thanh phần trăm — chưa có control thanh % nên viết cục bộ ở đây (một feature dùng).
 * Bề rộng phần đã xong là TỶ LỆ (`%`) chứ không phải số dp cố định (`responsive.md` điều 2), và có
 * `accessibilityValue` để trình đọc màn hình nói được "50 phần trăm" — không chỉ nhìn thanh.
 */
export function ChecklistProgress({ done, total }: { done: number; total: number }) {
  if (total <= 0) return null;
  const percent = checklistPercent(done, total);

  return (
    <View
      accessibilityLabel={`Tiến độ việc nhỏ ${checklistProgressLabel(done, total)}`}
      accessibilityRole="progressbar"
      accessibilityValue={{ max: 100, min: 0, now: percent }}
      className="flex-row items-center gap-sm"
    >
      <View className="h-2 flex-1 overflow-hidden rounded-full bg-bg-3">
        <View className="h-2 rounded-full bg-action-base" style={{ width: `${percent}%` }} />
      </View>
      <Text className="text-label-md text-fg-2" maxFontSizeMultiplier={1.3}>
        {checklistProgressLabel(done, total)}
      </Text>
    </View>
  );
}
