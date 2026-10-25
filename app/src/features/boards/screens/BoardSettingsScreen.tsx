import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useCapabilities } from '@/shell/capabilities';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import { BoardArchiveSection } from '../components/settings/BoardArchiveSection';
import { BoardColumnsSection } from '../components/settings/BoardColumnsSection';
import { BoardInfoSection } from '../components/settings/BoardInfoSection';
import { BoardReviewSection } from '../components/settings/BoardReviewSection';
import { LabelsEditor } from '../components/LabelsEditor';
import { useBoard } from '../queries/boards.queries';
import { readBoardLimits } from '../schemas/board.schemas';
import { resolveBoardPermissions } from '../utils/board-permissions';

/**
 * Cài đặt bảng (`app.md` §3 BoardSettings): tên/mô tả, cột, nhãn, lưu trữ. Chỉ
 * người có quyền `BOARD_EDIT` (OWNER/ADMIN) dùng được — MEMBER không thấy nút vào
 * từ Kanban, và nếu gõ đường dẫn thẳng thì thấy lời giải thích thay vì form.
 *
 * `onConflict` (409 `RES_003`) chỉ TẢI LẠI `detail` để lấy `version` mới; các
 * section giữ nguyên chữ người dùng đang sửa và tự hiện banner của mình.
 */
export function BoardSettingsScreen() {
  const { boardId, wsId } = useLocalSearchParams<{ boardId: string; wsId: string }>();
  const { data: capabilities } = useCapabilities();
  const limits = useMemo(() => readBoardLimits(capabilities?.limits), [capabilities?.limits]);
  const { data: board, error, isError, isLoading, refetch } = useBoard(boardId);

  const header = <AppBar title="Cài đặt bảng" onBack={router.back} />;

  if (isLoading) {
    return (
      <Screen header={header}>
        <View className="gap-md py-xs">
          <Skeleton className="h-40 rounded-md" />
          <Skeleton className="h-64 rounded-md" />
        </View>
      </Screen>
    );
  }

  if (isError || !board) {
    return (
      <Screen header={header}>
        <EmptyState
          actions={[{ label: 'Thử lại', onPress: () => void refetch() }]}
          description={error ? toErrorMessage(error) : 'Không tìm thấy bảng này.'}
          icon="alert-warning"
          title="Không tải được bảng"
          tone="danger"
        />
      </Screen>
    );
  }

  if (!resolveBoardPermissions(board.myPermissions).canEdit) {
    return (
      <Screen header={header}>
        <EmptyState
          description="Chỉ chủ nhóm và quản trị viên mới chỉnh được cài đặt bảng."
          icon="lock"
          title="Bạn không có quyền"
          tone="warning"
        />
      </Screen>
    );
  }

  const reload = () => void refetch();

  return (
    <Screen header={header} keyboardAware>
      <View className="gap-xl py-xs">
        <BoardInfoSection board={board} nameMax={limits.nameMax} onConflict={reload} />
        <BoardColumnsSection board={board} limits={limits} onConflict={reload} />
        <LabelsEditor board={board} labelsMax={limits.labelsMax} />
        <BoardReviewSection boardId={board.id} wsId={wsId} />
        <BoardArchiveSection board={board} wsId={wsId} />
      </View>
    </Screen>
  );
}
