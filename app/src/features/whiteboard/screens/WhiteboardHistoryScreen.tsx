import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { Dialog } from '@/shared/ui/modal';
import { AppBar } from '@/shared/ui/navigation';
import { LoadingMore } from '@/shared/ui/progress';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import type { SnapshotView } from '../api/whiteboard.types';
import { SaveSnapshotSheet } from '../components/SaveSnapshotSheet';
import { SnapshotRow } from '../components/SnapshotRow';
import { useDisclosure, useSheetTarget } from '../hooks/useSheetTarget';
import { useRestoreSnapshot } from '../queries/whiteboard.mutations';
import { useSnapshots, useWhiteboard } from '../queries/whiteboard.queries';
import { isVersionConflict, whiteboardErrorMessage } from '../utils/whiteboard-errors';

/**
 * Lịch sử phiên bản (app.md §3 dòng "Lịch sử"): danh sách bản lưu (Tự động · Thủ công · Trước khi khôi phục), "Lưu bản", chạm → "Khôi phục" (Dialog xác nhận
 * nêu rõ HỆ QUẢ: mọi người đang vẽ sẽ thấy nội dung được thay; hệ thống tự lưu bản "Trước khi khôi phục" nên làm lại được). Khôi phục gửi `expectedVersion` của
 * METADATA đang thấy; 409 → tải lại + "Bảng vừa thay đổi, thử lại". Quyền do `myPermissions` (server tính). ⚠️ Chưa có xem trước bản lưu (chỉ đọc) —
 * xem `SnapshotRow`; chưa có bố cục panel bên phải cho máy tính bảng (app.md §7).
 */
export function WhiteboardHistoryScreen() {
  const { wbId } = useLocalSearchParams<{ wbId: string; wsId: string }>();
  const board = useWhiteboard(wbId);
  const snapshots = useSnapshots(wbId);
  const restore = useRestoreSnapshot(wbId);
  const save = useDisclosure();
  const confirm = useSheetTarget<SnapshotView>();
  const items = useMemo(
    () => snapshots.data?.pages.flatMap((page) => page.items) ?? [],
    [snapshots.data],
  );
  const refreshControl = useListRefreshControl({
    onRefresh: () => void snapshots.refetch(),
    refreshing: snapshots.isRefetching && !snapshots.isFetchingNextPage,
  });

  const active = board.data?.status === 'ACTIVE';
  const canRestore = Boolean(board.data?.myPermissions.restore) && active;
  const canSave = Boolean(board.data?.myPermissions.snapshot) && active;

  const doRestore = () => {
    const snapshot = confirm.target;
    if (!snapshot || !board.data) return;
    restore.mutate(
      { expectedVersion: board.data.version, snapshotId: snapshot.id },
      {
        onError: (error) =>
          showToast(
            'error',
            isVersionConflict(error) ? 'Bảng vừa thay đổi, hãy thử lại.' : whiteboardErrorMessage(error),
          ),
        onSettled: confirm.close,
        onSuccess: () => {
          // Khôi phục xong = việc lớn thành công ⇒ nhịp `success` đi cùng toast.
          hapticSuccess();
          showToast('success', 'Đã khôi phục phiên bản. Mọi người đang mở sẽ thấy nội dung mới.');
        },
      },
    );
  };

  return (
    <Screen
      header={
        <AppBar
          actions={
            canSave ? (
              <Button label="Lưu bản" size="sm" variant="secondary" onPress={save.open} />
            ) : undefined
          }
          title="Lịch sử phiên bản"
          onBack={router.back}
        />
      }
      padded={false}
      scrollable={false}
    >
      <View className="flex-1">
        {snapshots.isLoading ? (
          // Khung xương đúng dáng hàng bản lưu (ô icon + hai dòng chữ).
          <View className="gap-lg px-md py-sm">
            {[0, 1, 2, 3, 4].map((index) => (
              <SkeletonParagraphWithIcon key={index} />
            ))}
          </View>
        ) : (
          <FlashList
            contentContainerStyle={{ paddingBottom: 24 }}
            data={items}
            keyExtractor={(snapshot) => snapshot.id}
            ListEmptyComponent={
              snapshots.isError ? (
                <EmptyState
                  actions={[{ label: 'Thử lại', onPress: () => void snapshots.refetch() }]}
                  description={whiteboardErrorMessage(snapshots.error)}
                  icon="alert-warning"
                  title="Không tải được lịch sử"
                  tone="danger"
                />
              ) : (
                <EmptyState
                  description="Hệ thống tự lưu mỗi giờ khi có thay đổi; bạn cũng có thể bấm “Lưu bản” bất cứ lúc nào."
                  icon="history"
                  title="Chưa có phiên bản nào"
                  tone="brand"
                />
              )
            }
            ListFooterComponent={snapshots.isFetchingNextPage ? <LoadingMore /> : null}
            refreshControl={refreshControl}
            renderItem={({ item }) => (
              <SnapshotRow snapshot={item} onPress={canRestore ? confirm.open : undefined} />
            )}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            onEndReached={() => {
              if (snapshots.hasNextPage && !snapshots.isFetchingNextPage)
                void snapshots.fetchNextPage();
            }}
          />
        )}
      </View>
      <SaveSnapshotSheet visible={save.visible} wbId={wbId} onClose={save.close} />
      <Dialog
        description="Nội dung hiện tại sẽ được thay bằng phiên bản này — mọi người đang vẽ trên bảng sẽ thấy ngay. Hệ thống tự lưu bản 'Trước khi khôi phục' nên bạn vẫn quay lại được."
        primaryAction={{ label: 'Khôi phục', loading: restore.isPending, onPress: doRestore }}
        secondaryAction={{ disabled: restore.isPending, label: 'Huỷ', onPress: confirm.close }}
        title="Khôi phục phiên bản này?"
        visible={confirm.visible}
        onClose={confirm.close}
      />
    </Screen>
  );
}
