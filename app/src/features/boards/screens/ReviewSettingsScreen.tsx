import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useCapabilities } from '@/shell/capabilities';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import { ReviewConfigReadOnly } from '../components/review/ReviewConfigReadOnly';
import { ReviewSettingsEditor } from '../components/review/ReviewSettingsEditor';
import { useBoard } from '../queries/boards.queries';
import { useReviewConfig } from '../queries/reviews.queries';
import { readReviewLimits } from '../schemas/review.schemas';
import { resolveBoardPermissions } from '../utils/board-permissions';
import { getHttpStatus } from '../utils/error-details';

/**
 * Cài đặt chấm chéo của bảng (p4-05 app.md §3 `ReviewSettings`, route `boards/[boardId]/review-settings`). OWNER/ADMIN (`BOARD_EDIT`)
 * sửa; MEMBER thấy bản chỉ đọc (biết thẻ mình sẽ bị chấm thế nào). Bảng đã lưu trữ cũng chỉ đọc.
 *
 * Tải: khung xương · lỗi + "Thử lại" · 404 "Không tìm thấy bảng". `RES_003` → banner + tải lại `version`, giữ chữ đang sửa.
 */
export function ReviewSettingsScreen() {
  const { boardId } = useLocalSearchParams<{ boardId: string; wsId: string }>();
  const { data: capabilities } = useCapabilities();
  const limits = readReviewLimits(capabilities?.limits);
  const board = useBoard(boardId);
  const config = useReviewConfig(boardId);
  const header = <AppBar title="Chấm chéo" onBack={router.back} />;

  if (config.isPending || board.isPending) {
    return (
      <Screen header={header}>
        <View className="gap-md py-xs">
          <Skeleton className="h-32 rounded-md" />
          <Skeleton className="h-48 rounded-md" />
        </View>
      </Screen>
    );
  }

  if (!config.data || !board.data) {
    const notFound = getHttpStatus(config.error) === 404 || getHttpStatus(board.error) === 404;
    const retry = () => {
      void config.refetch();
      void board.refetch();
    };
    return (
      <Screen header={header} scrollable={false}>
        <EmptyState
          actions={notFound ? [{ label: 'Quay lại', onPress: router.back }] : [{ label: 'Thử lại', onPress: retry }]}
          description={notFound ? 'Bảng đã bị xoá hoặc bạn không còn quyền xem.' : toErrorMessage(config.error ?? board.error)}
          icon={notFound ? 'lock' : 'alert-warning'}
          title={notFound ? 'Không tìm thấy bảng' : 'Không tải được cấu hình'}
          tone={notFound ? 'warning' : 'danger'}
        />
      </Screen>
    );
  }

  const archived = Boolean(board.data.archivedAt);
  if (!resolveBoardPermissions(board.data.myPermissions, { archived }).canEdit) {
    return (
      <Screen header={header}>
        <ReviewConfigReadOnly archived={archived} config={config.data} />
      </Screen>
    );
  }

  return (
    <Screen header={header} keyboardAware>
      <ReviewSettingsEditor boardId={boardId} config={config.data} limits={limits} onConflict={() => void config.refetch()} />
    </Screen>
  );
}
