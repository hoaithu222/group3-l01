import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { appConfig } from '@/core/config/env.config';

import type { LatLng, LocationType } from '../../api/o2o.types';
import { MAP_TUNING } from '../../constants/o2o.constants';
import type { CameraTarget } from '../../hooks/useLocationMap';
import { loadMapboxModule, type MapboxModule } from '../../utils/native-modules';
import { MapPin } from './MapPin';

export interface MapPinData {
  id: string;
  name: string;
  type: LocationType;
  coordinate: LatLng;
}

export interface InteractiveMapProps {
  /** Lệnh dời camera — đổi `rev` thì bay tới `lat/lng` (kéo tay KHÔNG đổi nó). */
  camera: CameraTarget;
  pins: MapPinData[];
  selectedId: string | null;
  /** Chấm vị trí của tôi — vẽ bằng `MarkerView` từ toạ độ đã có, KHÔNG dùng `UserLocation` (nó tự đòi quyền vị trí ở tầng native). */
  userCoords: LatLng | null;
  onPinPress: (id: string) => void;
  /** Bản đồ vừa dừng (kéo/phóng xong) ở tâm này. */
  onIdle: (center: LatLng) => void;
  /** Lỗi tải nền bản đồ (mạng, token) — danh sách vẫn dùng bình thường, màn chỉ báo. */
  onLoadError: () => void;
}

const FLY_MS = 600;
const styles = StyleSheet.create({ fill: { flex: 1 } });

/** Đặt token đúng MỘT lần cho cả phiên. `setAccessToken` phải chạy TRƯỚC lần vẽ `MapView` đầu tiên, nên gọi ở bộ khởi tạo state chứ không ở effect. */
let tokenApplied = false;
function ensureMapbox(): MapboxModule | null {
  const module = loadMapboxModule();
  if (module && !tokenApplied) {
    tokenApplied = true;
    void module.setAccessToken(appConfig.mapboxToken);
  }
  return module;
}

/**
 * LỚP MỎNG duy nhất chạm `@rnmapbox/maps` (app.md §6 "cùng interface `InteractiveMap`" — thay bằng `react-native-maps` nếu Mapbox hỏng
 * với SDK 57/New Arch thì chỉ sửa file này). Mọi thứ còn lại của feature nói chuyện với bản đồ qua props ở trên, nên test dựng được bằng mock
 * `__mocks__/@rnmapbox/maps.tsx` mà không cần tile, token hay máy thật.
 *
 * ⛔ Chỉ dựng khi `useMapSupport() === 'ready'` (có token + module native). Không có token Mapbox trả NỀN TRẮNG chứ không báo lỗi.
 * ⚠️ Không cluster: BE cắt ≤ 50 địa điểm/lượt và `MarkerView` chịu ~100 view, nên mỗi địa điểm một ghim là đủ.
 * ⚠️ KHÔNG kiểm được bằng Jest: tile, cử chỉ, vị trí ghim thật — chỉ kiểm được prop truyền xuống. Hiển thị thật = kiểm trên dev client.
 */
export function InteractiveMap({
  camera,
  pins,
  selectedId,
  userCoords,
  onPinPress,
  onIdle,
  onLoadError,
}: InteractiveMapProps) {
  const [Mapbox] = useState(ensureMapbox);
  const cameraRef = useRef<ComponentRef<MapboxModule['Camera']>>(null);
  // Tâm KHỞI ĐẦU chụp một lần (state chứ không phải ref: đọc ref lúc vẽ bị luật `react-hooks/refs` cấm).
  const [initial] = useState(camera);

  useEffect(() => {
    // Lệnh dời đầu tiên (rev 0) là tâm KHỞI ĐẦU đã đưa vào `defaultSettings` — chỉ bay khi có lệnh mới.
    if (camera.rev === initial.rev) return;
    cameraRef.current?.flyTo([camera.lng, camera.lat], FLY_MS);
  }, [camera, initial.rev]);

  if (!Mapbox) return null;
  const { MapView, Camera, MarkerView, StyleURL } = Mapbox;

  return (
    <View accessibilityLabel="Bản đồ địa điểm" className="flex-1 overflow-hidden rounded-md">
      <MapView
        attributionEnabled
        compassEnabled={false}
        logoEnabled
        pitchEnabled={false}
        rotateEnabled={false}
        scaleBarEnabled={false}
        style={styles.fill}
        styleURL={StyleURL.Street}
        onMapIdle={(state) => {
          const [lng, lat] = state.properties.center;
          if (lng !== undefined && lat !== undefined) onIdle({ lat, lng });
        }}
        onMapLoadingError={onLoadError}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: [initial.lng, initial.lat],
            zoomLevel: MAP_TUNING.zoomLevel,
          }}
        />
        {pins.map((pin) => (
          <MarkerView
            key={pin.id}
            allowOverlap
            anchor={{ x: 0.5, y: 0.5 }}
            coordinate={[pin.coordinate.lng, pin.coordinate.lat]}
          >
            <MapPin
              name={pin.name}
              selected={pin.id === selectedId}
              type={pin.type}
              onPress={() => onPinPress(pin.id)}
            />
          </MarkerView>
        ))}
        {userCoords ? (
          <MarkerView allowOverlap coordinate={[userCoords.lng, userCoords.lat]}>
            <View
              accessibilityLabel="Vị trí của bạn"
              accessible
              className="size-md rounded-full border-thick border-border-white bg-action-info"
            />
          </MarkerView>
        ) : null}
      </MapView>
    </View>
  );
}
