import { useCallback, useEffect, useRef, useState } from 'react';

import type { LatLng, LocationType, NearLocation } from '../api/o2o.types';
import { DEFAULT_CENTER, MAP_TUNING, O2O_LIMITS, RADIUS_STEPS_M } from '../constants/o2o.constants';
import { useNearbyLocations } from '../queries/locations.queries';
import { movedEnough, nextRadius } from '../utils/geo';
import { useUserLocation } from './useUserLocation';

/** Chuyến bay của camera dài ~600 ms + trễ debounce 500 ms của onIdle — 1,5 s phủ hết. */
const IDLE_IGNORE_AFTER_FLY_MS = 1500;

export interface MapFilters {
  type?: LocationType;
  amenities: string[];
  openNow: boolean;
}

/** Lệnh dời camera: đổi `rev` để dời lại cả khi trùng toạ độ cũ (người dùng đã kéo đi chỗ khác rồi bấm "Gần tôi" lại). */
export interface CameraTarget extends LatLng {
  rev: number;
}

/**
 * Trạng thái màn "Địa điểm" (app.md §3–4): bộ lọc, bán kính, tâm tìm kiếm, camera, địa điểm đang chọn, vị trí người dùng.
 *
 * Hai tâm KHÁC nhau có chủ ý: `queryCenter` (danh sách tải quanh đâu) và `camera` (bản đồ đang nhìn đâu, chỉ đổi khi CHƯƠNG TRÌNH ra lệnh). Kéo
 * tay không đổi `camera` — nếu đổi thì camera bị "kéo lại" đúng chỗ người dùng vừa thả tay. Kéo xong (`onIdle`) chỉ tải lại khi tâm mới lệch quá
 * 30 % bán kính, sau 500 ms (app.md §4) — nhích nhẹ mà tải lại là danh sách nhảy dưới tay người đang đọc.
 */
export function useLocationMap() {
  const [filters, setFilters] = useState<MapFilters>({ amenities: [], openNow: false });
  const [radiusM, setRadiusM] = useState<number>(O2O_LIMITS.radiusDefaultM);
  const [queryCenter, setQueryCenter] = useState<LatLng>(DEFAULT_CENTER);
  const [camera, setCamera] = useState<CameraTarget>({ ...DEFAULT_CENTER, rev: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loaded = useRef<LatLng>(DEFAULT_CENTER);
  const ignoreIdleUntil = useRef(0);

  const flyTo = useCallback((point: LatLng) => {
    // Camera đang bay do CHƯƠNG TRÌNH ra lệnh: sự kiện idle cuối chuyến bay không phải người dùng kéo — bỏ qua, kẻo chọn một ghim xa là danh sách bị tải lại quanh ghim đó.
    ignoreIdleUntil.current = Date.now() + IDLE_IGNORE_AFTER_FLY_MS;
    setCamera((prev) => ({ lat: point.lat, lng: point.lng, rev: prev.rev + 1 }));
  }, []);

  const recenter = useCallback(
    (point: LatLng) => {
      loaded.current = point;
      setQueryCenter(point);
      flyTo(point);
    },
    [flyTo],
  );

  const user = useUserLocation(recenter);
  const query = useNearbyLocations(queryCenter, {
    radiusM,
    type: filters.type,
    amenities: filters.amenities,
    openNow: filters.openNow || undefined,
  });

  /** Bản đồ vừa dừng ở `center` (người dùng kéo/phóng xong). */
  const onIdle = useCallback(
    (center: LatLng) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (Date.now() < ignoreIdleUntil.current) return;
        if (!movedEnough(loaded.current, center, radiusM)) return;
        loaded.current = center;
        setQueryCenter(center);
      }, MAP_TUNING.idleDebounceMs);
    },
    [radiusM],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const items: NearLocation[] = query.data ?? [];
  const selected = items.find((item) => item.id === selectedId) ?? null;

  return {
    filters,
    setFilters,
    radiusM,
    canExpand: nextRadius(radiusM, RADIUS_STEPS_M) !== null,
    expandRadius: () => {
      const next = nextRadius(radiusM, RADIUS_STEPS_M);
      if (next) setRadiusM(next);
    },
    camera,
    query,
    items,
    selected,
    userState: user.state,
    userCoords: user.state.status === 'granted' ? user.state.coords : null,
    locateMe: user.request,
    onIdle,
    /** Chọn một địa điểm: đánh dấu + dời camera tới đó (chạm ghim hoặc chạm dòng danh sách). */
    select: (item: NearLocation | null) => {
      setSelectedId(item ? item.id : null);
      if (item) flyTo(item);
    },
  };
}
