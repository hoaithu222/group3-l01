import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { BackHandler, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { Dialog } from '@/shared/ui/modal';
import { AppBar } from '@/shared/ui/navigation';
import { LoadingMore } from '@/shared/ui/progress';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import type { SnapshotView } from '../api/docs.types';
import { SaveSnapshotSheet } from '../components/SaveSnapshotSheet';
import { SnapshotRow } from '../components/SnapshotRow';
import { SnapshotViewer } from '../components/SnapshotViewer';
import { useDisclosure, useSheetTarget } from '../hooks/useSheetTarget';
import { useRestoreSnapshot } from '../queries/docs.mutations';
import { useDocument, useSnapshots } from '../queries/docs.queries';
import { docsErrorMessage, isVersionConflict } from '../utils/docs-errors';

/**
 * Lịch sử phiên bản (app.md §3 dòng "Lịch sử"): danh sách bản lưu (Tự động · Thủ công · Trước khi khôi phục), "Lưu phiên bản", chạm → xem chỉ đọc,
 * "Khôi phục" (Dialog xác nhận nêu rõ HỆ QUẢ: mọi người đang sửa sẽ thấy nội dung được thay; hệ thống tự lưu bản "Trước khi khôi phục" nên làm lại được).
 * Khôi phục gửi `expectedVersion` của METADATA đang thấy; 409 → tải lại + "Tài liệu vừa thay đổi, thử lại". Quyền do `myPermissions` (server tính).
 * ⚠️ Chưa có bố cục panel bên phải cho máy tính bảng (app.md §7) — mọi cỡ màn đều dùng màn riêng.
 */
export function DocumentHistoryScreen() {
  const { docId } = useLocalSearchParams<{ docId: string; wsId: string }>();
  const doc = useDocument(docId);
  const snapshots = useSnapshots(docId);
  const restore = useRestoreSnapshot(docId);
  const save = useDisclosure();
  const viewing = useSheetTarget<SnapshotView>();
  const confirm = useSheetTarget<SnapshotView>();
  const items = useMemo(
    () => snapshots.data?.pages.flatMap((p) => p.items) ?? [],
    [snapshots.data],
  );
  const refreshControl = useListRefreshControl({
    onRefresh: () => void snapshots.refetch(),
    refreshing: snapshots.isRefetching && !snapshots.isFetchingNextPage,
  });

  // Nút Back cứng của Android đóng bản đang xem trước (thay vì thoát cả màn lịch sử).
  const { close: closeViewing, visible: viewingVisible } = viewing;
  useEffect(() => {
    if (!viewingVisible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeViewing();
      return true;
    });
    return () => sub.remove();
  }, [closeViewing, viewingVisible]);

  const active = doc.data?.status === 'ACTIVE';
  const canRestore = Boolean(doc.data?.myPermissions.restore) && active;
  const canSave = Boolean(doc.data?.myPermissions.snapshot) && active;

  const doRestore = () => {
    const snapshot = confirm.target;
    if (!snapshot || !doc.data) return;
    restore.mutate(
      { expectedVersion: doc.data.version, snapshotId: snapshot.id },
      {
        onError: (error) =>
          showToast(
            'error',
            isVersionConflict(error)
              ? 'Tài liệu vừa thay đổi, hãy thử lại.'
              : docsErrorMessage(error),
          ),
        onSettled: confirm.close,
        onSuccess: () => {
          // Khôi phục xong = việc lớn thành công ⇒ nhịp `success` đi cùng toast.
          hapticSuccess();
          showToast('success', 'Đã khôi phục phiên bản. Mọi người đang mở sẽ thấy nội dung mới.');
          viewing.close();
        },
      },
    );
  };

  const confirmDialog = (
    <Dialog
      description="Nội dung hiện tại sẽ được thay bằng phiên bản này — mọi người đang sửa tài liệu sẽ thấy ngay. Hệ thống tự lưu bản 'Trước khi khôi phục' nên bạn vẫn quay lại được."
      primaryAction={{ label: 'Khôi phục', loading: restore.isPending, onPress: doRestore }}
      secondaryAction={{ disabled: restore.isPending, label: 'Huỷ', onPress: confirm.close }}
      title="Khôi phục phiên bản này?"
      visible={confirm.visible}
      onClose={confirm.close}
    />
  );

  if (viewing.visible && viewing.target) {
    return (
      <>
        <SnapshotViewer
          canRestore={canRestore}
          docId={docId}
          restoring={restore.isPending}
          snapshot={viewing.target}
          onClose={viewing.close}
          onRestore={confirm.open}
        />
        {confirmDialog}
      </>
    );
  }

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
                  description={docsErrorMessage(snapshots.error)}
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
            renderItem={({ item }) => <SnapshotRow snapshot={item} onPress={viewing.open} />}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            onEndReached={() => {
              if (snapshots.hasNextPage && !snapshots.isFetchingNextPage)
                void snapshots.fetchNextPage();
            }}
          />
        )}
      </View>
      <SaveSnapshotSheet docId={docId} visible={save.visible} onClose={save.close} />
    </Screen>
  );
}
