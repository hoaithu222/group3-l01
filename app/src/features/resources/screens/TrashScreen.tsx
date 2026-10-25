import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Text, View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { SPACING } from '@/shared/theme';
import { Alert } from '@/shared/ui/alert';
import { EmptyState } from '@/shared/ui/empty-state';
import { Dialog } from '@/shared/ui/modal';
import { AppBar } from '@/shared/ui/navigation';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import { LoadingMore } from '@/shared/ui/progress';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { hapticTap } from '@/shared/utils/haptics';

import { TrashRow } from '../components/TrashRow';
import { useIsOnline } from '../hooks/useIsOnline';
import { useResourceLimits } from '../hooks/useResourceLimits';
import { useResourceNavigation } from '../hooks/useResourceNavigation';
import { useTrashActions } from '../hooks/useTrashActions';
import { useTrash } from '../queries/trash.queries';
import { buildTrashEntries, type TrashEntry } from '../utils/trash-entries';

/**
 * Thùng rác của workspace (app.md p3-01 §3): danh sách đã xoá (≤ 30 ngày, "còn N
 * ngày"), Khôi phục, Xoá vĩnh viễn (OWNER/ADMIN, có hộp thoại xác nhận). MEMBER
 * chỉ thấy/khôi phục của mình (BE lọc). Ngoại tuyến ⇒ chỉ đọc (ẩn nút).
 */
export function TrashScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const nav = useResourceNavigation(wsId);
  const online = useIsOnline();
  const limits = useResourceLimits();
  const trash = useTrash(wsId);
  const actions = useTrashActions(wsId);

  const entries = useMemo(() => buildTrashEntries(trash.data?.pages ?? []), [trash.data]);

  // ⚠️ BE chỉ liệt kê GỐC của lô xoá nên một trang có thể NGẮN hơn `limit` — thậm chí RỖNG mà
  // `hasMore` vẫn `true` (cả trang toàn mục lồng trong lô xoá thư mục). Danh sách rỗng không cuộn
  // được nên `onEndReached` không bắn: phải tự lấy tiếp, kẻo hiện "Thùng rác trống" oan.
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = trash;
  // Vòng quay kéo-để-làm-mới THEO TOKEN (`refreshing`/`onRefresh` trần dựng vòng mặc định — biến mất ở chế độ tối).
  const refreshControl = useListRefreshControl({
    onRefresh: () => void trash.refetch(),
    refreshing: trash.isRefetching,
  });
  // Lỗi lấy trang kế thì DỪNG (nút "Thử lại" bên dưới), tránh vòng lặp gọi vô hạn.
  const drainingEmpty = entries.length === 0 && hasNextPage && !trash.isError;
  useEffect(() => {
    if (drainingEmpty && !isFetchingNextPage) void fetchNextPage();
  }, [drainingEmpty, fetchNextPage, isFetchingNextPage]);

  // Khôi phục/xoá hẳn: cờ do BE tính (`canRestore`/`canPurge`); ngoại tuyến thì ẩn cả hai.
  const renderRow = ({ item }: { item: TrashEntry }) => (
    <TrashRow
      busy={actions.busy}
      canPurge={online && item.canPurge}
      canRestore={online && item.canRestore}
      entry={item}
      onPurge={actions.requestPurge}
      onRestore={(entry) => {
        // Khôi phục là hành động CHÍNH của màn: rung nhẹ xác nhận cú chạm ngay, trước khi chờ mạng.
        hapticTap();
        void actions.restore(entry);
      }}
    />
  );

  return (
    <Screen
      header={<AppBar title="Thùng rác" onBack={nav.back} />}
      padded={false}
      scrollable={false}
    >
      <View className="flex-1 gap-xs pt-xs">
        {/* ✅ Ghi chú lưu giữ là CHÚ THÍCH một dòng, không phải `Alert`: thông tin luôn đúng và không cần ai xử lý
            thì không chiếm ~70dp đầu màn bằng một khung thông báo (khung đó dành cho cảnh báo — như dải ngoại tuyến bên dưới). */}
        <Text className="px-md text-caption-lg text-fg-2">
          {`Tệp và thư mục đã xoá được giữ ${limits.trashRetentionDays} ngày rồi xoá hẳn.`}
        </Text>
        {!online ? (
          <View className="px-md">
            <Alert
              description="Kết nối lại để khôi phục hoặc xoá vĩnh viễn."
              title="Bạn đang ngoại tuyến"
              tone="warning"
            />
          </View>
        ) : null}
        <View className="flex-1">
          {trash.isLoading || drainingEmpty ? (
            // Khung xương đúng dáng hàng thật (ô icon + hai dòng chữ), cùng lề 16 với hàng.
            <View className="gap-lg px-md py-sm">
              {Array.from({ length: 5 }).map((_, index) => (
                <SkeletonParagraphWithIcon key={index} />
              ))}
            </View>
          ) : trash.isError && entries.length === 0 ? (
            <EmptyState
              actions={[{ label: 'Thử lại', onPress: () => void trash.refetch() }]}
              description={toErrorMessage(trash.error)}
              icon="alert-warning"
              title="Không tải được thùng rác"
              tone="danger"
            />
          ) : entries.length === 0 ? (
            <EmptyState
              description="Tệp và thư mục bạn xoá sẽ nằm ở đây."
              icon="delete"
              title="Thùng rác trống"
              tone="neutral"
            />
          ) : (
            <FlashList<TrashEntry>
              contentContainerStyle={{ paddingBottom: SPACING.md }}
              data={entries}
              keyExtractor={(entry) => entry.key}
              ListFooterComponent={isFetchingNextPage ? <LoadingMore /> : null}
              refreshControl={refreshControl}
              renderItem={renderRow}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              onEndReached={() => {
                if (trash.hasNextPage && !trash.isFetchingNextPage) void trash.fetchNextPage();
              }}
            />
          )}
        </View>
      </View>

      <Dialog
        description={`"${actions.purgeEntry?.name ?? ''}" sẽ bị xoá hẳn khỏi kho và không thể khôi phục.`}
        primaryAction={{
          label: 'Xoá vĩnh viễn',
          loading: actions.purgePending,
          onPress: () => void actions.confirmPurge(),
        }}
        secondaryAction={{
          disabled: actions.purgePending,
          label: 'Huỷ',
          onPress: actions.closePurge,
        }}
        title="Xoá vĩnh viễn?"
        variant="error"
        visible={actions.purgeEntry !== null}
        onClose={actions.closePurge}
      />
    </Screen>
  );
}
