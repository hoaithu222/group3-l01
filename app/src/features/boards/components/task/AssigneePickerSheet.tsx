import { useMemo, useState } from 'react';

import { Avatar } from '@/shared/ui/avatar';

import type { TaskAssignee } from '../../api/boards.types';
import { FALLBACK_TASK_LIMITS } from '../../constants/task-detail.constants';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useMentionables } from '../../queries/task-comments.queries';
import { MultiPickSheet, type PickOption } from './MultiPickSheet';

export interface AssigneePickerSheetProps {
  boardId: string;
  current: readonly TaskAssignee[];
  error: string | null;
  saving: boolean;
  visible: boolean;
  onClose: () => void;
  onConfirm: (assignees: TaskAssignee[]) => void;
}

/**
 * Chọn người làm (app.md §2 `AssigneePickerSheet`): tìm thành viên qua `GET /boards/:id/mentionables`
 * (MEMBER+ ACTIVE, ≤ 20 kết quả, debounce), chọn nhiều ≤ 10. Người ĐANG được giao luôn nằm trong danh
 * sách kể cả khi không khớp từ khoá — không thì tick bỏ họ là "biến mất" khỏi danh sách rồi gửi thiếu.
 */
export function AssigneePickerSheet({
  boardId,
  current,
  error,
  saving,
  visible,
  onClose,
  onConfirm,
}: AssigneePickerSheetProps) {
  const [text, setText] = useState('');
  const query = useDebouncedValue(text.trim(), 250);
  const found = useMentionables(boardId, query, visible);

  const people = useMemo(() => {
    const byId = new Map<string, TaskAssignee>();
    current.forEach((person) => byId.set(person.id, person));
    (found.data ?? []).forEach((person) => byId.set(person.id, person));
    return [...byId.values()];
  }, [current, found.data]);

  const options: PickOption[] = people.map((person) => ({
    id: person.id,
    label: person.name,
    // `sm` (32dp) — cùng cỡ ô đầu hàng của mọi danh sách chọn người trong tấm (chuyển tiếp tin, giao quyền chủ trì).
    leading: (
      <Avatar
        name={person.name}
        size="sm"
        source={person.avatarUrl ? { uri: person.avatarUrl } : undefined}
      />
    ),
  }));

  return (
    <MultiPickSheet
      emptyMessage="Không có thành viên phù hợp."
      error={error}
      loading={found.isFetching}
      max={FALLBACK_TASK_LIMITS.assigneesMax}
      options={options}
      saving={saving}
      searchPlaceholder="Tìm thành viên"
      selectedIds={current.map((person) => person.id)}
      title="Người làm"
      visible={visible}
      onClose={onClose}
      onConfirm={(ids) => onConfirm(people.filter((person) => ids.includes(person.id)))}
      onSearch={setText}
    />
  );
}
