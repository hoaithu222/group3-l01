import { router } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';

import { LocationFilterBar } from '../components/LocationFilterBar';
import { LocationMapBody } from '../components/LocationMapBody';
import { NearMeBar } from '../components/NearMeBar';
import { useLocationMap } from '../hooks/useLocationMap';
import { useMapSupport } from '../hooks/useMapSupport';
import { locationHref, O2O_ORDERS_HREF } from '../utils/o2o-routes';

/**
 * Màn "Địa điểm & in ấn" (app.md §3 "Bản đồ"): tìm quán cà phê / thư viện / tiệm in quanh vị trí, bằng BẢN ĐỒ + DANH SÁCH.
 *
 * Vị trí: KHÔNG tự xin quyền lúc mở (xem `NearMeBar`); chưa có vị trí thì tìm quanh khuôn viên mặc định. Bản đồ chỉ dựng khi có token Mapbox
 * và module native (`useMapSupport`) — thiếu thì chỉ còn danh sách, màn vẫn dùng đủ chức năng.
 * `padded={false}` + `scrollable={false}`: màn tự chia lề và tự giữ danh sách cuộn riêng (bản đồ không được nằm trong vùng cuộn — cử chỉ kéo
 * bản đồ và cuộn màn giành nhau). Khe đầu màn do khối đầu của màn sở hữu (`pt-xs`), `Screen` không chừa.
 */
export function LocationMapScreen() {
  const map = useLocationMap();
  const support = useMapSupport();
  const filtered =
    map.filters.type !== undefined || map.filters.openNow || map.filters.amenities.length > 0;

  const header = (
    <AppBar
      actions={
        <Button
          label="Đơn của tôi"
          size="sm"
          variant="secondary"
          onPress={() => router.push(O2O_ORDERS_HREF)}
        />
      }
      title="Địa điểm & in ấn"
      onBack={router.back}
    />
  );

  return (
    <Screen header={header} padded={false} scrollable={false}>
      <View className="flex-1 gap-xs pt-xs">
        <NearMeBar state={map.userState} onRequest={map.locateMe} />
        <LocationFilterBar filters={map.filters} onChange={map.setFilters} />
        <LocationMapBody
          filtered={filtered}
          map={map}
          support={support}
          onClearFilters={() => map.setFilters({ amenities: [], openNow: false })}
          onOpen={(item) => router.push(locationHref(item.id))}
        />
      </View>
    </Screen>
  );
}
