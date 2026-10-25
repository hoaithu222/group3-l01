import { Text, View } from 'react-native';

import { cn } from '@/shared/utils/style/cn';

import type { BoardLabel } from '../../api/boards.types';
import { LABEL_COLOR_CLASS, LABEL_COLOR_FALLBACK_CLASS } from '../../constants/kanban.constants';

/** Số nhãn hiện trên thẻ; còn lại gộp "+N" để thẻ không cao vọt. */
const MAX_VISIBLE_LABELS = 3;

export function labelDotClass(color: string): string {
  return LABEL_COLOR_CLASS[color] ?? LABEL_COLOR_FALLBACK_CLASS;
}

/**
 * Nhãn của thẻ: CHẤM màu + TÊN — màu không phải dấu hiệu duy nhất
 * (`app.md` §7). Nhãn đã bị xoá khỏi bảng (id không còn trong `labels`) bị bỏ.
 */
export function TaskLabels({
  labelIds,
  labels,
}: {
  labelIds: readonly string[];
  labels: ReadonlyMap<string, BoardLabel>;
}) {
  const resolved = labelIds.flatMap((id) => {
    const label = labels.get(id);
    return label ? [label] : [];
  });
  if (resolved.length === 0) return null;

  const visible = resolved.slice(0, MAX_VISIBLE_LABELS);
  const overflow = resolved.length - visible.length;

  return (
    <View className="flex-row flex-wrap gap-xs">
      {visible.map((label) => (
        <View
          key={label.id}
          accessibilityLabel={`Nhãn ${label.name}`}
          className="flex-row items-center gap-2xs rounded-full bg-bg-2 px-xs py-3xs"
        >
          <View className={cn('h-2 w-2 rounded-full', labelDotClass(label.color))} />
          <Text className="text-caption-sm text-fg-2" maxFontSizeMultiplier={1.3} numberOfLines={1}>
            {label.name}
          </Text>
        </View>
      ))}
      {overflow > 0 ? (
        <Text className="self-center text-caption-sm text-fg-2">{`+${overflow}`}</Text>
      ) : null}
    </View>
  );
}
