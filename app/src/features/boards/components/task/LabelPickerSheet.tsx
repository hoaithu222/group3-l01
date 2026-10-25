import { useState } from 'react';
import { View } from 'react-native';

import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { cn } from '@/shared/utils/style/cn';

import type { BoardLabel } from '../../api/boards.types';
import { FALLBACK_TASK_LIMITS } from '../../constants/task-detail.constants';
import { useCreateLabel } from '../../queries/labels.queries';
import { LabelSheet } from '../LabelSheet';
import { labelDotClass } from '../kanban/TaskLabels';
import { MultiPickSheet, type PickOption } from './MultiPickSheet';

export interface LabelPickerSheetProps {
  boardId: string;
  /** Tạo nhãn cần quyền sửa bảng (`BOARD_EDIT`, OWNER/ADMIN) — MEMBER chỉ chọn nhãn có sẵn. */
  canCreate: boolean;
  error: string | null;
  labels: readonly BoardLabel[];
  saving: boolean;
  selectedIds: readonly string[];
  visible: boolean;
  onClose: () => void;
  onConfirm: (ids: string[]) => void;
}

/**
 * Chọn nhãn của thẻ (app.md §2 `LabelPickerSheet`): nhãn của BẢNG (chấm màu token + tên — màu không phải
 * dấu hiệu duy nhất), tối đa 10 nhãn/thẻ, và "Tạo nhãn mới" dùng lại `LabelSheet` của p3-02 ngay tại chỗ.
 * Nhãn vừa tạo được ghi vào `BoardDetail.labels` (`useCreateLabel`) nên hiện trong danh sách liền.
 * `LabelSheet` mở CHỒNG lên tấm này (không đóng tấm chọn) để không mất các nhãn đang tick dở.
 */
export function LabelPickerSheet({
  boardId,
  canCreate,
  error,
  labels,
  saving,
  selectedIds,
  visible,
  onClose,
  onConfirm,
}: LabelPickerSheetProps) {
  const [creating, setCreating] = useState(false);
  const createLabel = useCreateLabel(boardId);

  const options: PickOption[] = labels.map((label) => ({
    id: label.id,
    label: label.name,
    // Chấm 12dp đặt giữa ô 32dp — bằng ô icon của hàng "Tạo nhãn mới" nên tên nhãn và tên hành động thẳng một cột.
    leading: (
      <View className="size-3xl items-center justify-center">
        <View className={cn('h-3 w-3 rounded-full', labelDotClass(label.color))} />
      </View>
    ),
  }));

  return (
    <>
      <MultiPickSheet
        emptyMessage="Bảng chưa có nhãn nào."
        error={error}
        extra={
          canCreate ? (
            // Hàng hành động cuối danh sách (cùng dáng `ListItem` với các nhãn), không phải nút viền ôm chữ lơ lửng dưới list.
            <ListItem
              emphasis="title"
              label="Tạo nhãn mới"
              leading={<IconTile name="add" size="sm" tone="brand" />}
              onPress={() => setCreating(true)}
            />
          ) : undefined
        }
        max={FALLBACK_TASK_LIMITS.labelsPerTaskMax}
        options={options}
        saving={saving}
        searchPlaceholder={labels.length > 8 ? 'Tìm nhãn' : undefined}
        selectedIds={selectedIds}
        title="Nhãn"
        visible={visible}
        onClose={onClose}
        onConfirm={onConfirm}
      />
      <LabelSheet
        editing={creating ? null : undefined}
        error={createLabel.error}
        pending={createLabel.isPending}
        onClose={() => setCreating(false)}
        onSubmit={(values) => createLabel.mutate(values, { onSuccess: () => setCreating(false) })}
      />
    </>
  );
}
