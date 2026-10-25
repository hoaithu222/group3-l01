import { useState } from 'react';
import { View } from 'react-native';

import { EmptyState } from '@/shared/ui/empty-state';
import { ScreenState } from '@/shared/ui/screen-state';
import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';
import { isNetworkError, toErrorMessage } from '@/shared/utils/errors';

import { DEFAULT_CENTER, O2O_TONE, RADIUS_STEPS_M } from '../constants/o2o.constants';
import { useUserLocation } from '../hooks/useUserLocation';
import { useNearbyLocations } from '../queries/locations.queries';
import { formatRadius, nextRadius } from '../utils/geo';
import { LocationRow } from './LocationRow';

export interface ShopPickerProps {
  onPick: (shop: { id: string; name: string }) => void;
}

/**
 * Chọn TIỆM IN khi màn cấu hình mở mà chưa biết tiệm nào — lối vào từ Resource Hub ("In tài liệu" chỉ mang `resourceId`, app.md §1).
 * Liệt kê tiệm in đang nhận đơn quanh bạn (vị trí ĐÃ được cấp thì dùng, chưa thì quanh khuôn viên — không xin quyền ở đây, xin quyền là việc của màn
 * Địa điểm). Vào từ chi tiết địa điểm thì đã có `shopId` nên không qua khối này.
 */
export function ShopPicker({ onPick }: ShopPickerProps) {
  const [radiusM, setRadiusM] = useState<number>(RADIUS_STEPS_M[0]);
  const { state } = useUserLocation();
  const center = state.status === 'granted' ? state.coords : DEFAULT_CENTER;
  const query = useNearbyLocations(center, { radiusM, type: 'PRINT_SHOP' });
  const shops = (query.data ?? []).filter((item) => item.shop?.acceptingOrders === true);
  const larger = nextRadius(radiusM, RADIUS_STEPS_M);

  return (
    <Section icon="store-location" title="Chọn tiệm in">
      {query.isPending ? (
        <View className="gap-sm">
          <Skeleton className="h-28 rounded-md" />
          <Skeleton className="h-28 rounded-md" />
        </View>
      ) : query.isError ? (
        <ScreenState
          action={{ label: 'Thử lại', onPress: () => void query.refetch() }}
          description={toErrorMessage(query.error)}
          fullscreen={false}
          state={isNetworkError(query.error) ? 'offline' : 'error'}
        />
      ) : shops.length === 0 ? (
        // Rỗng của RIÊNG phân hệ ⇒ hình minh hoạ tông phân hệ + lối ra "tìm xa hơn" ngay tại chỗ (không phải một dòng chữ trơn).
        <EmptyState
          actions={
            larger
              ? [{ label: `Tìm trong ${formatRadius(larger)}`, onPress: () => setRadiusM(larger) }]
              : undefined
          }
          description={`Chưa có tiệm in nào đang nhận đơn trong ${formatRadius(radiusM)}.`}
          icon="store-location"
          size="compact"
          title="Chưa có tiệm in gần đây"
          tone={O2O_TONE}
        />
      ) : (
        <View className="gap-sm">
          {shops.map((item) => (
            <LocationRow
              key={item.id}
              item={item}
              onPress={() => item.shop && onPick({ id: item.shop.id, name: item.name })}
            />
          ))}
        </View>
      )}
    </Section>
  );
}
