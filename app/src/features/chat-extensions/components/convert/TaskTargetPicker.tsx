import { Text, View } from 'react-native';

import { Chip } from '@/shared/ui/chip';
import { ScreenState } from '@/shared/ui/screen-state';

import { useBoardOptions, useWorkspaceOptions } from '../../hooks/useConvertToTask';
import { describeChatExtError } from '../../utils/error-info';

export interface TaskTarget {
  workspaceId?: string;
  boardId?: string;
  /** `undefined` = cột đầu tiên của bảng (BE mặc định). */
  columnId?: string;
}

export interface TaskTargetPickerProps {
  /** Nhóm của phòng chat (kênh) — có thì KHÔNG cho chọn nhóm khác (BE `WORKSPACE_MISMATCH`). */
  fixedWorkspaceId?: string;
  value: TaskTarget;
  onChange: (next: TaskTarget) => void;
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-xs">
      <Text accessibilityRole="header" className="text-label-md font-semibold text-fg-1">
        {label}
      </Text>
      <View className="flex-row flex-wrap gap-xs">{children}</View>
    </View>
  );
}

/**
 * Chọn ĐÍCH của thẻ: nhóm (chỉ khi phòng chat không thuộc một nhóm — hội thoại) → bảng → cột (app.md §3 `ConvertToTaskSheet`). Dùng chip chọn-một thay vì hộp chọn lồng tấm
 * (tránh tấm trong tấm). Chọn bảng nào cũng phải khớp nhóm của tin (kênh: cố định; hội thoại nhóm: BE từ chối `WORKSPACE_MISMATCH` và tấm giải thích); người không có quyền tạo thẻ ở bảng đó
 * bị BE từ chối lúc gửi (`TASK_*`/`PERM_*`).
 */
export function TaskTargetPicker({ fixedWorkspaceId, value, onChange }: TaskTargetPickerProps) {
  const workspaces = useWorkspaceOptions(fixedWorkspaceId === undefined);
  const workspaceId = fixedWorkspaceId ?? value.workspaceId;
  const boards = useBoardOptions(workspaceId);
  const board = boards.data?.find((b) => b.id === value.boardId);
  const failure = workspaces.isError ? workspaces.error : boards.isError ? boards.error : undefined;

  if (failure) {
    return (
      <ScreenState
        action={{ label: 'Thử lại', onPress: () => void (workspaces.isError ? workspaces.refetch() : boards.refetch()) }}
        description={describeChatExtError(failure).message}
        fullscreen={false}
        state="error"
      />
    );
  }

  return (
    <View className="gap-md">
      {fixedWorkspaceId === undefined ? (
        <Group label="Nhóm">
          {(workspaces.data ?? []).map((ws) => (
            <Chip
              key={ws.id}
              label={ws.name}
              role="radio"
              selected={ws.id === value.workspaceId}
              onPress={() => onChange({ workspaceId: ws.id })}
            />
          ))}
          {workspaces.isSuccess && workspaces.data.length === 0 ? (
            <Text className="text-body-md text-fg-2">Bạn chưa ở nhóm nào</Text>
          ) : null}
        </Group>
      ) : null}

      {workspaceId ? (
        <Group label="Bảng">
          {(boards.data ?? []).map((b) => (
            <Chip
              key={b.id}
              label={b.name}
              role="radio"
              selected={b.id === value.boardId}
              onPress={() => onChange({ workspaceId, boardId: b.id })}
            />
          ))}
          {boards.isSuccess && boards.data.length === 0 ? (
            <Text className="text-body-md text-fg-2">Không có bảng nào bạn được tạo công việc</Text>
          ) : null}
        </Group>
      ) : null}

      {board ? (
        <Group label="Cột">
          <Chip label="Cột đầu tiên" role="radio" selected={value.columnId === undefined} onPress={() => onChange({ ...value, columnId: undefined })} />
          {board.columns.map((column) => (
            <Chip
              key={column.id}
              label={column.title}
              role="radio"
              selected={column.id === value.columnId}
              onPress={() => onChange({ ...value, columnId: column.id })}
            />
          ))}
        </Group>
      ) : null}
    </View>
  );
}
