import { Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';

import { GrowBar } from './GrowBar';

interface HostAnswerProgressProps {
  answered: number;
  total: number;
}

/**
 * Chủ phòng: bao nhiêu người đã trả lời câu đang mở (`quiz:progress`, tới host ≤ 2 lần/giây). Thanh trượt tới mức mới; con số
 * là `polite` để trình đọc màn hình đọc khi đổi (không `assertive` — nó đổi liên tục lúc đông người).
 */
export function HostAnswerProgress({ answered, total }: HostAnswerProgressProps) {
  const percent = total > 0 ? (answered / total) * 100 : 0;

  return (
    <View className="gap-xs rounded-md bg-surface-warning p-sm">
      <View className="flex-row items-center gap-xs">
        <Icon color="warning" name="user" size="sm" variant="twotone" />
        <Text accessibilityLiveRegion="polite" className="text-label-lg text-fg-1">
          {`Đã trả lời ${String(answered)}/${String(total)}`}
        </Text>
      </View>
      <GrowBar fillClassName="bg-action-warning" percent={percent} />
    </View>
  );
}
