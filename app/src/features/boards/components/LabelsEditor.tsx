import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/modal';
import { Section } from '@/shared/ui/section';
import { cn } from '@/shared/utils/style/cn';

import type { BoardDetail, BoardLabel } from '../api/boards.types';
import { useCreateLabel, useDeleteLabel, useUpdateLabel } from '../queries/labels.queries';
import { LabelSheet } from './LabelSheet';
import { labelDotClass } from './kanban/TaskLabels';

/**
 * Nhãn của bảng (`app.md` §2 `LabelsEditor`): danh sách + thêm/sửa/xoá. Tối đa
 * `labelsMax` nhãn — đủ thì khoá nút thêm (BE cũng chặn bằng `TASK_011`).
 * Xoá nhãn đang gắn trên thẻ là được: BE gỡ nhãn khỏi các thẻ đó (be.md §4),
 * nên câu xác nhận nói rõ điều này.
 */
export function LabelsEditor({ board, labelsMax }: { board: BoardDetail; labelsMax: number }) {
  const [editing, setEditing] = useState<BoardLabel | null | undefined>(undefined);
  const [removing, setRemoving] = useState<BoardLabel | null>(null);
  const create = useCreateLabel(board.id);
  const update = useUpdateLabel(board.id);
  const remove = useDeleteLabel(board.id);

  const mutation = editing ? update : create;

  const submit = (values: { color: string; name: string }) => {
    const options = { onSuccess: () => setEditing(undefined) };
    if (editing) update.mutate({ labelId: editing.id, payload: values }, options);
    else create.mutate(values, options);
  };

  return (
    <Section icon="discount" title={`Nhãn (${board.labels.length}/${labelsMax})`}>
      <View className="gap-xs">
        {board.labels.length === 0 ? (
          <Text className="text-body-md text-fg-2">Chưa có nhãn nào.</Text>
        ) : (
          board.labels.map((label) => (
            <View key={label.id} className="flex-row items-center gap-xs">
              <View className={cn('h-3 w-3 rounded-full', labelDotClass(label.color))} />
              <Text className="flex-1 text-body-lg text-fg-1" numberOfLines={1}>
                {label.name}
              </Text>
              <Button
                accessibilityLabel={`Sửa nhãn ${label.name}`}
                iconLeft="edit"
                iconOnly
                size="sm"
                variant="tertiary"
                onPress={() => setEditing(label)}
              />
              <Button
                accessibilityLabel={`Xoá nhãn ${label.name}`}
                iconLeft="delete"
                iconOnly
                size="sm"
                variant="danger-secondary"
                onPress={() => setRemoving(label)}
              />
            </View>
          ))
        )}
        <Button
          disabled={board.labels.length >= labelsMax}
          iconLeft="add"
          label="Thêm nhãn"
          variant="secondary"
          onPress={() => setEditing(null)}
        />
      </View>

      <LabelSheet
        editing={editing}
        error={mutation.error}
        pending={mutation.isPending}
        onClose={() => setEditing(undefined)}
        onSubmit={submit}
      />

      <Dialog
        description="Nhãn sẽ bị gỡ khỏi mọi thẻ đang dùng nó. Thao tác này không hoàn tác được."
        primaryAction={{
          label: 'Xoá nhãn',
          loading: remove.isPending,
          onPress: () => {
            if (removing) remove.mutate(removing.id, { onSettled: () => setRemoving(null) });
          },
        }}
        secondaryAction={{ label: 'Huỷ', onPress: () => setRemoving(null) }}
        title={removing ? `Xoá nhãn "${removing.name}"?` : 'Xoá nhãn?'}
        variant="warning"
        visible={removing !== null}
        onClose={() => setRemoving(null)}
      />
    </Section>
  );
}
