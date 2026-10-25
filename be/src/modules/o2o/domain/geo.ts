/** Hình học tối thiểu cho repo in-memory/test (Mongo thật dùng `$geoNear` + index `2dsphere`). */
const EARTH_RADIUS_M = 6_378_100; // bán kính Mongo dùng cho `$geoNear` spherical (mét)

const rad = (deg: number): number => (deg * Math.PI) / 180;

/** Khoảng cách mặt cầu (haversine) giữa hai điểm, mét. */
export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Điểm cách `origin` khoảng `meters` về hướng bắc (dựng dữ liệu test theo khoảng cách). */
export function offsetNorth(origin: { lat: number; lng: number }, meters: number): { lat: number; lng: number } {
  return { lat: origin.lat + (meters / EARTH_RADIUS_M) * (180 / Math.PI), lng: origin.lng };
}
