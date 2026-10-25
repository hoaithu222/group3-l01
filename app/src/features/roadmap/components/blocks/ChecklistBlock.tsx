import { Text, View } from 'react-native';

import { Checkbox } from '@/shared/ui/checkbox';

import type { Block } from '../../api/roadmap.types';
import { spansToText } from '../../utils/block-anchors';
import { Spans } from './Spans';

export interface ChecklistBlockProps {
  block: Extract<Block, { type: 'checklist' }>;
}

/**
 * "- [ ]" còn lại trong THÂN bài (be.md §5.1) — vd bài tập cần tự làm khi đọc. Khối này KHÔNG mang trạng thái tick
 * (kiểu chỉ có `id`/`spans`, không có `checked`) nên chỉ HIỂN THỊ, không tương tác — khác hẳn checklist tự kiểm
 * tra cuối buổi ở `SelfCheckTab` (đọc từ `lesson.checklist`, có tick lưu server qua `useLessonProgress`).
 */
export function ChecklistBlock({ block }: ChecklistBlockProps) {
  return (
    <View className="gap-2xs">
      {block.items.map((item) => (
        <Checkbox
          key={item.id}
          accessibilityLabel={spansToText(item.spans)}
          checked={false}
          disabled
          label={
            <Text className="text-body-md text-fg-1">
              <Spans spans={item.spans} />
            </Text>
          }
        />
      ))}
    </View>
  );
}
