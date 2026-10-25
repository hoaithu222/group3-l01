import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { useAuthStore } from '@/shell/store/slices/auth';
import { SPACING } from '@/shared/theme';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/modal';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import { TaskCommentComposer } from '../components/task/TaskCommentComposer';
import { TaskDetailAppBar } from '../components/task/TaskDetailAppBar';
import { TaskDetailFailure } from '../components/task/TaskDetailFailure';
import { TaskDetailSections } from '../components/task/TaskDetailSections';
import { TaskDetailSheets } from '../components/task/TaskDetailSheets';
import { useTaskDetailActions } from '../hooks/useTaskDetailActions';
import { useTaskDetailState } from '../hooks/useTaskDetailState';
import { useTaskUploadGuard } from '../hooks/useTaskUploadGuard';
import { resolveBoardPermissions } from '../utils/board-permissions';

/** Chừa chỗ cho ô soạn bình luận dính đáy khi cuộn mục đang nhập lên khỏi bàn phím. */
const COMPOSER_OFFSET = 96;
const FILL = { flex: 1 } as const;

/**
 * Màn chi tiết thẻ (app.md p3-03 §3): tiêu đề sửa tại chỗ · thuộc tính · mô tả Markdown · việc nhỏ · tệp ·
 * trao đổi (hoạt động + bình luận), ô soạn bình luận dính đáy. Điện thoại: modal một cột; tablet: hai cột.
 *
 * Trạng thái: bản giữ chỗ từ thẻ mini (tiêu đề/chip hiện ngay, phần còn lại khung chờ) → dữ liệu thật;
 * 404 → "Thẻ không còn tồn tại"; thẻ đã xoá → banner "Khôi phục" (nếu được phép); offline/lưu trữ → chỉ đọc.
 * Mất quyền do `BoardScopeProvider` (layout `[boardId]`) đưa ra hub nhóm — ở đây không cần lo lại.
 */
export function TaskDetailScreen() {
  const { boardId, taskId, wsId } = useLocalSearchParams<{
    boardId: string;
    taskId: string;
    wsId: string;
  }>();
  const state = useTaskDetailState(boardId, taskId, wsId);
  const actions = useTaskDetailActions({
    boardId,
    detail: state.detail.data,
    save: state.save,
    taskId,
    wsId,
  });
  const guard = useTaskUploadGuard(taskId);
  const currentUserId = useAuthStore((store) => store.user?.id ?? '');
  const [confirmLeave, setConfirmLeave] = useState(false);

  const { access, detail } = state;
  const data = detail.data;
  const onBack = () => (guard.busyCount > 0 ? setConfirmLeave(true) : actions.leave());
  const boardPermissions = resolveBoardPermissions(state.board.data?.myPermissions, {
    archived: state.archived,
  });
  const header = <TaskDetailAppBar hasTask={Boolean(data)} onBack={onBack} onOpenMenu={() => actions.open('menu')} />;

  if (state.notFound) {
    return (
      <Screen header={header} scrollable={false}>
        <TaskDetailFailure kind="notFound" onAction={actions.leave} />
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen header={header} scrollable={false}>
        {detail.isError ? (
          <TaskDetailFailure
            error={detail.error}
            kind="error"
            onAction={() => void detail.refetch()}
          />
        ) : (
          <View className="gap-md pt-xs">
            <Skeleton className="h-8 rounded-xs" />
            <Skeleton className="h-24 rounded-xs" />
            <Skeleton className="h-32 rounded-xs" />
          </View>
        )}
      </Screen>
    );
  }

  return (
    <Screen
      constrained={false}
      contentClassName="flex-1"
      header={header}
      padded={false}
      scrollable={false}
    >
      <KeyboardAwareScrollView
        bottomOffset={COMPOSER_OFFSET}
        contentContainerStyle={{
          gap: SPACING.md,
          padding: SPACING.md,
          paddingBottom: SPACING['3xl'],
        }}
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        style={FILL}
      >
        {state.conflict ? (
          <Alert
            description="Thẻ vừa được người khác thay đổi — đã tải bản mới. Kiểm tra lại giá trị của bạn."
            tone="warning"
            onClose={state.dismissConflict}
          />
        ) : null}
        {access.deleted ? (
          <Alert
            actions={
              access.canRestore ? (
                <Button
                  label="Khôi phục"
                  loading={actions.restoring}
                  size="sm"
                  onPress={actions.restore}
                />
              ) : undefined
            }
            description="Thẻ đã bị xoá. Bạn chỉ xem được, không sửa được."
            tone="warning"
          />
        ) : null}

        <TaskDetailSections
          access={access}
          boardId={boardId}
          canConvert={access.canEdit && boardPermissions.canCreateTask}
          columnTitle={state.columns.find((column) => column.id === data.columnId)?.title}
          currentUserId={currentUserId}
          detail={data}
          isAdmin={state.isAdmin}
          labels={state.labels}
          placeholder={detail.isPlaceholderData}
          taskId={taskId}
          wsId={wsId}
          onEditDescription={() =>
            router.push({
              params: { boardId, taskId, wsId },
              pathname: '/workspaces/[wsId]/boards/[boardId]/tasks/[taskId]/description',
            })
          }
          onOpenColumn={() => actions.open('move')}
          onOpenProperty={actions.open}
          onOpenTask={actions.openTask}
          onSaveTitle={(title) => state.save({ optimistic: { title }, patch: { title } })}
        />
      </KeyboardAwareScrollView>

      <TaskCommentComposer access={access} boardId={boardId} taskId={taskId} />

      <TaskDetailSheets
        access={access}
        actions={actions}
        boardId={boardId}
        canCreateLabel={boardPermissions.canEdit}
        canDuplicate={boardPermissions.canCreateTask && !state.offline && !access.deleted}
        canMove={boardPermissions.canMoveTask && !state.offline && !access.deleted}
        columns={state.columns}
        currentUserId={currentUserId}
        detail={data}
        labelList={state.labelList}
      />

      <Dialog
        description="Các tệp đang tải lên vẫn chạy nền và tự gắn vào thẻ khi xong. Bạn muốn làm gì?"
        primaryAction={{
          label: 'Chạy nền và đóng',
          onPress: () => {
            setConfirmLeave(false);
            actions.leave();
          },
        }}
        secondaryAction={{
          label: 'Huỷ tải lên',
          onPress: () => {
            guard.cancelAll();
            setConfirmLeave(false);
            actions.leave();
          },
        }}
        title="Đang tải tệp lên"
        visible={confirmLeave}
        onClose={() => setConfirmLeave(false)}
      />
    </Screen>
  );
}
