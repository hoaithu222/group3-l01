import { FlashList } from '@shopify/flash-list';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { ActivityWidgetsSlot } from '@/shared/activity-widgets';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/modal';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen, useListRefreshControl } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { LoadingMore } from '@/shared/ui/progress';
import { isNetworkError } from '@/shared/utils/errors';
import { hapticTap } from '@/shared/utils/haptics';

import { ActivityDayHeader } from '../components/ActivityDayHeader';
import { ActivityFilterTabs } from '../components/ActivityFilterTabs';
import { ActivityItem } from '../components/ActivityItem';
import { WorkspaceFilterChip } from '../components/WorkspaceFilterChip';
import { useActivityScreen } from '../hooks/useActivityScreen';
import type { ActivityRow } from '../utils/group-by-day';

const EMPTY_DESCRIPTION =
  'Nhắc đến bạn, trả lời luồng bạn theo dõi, được thêm vào kênh riêng tư hoặc nhóm chat sẽ hiện ở đây.';

/**
 * Hoạt động — hộp thư "cần chú ý" (p1-07 `app.md` §3). KHÔNG phải nơi liệt kê mọi tin nhắn 1-1: chỉ nhắc tên, trả lời
 * luồng theo dõi, được thêm vào nhóm/kênh riêng tư và thay đổi quản trị liên quan mình. Số chưa đọc theo cuộc trò chuyện
 * nằm ở tab Tin nhắn/Nhóm, không phải ở đây.
 */
export function ActivityScreen() {
  const s = useActivityScreen();
  const { list } = s;
  // Vòng quay kéo-để-làm-mới THEO TOKEN (`refreshing`/`onRefresh` trần dựng vòng mặc định — biến mất ở chế độ tối).
  const refreshControl = useListRefreshControl({
    onRefresh: () => void list.refetch(),
    refreshing: list.isRefetching && !list.isFetchingNextPage,
  });

  return (
    <Screen
      header={
        <AppBar
          actions={
            s.hasUnread ? (
              <Button
                label="Đọc tất cả"
                size="sm"
                variant="tertiary"
                onPress={() => s.setConfirmingReadAll(true)}
              />
            ) : undefined
          }
          title="Hoạt động"
        />
      }
      padded={false}
      scrollable={false}
    >
      <View className="flex-1 gap-xs py-xs">
        <View className="gap-xs px-md">
          {/* Widget "việc đang chờ bạn" do feature khác đăng ký (thẻ cần ôn, thẻ cần chấm…) — ở ĐẦU và không phụ thuộc bộ lọc bên dưới. Chưa
              đăng ký/đều ẩn ⇒ không vẽ gì, không chừa khoảng trống (widget trả `null` thẳng, xem `@/shared/activity-widgets`). */}
          <ActivityWidgetsSlot />
          {/* `-mt-sm`: hàng tab gạch chân cao 48dp, nhãn 20dp nằm giữa ⇒ tự mang sẵn 14dp trống PHÍA TRÊN nhãn. Cộng 12dp dưới chữ tiêu
              đề của `AppBar` và `py-xs` (8) của khối này là ~34dp từ "Hoạt động" tới "Tất cả" — tab trôi xa tiêu đề. Kéo lên 12 còn ~22dp.
              Có widget phía trên thì hàng tab (nền trong suốt) chỉ lấn 4dp vào đệm dưới của thẻ widget, nhãn vẫn cách thẻ 10dp.
              ⛔ Đừng bỏ `py-xs` của khối để thay cho cách này: khi có widget, thẻ widget (khối đầu) sẽ dính sát chữ tiêu đề. */}
          <ActivityFilterTabs className="-mt-sm" value={s.tab} onChange={s.setTab} />
          <View className="flex-row">
            <WorkspaceFilterChip value={s.workspace} onChange={s.setWorkspace} />
          </View>
        </View>

        <View className="flex-1">
          {list.isLoading ? (
            // Khung xương CÙNG DÁNG hàng thật (avatar/ô icon + hai dòng chữ) — dữ liệu về không làm danh sách nhảy bố cục.
            <View className="gap-md px-md py-xs">
              {Array.from({ length: 6 }).map((_, index) => (
                <SkeletonParagraphWithIcon key={index} />
              ))}
            </View>
          ) : list.isError && s.items.length === 0 ? (
            // Mất mạng ⇒ nói rõ là lỗi KẾT NỐI (`offline`, tông trung tính); lỗi khác giữ câu của máy chủ.
            isNetworkError(list.error) ? (
              <ScreenState
                action={{ label: 'Thử lại', onPress: () => void list.refetch() }}
                state="offline"
                title="Không tải được hoạt động"
              />
            ) : (
              <EmptyState
                actions={[{ label: 'Thử lại', onPress: () => void list.refetch() }]}
                description={toErrorMessage(list.error)}
                icon="alert-warning"
                title="Không tải được hoạt động"
                tone="danger"
              />
            )
          ) : s.items.length === 0 ? (
            // Đang lọc mà rỗng ≠ hộp thư rỗng: nói rõ là bộ lọc và cho MỘT lối thoát ("Bỏ lọc") thay vì để người dùng
            // đoán vì sao trống (cùng cách màn "Đã lưu" làm).
            s.tab !== 'all' || s.workspace !== null ? (
              <EmptyState
                actions={[{ label: 'Bỏ lọc', onPress: s.clearFilters }]}
                description="Thử chọn tab khác hoặc lọc theo nhóm khác."
                icon="filter"
                title="Không có hoạt động nào khớp bộ lọc"
                tone="neutral"
              />
            ) : (
              <EmptyState
                description={EMPTY_DESCRIPTION}
                icon="notification"
                title="Chưa có hoạt động cần chú ý"
              />
            )
          ) : (
            <FlashList<ActivityRow>
              contentContainerStyle={{ paddingBottom: 16 }}
              data={s.rows}
              extraData={s.workspaceNames}
              getItemType={(row) => row.type}
              keyExtractor={(row) => row.key}
              ListFooterComponent={list.isFetchingNextPage ? <LoadingMore /> : null}
              refreshControl={refreshControl}
              renderItem={({ item: row }) =>
                row.type === 'header' ? (
                  <ActivityDayHeader label={row.label} />
                ) : (
                  <ActivityItem
                    item={row.item}
                    workspaceNames={s.workspaceNames}
                    onPress={s.open}
                  />
                )
              }
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              testID="activity-list"
              onEndReached={() => {
                if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
              }}
              onEndReachedThreshold={0.4}
            />
          )}
        </View>
      </View>

      <Dialog
        description={`Sẽ đánh dấu đã đọc ${s.readAllScope}. Mục đến sau bây giờ vẫn chưa đọc.`}
        primaryAction={{
          label: 'Đánh dấu đã đọc',
          loading: s.isReadingAll,
          // Rung "chạm" xác nhận hành động chính của hộp thoại, TRƯỚC khi gửi (lệnh đi qua mạng).
          onPress: () => {
            hapticTap();
            s.confirmReadAll();
          },
        }}
        secondaryAction={{ label: 'Huỷ', onPress: () => s.setConfirmingReadAll(false) }}
        title="Đánh dấu tất cả đã đọc?"
        visible={s.confirmingReadAll}
        onClose={() => s.setConfirmingReadAll(false)}
      />
    </Screen>
  );
}
