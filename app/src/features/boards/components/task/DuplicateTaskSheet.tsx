import { useState } from 'react';
import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { BottomSheet, SheetActions } from '@/shared/ui/bottom-sheet';
import { Chip } from '@/shared/ui/chip';
import { Input } from '@/shared/ui/input';
import { Toggle } from '@/shared/ui/toggle';
import { hapticSelection, hapticTap } from '@/shared/utils/haptics';

import type { BoardColumn, TaskCardDto } from '../../api/boards.types';
import { FALLBACK_TASK_LIMITS } from '../../constants/task-detail.constants';
import { useAttemptKey } from '../../hooks/useAttemptKey';
import { useDuplicateTask } from '../../queries/task-extras.queries';
import { copyTaskTitle } from '../../utils/copy-name';
import { duplicateTaskErrorMessage } from '../../utils/task-extras-errors';

export interface DuplicateTaskSheetProps {
  boardId: string;
  columns: readonly BoardColumn[];
  task: Pick<TaskCardDto, 'id' | 'title'>;
  onClose: () => void;
}

/**
 * Nhân bản thẻ (p3-03 P1, `POST /tasks/:id/duplicate`, quyền `workspace.task.create`): tiêu đề điền sẵn "<tiêu đề> (bản sao)", cột đích
 * (mặc định "Tự động" = BE quyết: cùng cột với thẻ gốc nếu là Cần làm/Đang làm, còn Chờ duyệt/Hoàn thành thì vào cột Cần làm đầu), giữ người
 * làm (mặc định TẮT) và giữ việc nhỏ (mặc định BẬT, bỏ dấu tích). Nhãn, mô tả, ngày, điểm luôn được chép; tệp, bình luận, phụ thuộc, kết quả
 * chấm thì KHÔNG — nói rõ trong tấm.
 *
 * Dùng chung cho menu thẻ ở Kanban và menu "…" ở chi tiết thẻ. ⚠️ Chỉ DỰNG khi có thẻ đích (nơi gọi `task ? <DuplicateTaskSheet /> : null`, cùng
 * cách `MoveTaskSheet`) nên mỗi lần mở là một lượt mới: state điền sẵn từ `task` bằng khởi tạo lười, khoá idempotent mới, không có câu lỗi cũ.
 * Lỗi hiện NGAY trong tấm (`TASK_010` bảng đủ thẻ, `TASK_001`, `TASK_002`, `VAL_001`, 403/404) và giữ nguyên lựa chọn; thẻ mới vào cache bảng do
 * `useDuplicateTask` lo — tấm chỉ đóng khi xong.
 */
export function DuplicateTaskSheet({ boardId, columns, task, onClose }: DuplicateTaskSheetProps) {
  const duplicate = useDuplicateTask(boardId);
  const attempt = useAttemptKey('task-duplicate');
  const [title, setTitle] = useState(() => copyTaskTitle(task.title));
  const [columnId, setColumnId] = useState<string | null>(null);
  const [keepAssignees, setKeepAssignees] = useState(false);
  const [keepChecklist, setKeepChecklist] = useState(true);

  // Đang gửi thì không cho đóng (chạm nền/vuốt xuống/Huỷ): đóng giữa chừng thì thẻ vẫn được tạo mà người dùng không thấy phản hồi.
  const dismiss = () => {
    if (!duplicate.isPending) onClose();
  };

  const trimmed = title.trim();
  const titleOk = trimmed.length > 0 && trimmed.length <= FALLBACK_TASK_LIMITS.titleMax;

  const submit = () => {
    if (!titleOk || duplicate.isPending) return;
    hapticTap();
    duplicate.mutate(
      {
        idempotencyKey: attempt.key,
        payload: { columnId: columnId ?? undefined, keepAssignees, keepChecklist, title: trimmed },
        taskId: task.id,
      },
      { onError: (error) => attempt.settle(error), onSuccess: onClose },
    );
  };

  return (
    <BottomSheet
      alert={duplicate.error ? <Alert description={duplicateTaskErrorMessage(duplicate.error)} tone="error" /> : undefined}
      footer={
        <SheetActions
          primary={{ disabled: !titleOk, label: 'Nhân bản', loading: duplicate.isPending, onPress: submit }}
          secondary={{ disabled: duplicate.isPending, label: 'Huỷ', onPress: dismiss }}
        />
      }
      scrollable
      title="Nhân bản thẻ"
      visible
      onClose={dismiss}
    >
      <View className="gap-md pb-md">
        <Input
          label="Tiêu đề thẻ mới"
          maxLength={FALLBACK_TASK_LIMITS.titleMax}
          message={titleOk ? undefined : 'Nhập tiêu đề'}
          messageTone="error"
          value={title}
          onChangeText={setTitle}
        />
        <View className="gap-xs">
          <Text className="text-label-md font-semibold text-fg-1">Cột đích</Text>
          <View className="flex-row flex-wrap gap-xs">
            <Chip
              label="Tự động"
              role="radio"
              selected={columnId === null}
              onPress={() => {
                hapticSelection();
                setColumnId(null);
              }}
            />
            {columns.map((column) => (
              <Chip
                key={column.id}
                label={column.title}
                role="radio"
                selected={columnId === column.id}
                onPress={() => {
                  hapticSelection();
                  setColumnId(column.id);
                }}
              />
            ))}
          </View>
        </View>
        <Toggle
          description="Giao bản sao cho những người đang làm thẻ gốc (chỉ người còn trong nhóm)."
          label="Giữ người làm"
          value={keepAssignees}
          onChange={setKeepAssignees}
        />
        <Toggle
          description="Sao chép danh sách việc nhỏ, bỏ dấu tích hoàn thành."
          label="Giữ việc nhỏ"
          value={keepChecklist}
          onChange={setKeepChecklist}
        />
        <Text className="text-caption-lg text-fg-2">
          Nhãn, mô tả, ngày và điểm luôn được sao chép. Tệp đính kèm, bình luận, phụ thuộc và kết quả chấm không được sao chép.
        </Text>
      </View>
    </BottomSheet>
  );
}
