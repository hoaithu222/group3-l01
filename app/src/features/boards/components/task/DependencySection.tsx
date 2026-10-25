import { useState } from 'react';
import { Text, View } from 'react-native';

import { ActionMenuSheet } from '@/shared/ui/action-menu';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/modal';
import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';

import type { DependencyTaskDto } from '../../api/critical-path.types';
import { useDependencySection } from '../../hooks/useDependencySection';
import type { DependencyDirection } from '../../queries/dependencies.queries';
import { DependencyPickerSheet } from './DependencyPickerSheet';
import { DependencyRow } from './DependencyRow';

export interface DependencySectionProps {
  boardId: string;
  /** Quyền sửa của thẻ (đã gộp online/lưu trữ/xoá) — tắt thì ẩn nút thêm và gỡ, danh sách vẫn đọc được. */
  canEdit: boolean;
  taskId: string;
  onOpenTask: (taskId: string) => void;
}

interface GroupProps {
  canEdit: boolean;
  direction: DependencyDirection;
  tasks: readonly DependencyTaskDto[];
  title: string;
  onOpen: (taskId: string) => void;
  onRemove: (direction: DependencyDirection, task: DependencyTaskDto) => void;
}

/** Một nhóm ("Bị chặn bởi" / "Đang chặn"); nhóm rỗng KHÔNG vẽ — trạng thái rỗng chung do khối cha nói. */
function Group({ canEdit, direction, tasks, title, onOpen, onRemove }: GroupProps) {
  if (tasks.length === 0) return null;
  return (
    <View accessibilityLabel={`${title}: ${tasks.length} thẻ`} className="gap-3xs">
      <Text accessibilityRole="header" className="text-label-md text-fg-2">
        {title}
      </Text>
      {tasks.map((task) => (
        <DependencyRow
          key={task.id}
          canEdit={canEdit}
          task={task}
          onOpen={onOpen}
          onRemove={(item) => onRemove(direction, item)}
        />
      ))}
    </View>
  );
}

/**
 * Khối "Phụ thuộc" của chi tiết thẻ (app.md §2 `DependencySection`): "Bị chặn bởi" (thẻ phải xong TRƯỚC) và "Đang chặn"
 * (thẻ đang chờ thẻ này), mỗi dòng có cột + hạn; thêm ở cả hai hướng, gỡ có xác nhận.
 * Offline/lưu trữ/không quyền: ẩn nút thêm và gỡ (`canEdit`), danh sách đọc từ cache vẫn hiện.
 */
export function DependencySection({ boardId, canEdit, taskId, onOpenTask }: DependencySectionProps) {
  const section = useDependencySection(boardId, taskId);
  const [choosing, setChoosing] = useState(false);
  const { data, isError, isLoading } = section.dependencies;
  const empty = !isLoading && (data?.predecessors.length ?? 0) + (data?.successors.length ?? 0) === 0;

  return (
    // Cùng khuôn tiêu đề `Section tone="default"` + icon với các khối khác của chi tiết thẻ (xem `ChecklistSection`).
    <Section icon="link" title="Phụ thuộc" tone="default">
      {isLoading ? (
        <View className="gap-xs">
          <Skeleton className="h-10 rounded-xs" />
          <Skeleton className="h-10 rounded-xs" />
        </View>
      ) : isError && !data ? (
        <View className="items-start gap-xs">
          <Text className="text-body-md text-fg-2">Không tải được phụ thuộc. Kiểm tra kết nối rồi thử lại.</Text>
          <Button label="Thử lại" size="sm" variant="secondary" onPress={() => void section.dependencies.refetch()} />
        </View>
      ) : (
        <>
          <Group
            canEdit={canEdit}
            direction="predecessor"
            tasks={data?.predecessors ?? []}
            title="Bị chặn bởi"
            onOpen={onOpenTask}
            onRemove={section.askRemove}
          />
          <Group
            canEdit={canEdit}
            direction="successor"
            tasks={data?.successors ?? []}
            title="Đang chặn"
            onOpen={onOpenTask}
            onRemove={section.askRemove}
          />
          {empty ? <Text className="text-body-md text-fg-2">Chưa có phụ thuộc</Text> : null}
        </>
      )}

      {/* MỘT nút "Thêm phụ thuộc" rồi chọn hướng trong tấm — hai nút "Thêm thẻ chặn" / "Thêm thẻ bị chặn" cạnh nhau khó phân biệt
          (chỉ khác hai chữ "bị") và cùng độ nổi. Tấm giải thích hệ quả của từng hướng bằng câu đầy đủ. */}
      {canEdit ? (
        <Button
          iconLeft="add"
          label="Thêm phụ thuộc"
          size="sm"
          variant="secondary"
          onPress={() => setChoosing(true)}
        />
      ) : null}
      <ActionMenuSheet
        items={[
          {
            description: 'Thẻ này chờ cho tới khi thẻ kia xong.',
            icon: 'arrow-left-small',
            key: 'predecessor',
            label: 'Thẻ phải xong trước',
            onPress: () => section.openPicker('predecessor'),
          },
          {
            description: 'Thẻ kia chờ cho tới khi thẻ này xong.',
            icon: 'arrow-right-small',
            key: 'successor',
            label: 'Thẻ đang chờ thẻ này',
            onPress: () => section.openPicker('successor'),
          },
        ]}
        title="Thêm phụ thuộc"
        visible={choosing}
        onClose={() => setChoosing(false)}
      />

      <DependencyPickerSheet
        boardId={boardId}
        direction={section.picker}
        error={section.pickerError}
        excludeIds={section.linkedIds}
        saving={section.adding}
        onClose={section.closePicker}
        onPick={section.pick}
      />
      <Dialog
        description={
          section.removing
            ? `Thẻ "${section.removing.other.title}" sẽ không còn ${
                section.removing.direction === 'predecessor' ? 'chặn' : 'bị chặn bởi'
              } thẻ này.`
            : ''
        }
        primaryAction={{ label: 'Gỡ', loading: section.removePending, onPress: section.confirmRemove }}
        secondaryAction={{ disabled: section.removePending, label: 'Huỷ', onPress: section.cancelRemove }}
        title="Gỡ phụ thuộc?"
        variant="warning"
        visible={section.removing !== null}
        onClose={section.cancelRemove}
      />
    </Section>
  );
}
