import { useCallback, useEffect, useRef, useState } from 'react';

import type { LatLng } from '../api/o2o.types';
import { loadLocationModule, type LocationModule } from '../utils/native-modules';

/**
 * Trạng thái vị trí của người dùng:
 *  · `idle`        — chưa hỏi, chưa biết (mở màn lần đầu, quyền chưa cấp);
 *  · `locating`    — đang lấy toạ độ;
 *  · `granted`     — có toạ độ (`coords`);
 *  · `denied`      — từ chối quyền (`canAskAgain` false ⇒ chỉ còn cách vào Cài đặt hệ thống);
 *  · `unavailable` — không lấy được dù có quyền: GPS tắt, thiếu module native (bản cài chưa build lại) hoặc lỗi lạ.
 */
export type UserLocationState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'granted'; coords: LatLng }
  | { status: 'denied'; canAskAgain: boolean }
  | { status: 'unavailable'; reason: 'services-off' | 'no-module' | 'error' };

async function locate(Location: LocationModule): Promise<UserLocationState> {
  try {
    if (!(await Location.hasServicesEnabledAsync())) {
      return { status: 'unavailable', reason: 'services-off' };
    }
    // `Balanced` (~100 m) đủ cho "quán gần tôi" và tiết kiệm pin hơn `High`; tâm tìm kiếm còn bị làm tròn ~110 m ở khoá cache.
    const { coords } = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { status: 'granted', coords: { lat: coords.latitude, lng: coords.longitude } };
  } catch {
    return { status: 'unavailable', reason: 'error' };
  }
}

/**
 * Vị trí người dùng cho "Gần tôi" (app.md §7).
 *
 * ⛔ KHÔNG tự hiện hộp thoại xin quyền lúc mở màn: hộp thoại hệ thống chỉ xuất hiện khi màn gọi `request()` (sau khi giải thích lý do).
 * Mở màn chỉ ĐỌC quyền đã có (`getForegroundPermissionsAsync` không bao giờ hỏi) và nếu đã cấp từ trước thì lấy vị trí lặng lẽ.
 * Toạ độ nằm trong bộ nhớ của hook — không ghi đĩa, không gửi đi ngoài truy vấn `GET /locations/near` (README p6-05 §2).
 */
export function useUserLocation(onLocated?: (coords: LatLng) => void) {
  const [state, setState] = useState<UserLocationState>({ status: 'idle' });
  const alive = useRef(true);
  const locatedRef = useRef(onLocated);

  useEffect(() => {
    locatedRef.current = onLocated;
  });

  // `onLocated` chạy MỖI lần có toạ độ mới (kể cả lần đọc lặng lẽ lúc mở màn khi quyền đã cấp từ trước) — nơi gọi dời tâm bản đồ ở đó, không
  // cần effect quan sát `state` (effect + setState = một nhịp vẽ thừa với tâm cũ trước khi dời).
  const apply = useCallback((next: UserLocationState) => {
    if (!alive.current) return;
    setState(next);
    if (next.status === 'granted') locatedRef.current?.(next.coords);
  }, []);

  useEffect(() => {
    alive.current = true;
    const Location = loadLocationModule();
    if (!Location) {
      apply({ status: 'unavailable', reason: 'no-module' });
    } else {
      void Location.getForegroundPermissionsAsync()
        .then(async (permission) => {
          if (permission.granted) apply(await locate(Location));
        })
        .catch(() => undefined);
    }
    return () => {
      alive.current = false;
    };
  }, [apply]);

  /** Xin quyền (hiện hộp thoại hệ thống nếu còn được hỏi) rồi lấy vị trí. Trả toạ độ, hoặc `null` khi không có. */
  const request = useCallback(async (): Promise<LatLng | null> => {
    const Location = loadLocationModule();
    if (!Location) {
      apply({ status: 'unavailable', reason: 'no-module' });
      return null;
    }
    apply({ status: 'locating' });
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        apply({ status: 'denied', canAskAgain: permission.canAskAgain });
        return null;
      }
    } catch {
      apply({ status: 'unavailable', reason: 'error' });
      return null;
    }
    const next = await locate(Location);
    apply(next);
    return next.status === 'granted' ? next.coords : null;
  }, [apply]);

  return { state, request };
}
