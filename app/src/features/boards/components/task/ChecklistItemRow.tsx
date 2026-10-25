import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/utils/style/cn';

import type { ChecklistItemDto } from '../../api/task-detail.types';
import { FALLBACK_TASK_LIMITS } from '../../constants/task-detail.constants';

export interface ChecklistItemRowProps {
  canEdit: boolean;
  item: ChecklistItemDto;
  onMenu: (item: ChecklistItemDto) => void;
  onRename: (item: ChecklistItemDto, text: string) => void;
  onToggle: (item: ChecklistItemDto, done: boolean) => void;
}

/**
 * Một mục checklist (app.md §2 `ChecklistItemRow`): ô tick (vùng chạm ≥ 44), chữ chạm để sửa tại chỗ
 * (xuống dòng khi dài), nút "…" mở menu Lên/Xuống/Xoá. Người chỉ xem: không tick, không sửa, không menu.
 * Đã xong → gạch ngang + nhạt VÀ đọc là "đã hoàn thành" cho trình đọc màn hình (không chỉ dựa vào gạch).
 */
export function ChecklistItemRow({
  canEdit,
  item,
  onMenu,
  onRename,
  onToggle,
}: ChecklistItemRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next !== '' && next !== item.text) onRename(item, next);
  };

  return (
    <View className="min-h-[44px] flex-row items-center gap-xs">
      <Checkbox
        accessibilityLabel={`${item.text}${item.done ? ', đã hoàn thành' : ''}`}
        checked={item.done}
        disabled={!canEdit}
        onChange={(done) => onToggle(item, done)}
      />
      <View className="flex-1">
        {editing ? (
          <Input
            accessibilityLabel="Sửa việc nhỏ"
            autoFocus
            maxLength={FALLBACK_TASK_LIMITS.checklistItemMax}
            placeholder="Nội dung việc nhỏ"
            returnKeyType="done"
            value={draft}
            onBlur={commit}
            onChangeText={setDraft}
            onSubmitEditing={commit}
          />
        ) : (
          <Pressable
            accessibilityHint={canEdit ? 'Chạm để sửa' : undefined}
            accessibilityRole={canEdit ? 'button' : 'text'}
            className={cn('min-h-[44px] justify-center', canEdit && 'active:opacity-70')}
            disabled={!canEdit}
            onPress={() => {
              setDraft(item.text);
              setEditing(true);
            }}
          >
            <Text
              className={
                item.done ? 'text-body-md text-fg-2 line-through' : 'text-body-md text-fg-1'
              }
            >
              {item.text}
            </Text>
          </Pressable>
        )}
      </View>
      {canEdit ? (
        <Button
          accessibilityLabel={`Tuỳ chọn việc nhỏ ${item.text}`}
          iconLeft="more"
          iconOnly
          size="xs"
          variant="tertiary"
          onPress={() => onMenu(item)}
        />
      ) : null}
    </View>
  );
}
