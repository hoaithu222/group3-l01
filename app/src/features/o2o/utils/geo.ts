import { Platform } from 'react-native';

import type { LatLng } from '../api/o2o.types';
import { MAP_TUNING, O2O_LIMITS } from '../constants/o2o.constants';

const EARTH_RADIUS_M = 6_371_000;
const toRad = (degrees: number) => (degrees * Math.PI) / 180;

/** Làm tròn toạ độ (mặc định 3 chữ số ≈ 110 m) — khoá cache không đổi mỗi khi bản đồ nhích vài mét, và toạ độ người dùng không lọt vào key quá chính xác. */
export function roundCoord(value: number, decimals: number = MAP_TUNING.coordDecimals): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function roundLatLng(point: LatLng): LatLng {
  return { lat: roundCoord(point.lat), lng: roundCoord(point.lng) };
}

/** Khoảng cách đường chim bay (m) — haversine; đủ chính xác cho ngưỡng "tâm lệch" (không dùng để hiển thị: khoảng cách hiển thị do BE tính). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Bản đồ vừa dừng ở `next` — có nên tải lại danh sách quanh tâm mới không? Chỉ khi tâm lệch quá 30 % bán kính so với tâm ĐÃ TẢI
 * (app.md §4). Nhích nhẹ mà tải lại là danh sách nhảy liên tục dưới tay người dùng đang đọc.
 */
export function movedEnough(loaded: LatLng, next: LatLng, radiusM: number): boolean {
  return distanceMeters(loaded, next) > radiusM * MAP_TUNING.recenterRatio;
}

/** "350 m" · "1,2 km" — dấu PHẨY thập phân (quy ước VN, `screen-layout.md`); dưới 1 km làm tròn tới 10 m cho khỏi nhảy số. */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '';
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

/** "2 km" · "10 km" cho chip bán kính. */
export function formatRadius(radiusM: number): string {
  return `${radiusM / 1000} km`;
}

/** Bậc bán kính kế tiếp ("Mở rộng bán kính"); `null` khi đã ở mức tối đa BE cho phép. */
export function nextRadius(radiusM: number, steps: readonly number[]): number | null {
  return steps.find((step) => step > radiusM && step <= O2O_LIMITS.radiusMaxM) ?? null;
}

/**
 * URL mở ứng dụng bản đồ chỉ đường tới `target`. iOS → Apple Maps; nơi khác → liên kết Google Maps (Android mở thẳng app Google Maps
 * nếu có, không thì trình duyệt) — cùng một liên kết https nên không phụ thuộc app bản đồ nào đã cài (`Linking.canOpenURL` không đáng tin
 * trên Android 11+ khi chưa khai `queries`).
 */
export function directionsUrl(target: LatLng): string {
  const coords = `${target.lat},${target.lng}`;
  if (Platform.OS === 'ios') return `https://maps.apple.com/?daddr=${coords}&dirflg=d`;
  return `https://www.google.com/maps/dir/?api=1&destination=${coords}`;
}
