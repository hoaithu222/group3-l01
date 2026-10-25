import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';

import type { TaskCardDto } from '../../api/boards.types';
import { COLUMN_KIND_ART } from '../../constants/kanban.constants';
import { ColumnHeader } from './ColumnHeader';
import { DraggableCard } from './drag/DraggableCard';
import { useDrag } from './drag/drag-context';
import type { ColumnBox } from './drag/drop-target';
import type { KanbanColumnProps } from './kanban.types';
import { QuickAddTask } from './QuickAddTask';
import { TaskCardMini } from './TaskCardMini';

const isTemp = (task: TaskCardDto): boolean => task.id.startsWith('tmp_');

/**
 * Một cột Kanban: đầu cột · danh sách thẻ (FlashList) · ô thêm nhanh ghim ở đáy.
 *
 * Ô thêm nhanh nằm NGOÀI FlashList (không phải footer của list) — cột 100–200 thẻ
 * mà nó nằm cuối list thì phải cuộn hết mới thấy.
 *
 * `containerRef` bọc ĐÚNG vùng list (không gồm đầu cột/ô thêm) để `measure()`
 * trả về toạ độ cửa sổ của vùng mà `drop-target.ts` đổi ngón tay → nội dung list.
 */
export function KanbanColumn({
  canCreate,
  canMove,
  column,
  hasMore,
  height,
  labels,
  showCreate = true,
  tasks,
  width,
  onA11yAction,
  onCreate,
  onLoadMore,
  onOpenMenu,
  onOpenTask,
}: KanbanColumnProps) {
  const drag = useDrag();
  const registerColumn = drag?.registerColumn;
  const listRef = useRef<FlashListRef<TaskCardDto>>(null);
  const containerRef = useRef<View>(null);
  const tasksRef = useRef(tasks);

  useEffect(() => {
    tasksRef.current = tasks;
  });

  useEffect(
    () =>
      registerColumn?.(column.id, {
        measure: () =>
          new Promise<ColumnBox | null>((resolve) => {
            const list = listRef.current;
            if (!containerRef.current || !list) return resolve(null);
            containerRef.current.measureInWindow((left, top, boxWidth, boxHeight) => {
              const base = list.getFirstItemOffset();
              const cards = tasksRef.current.flatMap((task, index) => {
                const layout = list.getLayout(index);
                return layout ? [{ height: layout.height, id: task.id, top: layout.y + base }] : [];
              });
              resolve({
                cards,
                columnId: column.id,
                height: boxHeight,
                left,
                scrollY: list.getAbsoluteLastScrollOffset(),
                top,
                width: boxWidth,
              });
            });
          }),
        scrollBy: (dy) => {
          const list = listRef.current;
          if (!list) return;
          list.scrollToOffset({ animated: false, offset: Math.max(0, list.getAbsoluteLastScrollOffset() + dy) });
        },
      }),
    [column.id, registerColumn],
  );

  const liftedId = drag?.session?.task.id ?? null;
  const extraData = useMemo(() => ({ canMove, labels, liftedId }), [canMove, labels, liftedId]);

  return (
    <View className="rounded-sm bg-bg-2 p-xs" style={{ height, width }}>
      <ColumnHeader column={column} count={tasks.length} />

      <View ref={containerRef} className="flex-1" collapsable={false}>
        <FlashList
          ref={listRef}
          data={tasks}
          extraData={extraData}
          keyExtractor={(task) => task.id}
          ListEmptyComponent={
            // Cột trống: hình minh hoạ gọn theo LOẠI cột (cùng icon/tông với đầu cột) thay cho một dòng chữ trơn.
            // Người chỉ xem không kéo thả được — "Kéo thẻ vào đây" sẽ nói dối.
            <EmptyState
              description={canMove ? 'Kéo thẻ vào đây' : 'Chưa có thẻ'}
              icon={COLUMN_KIND_ART[column.kind].icon}
              size="compact"
              tone={COLUMN_KIND_ART[column.kind].tone}
            />
          }
          ListFooterComponent={
            hasMore ? (
              <Button
                label="Tải thêm thẻ"
                size="sm"
                variant="tertiary"
                onPress={() => onLoadMore(column.id)}
              />
            ) : null
          }
          renderItem={({ item }) => (
            <View className="pb-xs">
              <DraggableCard columnId={column.id} disabled={!canMove || isTemp(item)} task={item}>
                <TaskCardMini
                  columnTitle={column.title}
                  disabled={isTemp(item)}
                  labels={labels}
                  lifted={liftedId === item.id}
                  menuDisabled={!canMove}
                  task={item}
                  onA11yAction={onA11yAction}
                  onOpen={onOpenTask}
                  onOpenMenu={onOpenMenu}
                />
              </DraggableCard>
            </View>
          )}
          scrollEnabled={!drag?.session}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        />
      </View>

      {showCreate ? (
        <View className="pt-xs">
          <QuickAddTask column={column} disabled={!canCreate} onSubmit={onCreate} />
        </View>
      ) : null}
    </View>
  );
}
