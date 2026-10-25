import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { formatDate } from '@/shared/utils/format/date.utils';

import type { DependencyTaskDto } from '../../api/critical-path.types';
import { COLUMN_KIND_BADGE } from '../../constants/critical-path.constants';
import { COLUMN_KIND_LABEL } from '../../constants/kanban.constants';

export interface DependencyRowProps {
  /** Ẩn nút gỡ khi chỉ-đọc (offline/lưu trữ/không quyền). */
  canEdit: boolean;
  task: DependencyTaskDto;
  onOpen: (taskId: string) => void;
  onRemove: (task: DependencyTaskDto) => void;
}

/**
 * Một thẻ ở đầu kia của phụ thuộc (app.md §2 `DependencyRow`): tiêu đề, chip cột, hạn, nút gỡ (có xác nhận ở nơi
 * gọi). Nút gỡ là ANH EM của vùng mở thẻ chứ không lồng trong nó — cùng bẫy `TaskCardMini`: `Pressable` gộp cả cây con
 * thành MỘT ô trợ năng, nút lồng bên trong sẽ không tới được TalkBack.
 */
export function DependencyRow({ canEdit, task, onOpen, onRemove }: DependencyRowProps) {
  const due = task.dueDate ? formatDate(task.dueDate) : null;
  const column = COLUMN_KIND_LABEL[task.columnKind];

  return (
    <View className="flex-row items-center gap-xs">
      <Pressable
        accessibilityHint="Mở thẻ này"
        accessibilityLabel={`${task.title}. Cột ${column}${due ? `. Hạn ${due}` : ''}`}
        accessibilityRole="button"
        className="min-h-[44px] flex-1 justify-center gap-3xs py-2xs active:opacity-70"
        onPress={() => onOpen(task.id)}
      >
        <Text
          className="text-label-md font-medium text-fg-1"
          maxFontSizeMultiplier={1.3}
          numberOfLines={2}
        >
          {task.title}
        </Text>
        <View className="flex-row flex-wrap items-center gap-xs">
          <Badge label={column} size="sm" variant={COLUMN_KIND_BADGE[task.columnKind]} />
          {due ? <Text className="text-caption-sm text-fg-2">{`Hạn ${due}`}</Text> : null}
        </View>
      </Pressable>
      {canEdit ? (
        <Button
          accessibilityLabel={`Gỡ phụ thuộc với thẻ ${task.title}`}
          iconLeft="cancel"
          iconOnly
          size="xs"
          variant="tertiary"
          onPress={() => onRemove(task)}
        />
      ) : null}
    </View>
  );
}
