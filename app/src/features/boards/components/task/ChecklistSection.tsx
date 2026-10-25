import { useState } from 'react';
import { Text, View } from 'react-native';

import { ActionMenuSheet } from '@/shared/ui/action-menu';
import { Button, LinkButton } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Section } from '@/shared/ui/section';
import { hapticSelection, hapticSuccess } from '@/shared/utils/haptics';

import type { ChecklistItemDto } from '../../api/task-detail.types';
import { FALLBACK_TASK_LIMITS } from '../../constants/task-detail.constants';
import { useConvertChecklistItem } from '../../queries/task-checklist-convert.queries';
import { useChecklistActions } from '../../queries/task-checklist.queries';
import { planChecklistMove, sortChecklist } from '../../utils/checklist';
import { ChecklistItemRow } from './ChecklistItemRow';
import { ChecklistProgress } from './ChecklistProgress';

export interface ChecklistSectionProps {
  boardId: string;
  /** Có "Chuyển thành thẻ" ở menu từng mục (p3-03 P1): cần sửa thẻ cha VÀ tạo thẻ trên bảng — nơi gọi ghép, thiếu thì coi là không. */
  canConvert?: boolean;
  canEdit: boolean;
  checklist: readonly ChecklistItemDto[];
  done: number;
  taskId: string;
  total: number;
}

/**
 * Việc nhỏ của thẻ (app.md §2 `ChecklistSection`): thanh tiến độ "2/4 · 50 %", danh sách mục, ô thêm mục,
 * ẩn/hiện mục đã xong, menu Lên/Xuống/Xoá. Tick đổi % NGAY (optimistic, `useChecklistActions`) và không
 * cần version — hai người tick hai mục khác nhau không xung đột (PM2-21). Ô thêm mục giữ bàn phím mở
 * sau mỗi lần thêm để nhập liền nhiều mục.
 *
 * Menu mục có thêm "Chuyển thành thẻ" (`canConvert`): việc nhỏ bị gỡ khỏi danh sách và thành thẻ mới ở cột Cần làm đầu tiên của bảng
 * (`useConvertChecklistItem` — gỡ ngay, lỗi thì trả lại).
 */
export function ChecklistSection({
  boardId,
  canConvert = false,
  canEdit,
  checklist,
  done,
  taskId,
  total,
}: ChecklistSectionProps) {
  const actions = useChecklistActions(boardId, taskId);
  const convert = useConvertChecklistItem(boardId, taskId);
  const [newText, setNewText] = useState('');
  const [hideDone, setHideDone] = useState(false);
  const [menuItem, setMenuItem] = useState<ChecklistItemDto | null>(null);

  const sorted = sortChecklist(checklist);
  const visible = hideDone ? sorted.filter((item) => !item.done) : sorted;
  const full = total >= FALLBACK_TASK_LIMITS.checklistMax;

  const add = () => {
    const text = newText.trim();
    if (text === '' || full || actions.add.isPending) return;
    setNewText('');
    actions.add.mutate({ text }, { onError: () => setNewText(text) });
  };

  const move = (direction: 'down' | 'up') => {
    const plan = menuItem ? planChecklistMove(sorted, menuItem.id, direction) : null;
    if (menuItem && plan) actions.move.mutate({ itemId: menuItem.id, ...plan });
    setMenuItem(null);
  };

  const first = menuItem ? sorted[0]?.id === menuItem.id : false;
  const last = menuItem ? sorted.at(-1)?.id === menuItem.id : false;

  return (
    // `Section tone="default"` (label-lg · fg-1 · khe 8 — đúng kiểu chữ cũ) + icon: cùng MỘT khuôn tiêu đề với các khối
    // khác của chi tiết thẻ (Mô tả · Phụ thuộc · Đính kèm · Trao đổi) thay vì mỗi khối tự dựng một hàng `header`.
    <Section
      action={
        done > 0 ? (
          <LinkButton
            label={hideDone ? 'Hiện mục đã xong' : 'Ẩn mục đã xong'}
            onPress={() => setHideDone((v) => !v)}
          />
        ) : undefined
      }
      icon="checkmark-square"
      title="Việc nhỏ"
      tone="default"
    >
      <ChecklistProgress done={done} total={total} />

      {visible.map((item) => (
        <ChecklistItemRow
          key={item.id}
          canEdit={canEdit}
          item={item}
          onMenu={setMenuItem}
          onRename={(target, text) => actions.rename.mutate({ itemId: target.id, text })}
          onToggle={(target, value) => {
            // Tick mục CUỐI cùng ⇒ "xong hết việc nhỏ" = nhịp `success`; mọi lần tick/bỏ tick khác là đổi lựa chọn.
            if (value && total > 0 && done + 1 >= total) hapticSuccess();
            else hapticSelection();
            actions.toggle.mutate({ done: value, itemId: target.id });
          }}
        />
      ))}
      {hideDone && visible.length === 0 && total > 0 ? (
        <Text className="text-body-md text-fg-2">Mọi việc nhỏ đã xong.</Text>
      ) : null}

      {canEdit ? (
        <View className="flex-row items-start gap-xs">
          <View className="flex-1">
            <Input
              accessibilityLabel="Nội dung việc nhỏ mới"
              blurOnSubmit={false}
              disabled={full}
              maxLength={FALLBACK_TASK_LIMITS.checklistItemMax}
              message={
                full ? `Đã đạt tối đa ${FALLBACK_TASK_LIMITS.checklistMax} việc nhỏ` : undefined
              }
              placeholder="Thêm việc nhỏ"
              returnKeyType="done"
              value={newText}
              onChangeText={setNewText}
              onSubmitEditing={add}
            />
          </View>
          <Button
            accessibilityLabel="Thêm việc nhỏ"
            disabled={newText.trim() === '' || full}
            iconLeft="add"
            iconOnly
            loading={actions.add.isPending}
            variant="secondary"
            onPress={add}
          />
        </View>
      ) : total === 0 ? (
        <Text className="text-body-md text-fg-2">Chưa có việc nhỏ nào.</Text>
      ) : null}

      <ActionMenuSheet
        items={[
          { disabled: first, icon: 'arrow-up-small', key: 'up', label: 'Lên', onPress: () => move('up') },
          { disabled: last, icon: 'arrow-down-small', key: 'down', label: 'Xuống', onPress: () => move('down') },
          {
            description: 'Gỡ khỏi danh sách này và tạo thẻ mới trong bảng.',
            disabled: convert.isPending,
            hidden: !canConvert,
            icon: 'add-square',
            key: 'convert',
            label: 'Chuyển thành thẻ',
            onPress: () => {
              if (menuItem) convert.mutate({ itemId: menuItem.id });
              setMenuItem(null);
            },
          },
          {
            icon: 'delete',
            key: 'delete',
            label: 'Xoá việc nhỏ',
            onPress: () => {
              if (menuItem) actions.remove.mutate({ itemId: menuItem.id });
              setMenuItem(null);
            },
            tone: 'danger',
          },
        ]}
        title={menuItem?.text}
        visible={menuItem !== null}
        onClose={() => setMenuItem(null)}
      />
    </Section>
  );
}
