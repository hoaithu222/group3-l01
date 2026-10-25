import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Skeleton } from '@/shared/ui/skeleton';
import { isNetworkError, toErrorMessage } from '@/shared/utils/errors';

import { LocationDetailBody } from '../components/LocationDetailBody';
import { useLocationDetail } from '../queries/locations.queries';
import { isNotAvailable } from '../utils/o2o-errors';

/**
 * Chi tiết địa điểm (app.md §3): ảnh, địa chỉ + chỉ đường, giờ mở, tiện ích, tiệm in (bảng giá + "Đặt in"), đánh giá.
 * 404 (`O2O_010`: ẩn/không còn) → "Địa điểm không còn hiển thị" KHÔNG có "Thử lại" (thử lại vẫn 404). Mất mạng khác lỗi khác. Kéo để làm mới.
 */
export function LocationDetailScreen() {
  const { locationId } = useLocalSearchParams<{ locationId: string }>();
  const query = useLocationDetail(locationId);
  const header = <AppBar title={query.data?.name ?? 'Địa điểm'} onBack={router.back} />;

  if (query.isPending) {
    // Cùng hình dạng thân trang thật: băng ảnh · khối tên (ô icon 48 + chữ) · thẻ giờ mở — không nhảy bố cục lúc dữ liệu về.
    return (
      <Screen header={header}>
        <View className="gap-xl py-xs">
          <Skeleton className="h-40 rounded-md" />
          <View className="flex-row items-center gap-sm">
            <Skeleton className="size-5xl rounded-sm" />
            <Skeleton className="h-6 flex-1 rounded-sm" />
          </View>
          <Skeleton className="h-24 rounded-md" />
        </View>
      </Screen>
    );
  }

  if (query.isError) {
    return (
      <Screen header={header}>
        {isNotAvailable(query.error) ? (
          // 404 = "không còn" (quy ước tông `warning` cho mất quyền/không tồn tại) — `EmptyState` vì `ScreenState` rỗng không nhận tông.
          <EmptyState
            description="Địa điểm này đã bị ẩn hoặc không còn. Hãy quay lại bản đồ để chọn nơi khác."
            icon="location"
            title="Địa điểm không còn hiển thị"
            tone="warning"
          />
        ) : (
          <ScreenState
            action={{ label: 'Thử lại', onPress: () => void query.refetch() }}
            description={toErrorMessage(query.error)}
            state={isNetworkError(query.error) ? 'offline' : 'error'}
          />
        )}
      </Screen>
    );
  }

  return (
    <Screen header={header} refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <LocationDetailBody detail={query.data} />
    </Screen>
  );
}
