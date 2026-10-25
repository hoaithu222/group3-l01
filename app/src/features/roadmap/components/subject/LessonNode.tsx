import { Text, View } from 'react-native';

import type { ThemeColorKey } from '@/shared/theme';
import { Icon, type IconName } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

import type { LessonTimelineState } from '../../types/roadmap-insights.types';

export interface LessonNodeProps {
  number: number;
  state: LessonTimelineState;
}

/**
 * Nút tròn 32 dp trên đường thời gian: nền + viền + ký hiệu theo trạng thái. Buổi chưa có dấu hiệu gì thì hiện SỐ buổi
 * (người học dò "buổi 12" bằng mắt); buổi đã xong/đang học/khoá hiện icon — ⚠️ luôn kèm chữ trạng thái ở thẻ bên cạnh
 * (`LessonRow`), màu không phải dấu hiệu duy nhất.
 */
const NODE: Record<LessonTimelineState, { box: string; icon?: IconName; iconColor?: ThemeColorKey; text?: string }> = {
  done: { box: 'border-border-success bg-surface-success', icon: 'checkmark-circle', iconColor: 'success' },
  'in-progress': { box: 'border-border-warning bg-surface-warning', icon: 'clock', iconColor: 'warning' },
  locked: { box: 'border-border-1 bg-bg-3', icon: 'lock', iconColor: 'fg-2' },
  next: { box: 'border-border-brand bg-action-base', text: 'text-action-fg' },
  skipped: { box: 'border-border-1 bg-surface-neutral', icon: 'arrow-right-2', iconColor: 'fg-2' },
  upcoming: { box: 'border-border-1 bg-bg-1', text: 'text-fg-2' },
};

export function LessonNode({ number, state }: LessonNodeProps) {
  const node = NODE[state];
  return (
    <View className={cn('size-8 items-center justify-center rounded-full border', node.box)}>
      {node.icon ? (
        <Icon color={node.iconColor} name={node.icon} size="sm" />
      ) : (
        <Text className={cn('text-label-sm font-semibold', node.text)} maxFontSizeMultiplier={1.3}>
          {String(number)}
        </Text>
      )}
    </View>
  );
}
