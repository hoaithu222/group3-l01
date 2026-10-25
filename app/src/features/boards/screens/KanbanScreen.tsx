import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { toErrorMessage } from '@/core/api/client.helpers';
import { Alert } from '@/shared/ui/alert';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Skeleton } from '@/shared/ui/skeleton';

import { BoardFilterBar } from '../components/BoardFilterBar';
import { DragOverlay } from '../components/kanban/drag/DragOverlay';
import { DragProvider } from '../components/kanban/drag/DragProvider';
import { KanbanHeaderActions } from '../components/kanban/KanbanHeaderActions';
import { KanbanPager } from '../components/kanban/KanbanPager';
import { KanbanTaskModals } from '../components/kanban/KanbanTaskModals';
import { RescheduleBanner } from '../components/kanban/RescheduleBanner';
import { useKanbanBoard } from '../hooks/useKanbanBoard';

/**
 * Màn Kanban (`app.md` §3 dòng Kanban): AppBar (tên bảng, "Dòng thời gian" khi cờ `project` bật, lối vào của feature khác qua khe
 * `@/shared/board-extensions` — vd "Báo cáo đóng góp" p4-06, cài đặt) · thanh lọc ·
 * banner lô dời lịch nền (p4-04) ·
 * cột (pager điện thoại / nhiều cột tablet) · `MoveTaskSheet` là menu thẻ và là
 * đường thay thế kéo thả.
 *
 * Mất quyền / bảng bị xoá: `BoardScopeProvider` (layout `[boardId]`) đã lo điều
 * hướng ra hub nhóm; ở đây chỉ vẽ trạng thái tải/lỗi.
 */
export function KanbanScreen() {
  const { boardId, wsId } = useLocalSearchParams<{ boardId: string; wsId: string }>();
  const kanban = useKanbanBoard(wsId, boardId);
  const { board, columns, filterState, labels, permissions, tasks } = kanban;
  /**
   * ⛔ `KeyboardAvoidingView` (react-native-keyboard-controller) KHÔNG được nhận `style` (cùng lý do
   * `SheetSurface` — thẻ này là `Reanimated.View` dựng `style={[styleCủaBạn, animatedStyle]}`, Reanimated ghi
   * đè `style` bằng ĐÚNG object worklet trả về nên `flex: 1` bị rơi, thẻ sập về chiều cao 0 — không lỗi nào báo,
   * cả cột lẫn thẻ trong bảng biến mất im lặng dù `GET /boards/:id/tasks` vẫn 200 kèm dữ liệu thật.
   *
   * Đo vùng dành cho bảng ở TẦNG NGOÀI (`View` thường, không đụng `KeyboardAvoidingView`), rồi gán chiều cao đó
   * làm kích thước NỘI DUNG (con duy nhất, không phải `style` của `KeyboardAvoidingView`) — thẻ tự cao vừa nội
   * dung, không cần `flex` của chính nó mới có chiều cao.
   */
  const [kanbanAreaHeight, setKanbanAreaHeight] = useState(0);

  const header = (
    <AppBar
      actions={
        <KanbanHeaderActions
          boardId={boardId}
          boardName={board.data?.name}
          canDuplicate={kanban.canDuplicateBoard}
          canOpenSettings={permissions.canEdit}
          canOpenTimeline={kanban.timelineEnabled}
          wsId={wsId}
          onOpenSettings={kanban.openSettings}
          onOpenTimeline={kanban.openTimeline}
        />
      }
      title={board.data?.name ?? 'Bảng công việc'}
      onBack={router.back}
    />
  );

  if (board.isError || (tasks.isError && !tasks.data)) {
    const failure = board.error ?? tasks.error;
    return (
      <Screen header={header} scrollable={false}>
        <EmptyState
          actions={[
            {
              label: 'Thử lại',
              onPress: () => {
                void board.refetch();
                void tasks.refetch();
              },
            },
          ]}
          description={failure ? toErrorMessage(failure) : 'Không tải được bảng này.'}
          icon="alert-warning"
          title="Không tải được bảng"
          tone="danger"
        />
      </Screen>
    );
  }

  if (board.isLoading || !filterState.ready || !tasks.data) {
    return (
      <Screen constrained={false} header={header} padded={false} scrollable={false}>
        {/* Khung xương có dáng CỘT thật (nền cột · đầu cột · hai thẻ) + nhãn "Đang tải…" cho trình đọc màn hình. */}
        <ScreenState
          className="flex-1"
          skeleton={
            <View className="flex-1 flex-row gap-sm px-md pt-xs">
              {[0, 1, 2].map((index) => (
                <View key={index} className="h-80 flex-1 gap-xs rounded-sm bg-bg-2 p-xs">
                  <Skeleton className="h-8 w-2/3 rounded-full" />
                  <Skeleton className="h-20 rounded-xs" />
                  <Skeleton className="h-20 rounded-xs" />
                </View>
              ))}
            </View>
          }
          state="loading"
        />
      </Screen>
    );
  }

  return (
    // `constrained={false}`: nhiều cột trên tablet cần TRÀN hết bề ngang, trần 720dp của `Screen`
    // (`max-w-content`) biến máy tính bảng thành điện thoại to (xem JSDoc `Screen.constrained`).
    <Screen constrained={false} contentClassName="flex-1" header={header} padded={false} scrollable={false}>
      {kanban.archived ? (
        <View className="px-md pb-xs">
          <Alert description="Bảng đã lưu trữ — chỉ xem, không thể kéo hay thêm thẻ." tone="warning" />
        </View>
      ) : null}

      <BoardFilterBar
        chips={filterState.chips}
        labels={kanban.labelList}
        wsId={wsId}
        onPatch={filterState.patch}
        onQuery={filterState.setQuery}
        onReset={filterState.reset}
      />

      {kanban.activeBatchId && !kanban.offline ? (
        <View className="px-md pb-xs">
          <RescheduleBanner
            batchId={kanban.activeBatchId}
            boardId={boardId}
            onDismiss={kanban.dismissBatch}
            onOpenTask={kanban.onOpenTaskId}
          />
        </View>
      ) : null}

      <View className="flex-1" onLayout={(event) => setKanbanAreaHeight(event.nativeEvent.layout.height)}>
        {kanbanAreaHeight > 0 ? (
          <KeyboardAvoidingView behavior="padding">
            <View style={{ height: kanbanAreaHeight }}>
              <DragProvider
                columns={columns}
                enabled={kanban.dragEnabled}
                withinColumnOnly={kanban.dragWithinColumnOnly}
                onMove={kanban.onMove}
              >
                <KanbanPager
                  canCreate={kanban.canCreate}
                  canMove={kanban.canMove}
                  columns={columns}
                  hasMore={kanban.hasMore}
                  labels={labels}
                  showCreate={permissions.canCreateTask}
                  tasks={kanban.tasksByColumn}
                  onA11yAction={kanban.onA11yAction}
                  onCreate={kanban.onCreate}
                  onLoadMore={kanban.onLoadMore}
                  onOpenMenu={kanban.setMenuTask}
                  onOpenTask={kanban.onOpenTask}
                />
                <DragOverlay columns={columns} labels={labels} />
              </DragProvider>
            </View>
          </KeyboardAvoidingView>
        ) : null}
      </View>

      <KanbanTaskModals boardId={boardId} kanban={kanban} />
    </Screen>
  );
}
