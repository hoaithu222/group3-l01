import { formatNumber } from '@/shared/utils/format';

import { AMENITY_LABELS, WEEKDAY_LABELS } from '../constants/o2o.constants';
import type { AmenityCode, LocationShopBrief, OpenHour } from '../types/o2o.types';

/** Mã tiện ích → nhãn; mã lạ (BE thêm mới) hiện chính mã thay vì trống. */
export const amenityLabel = (code: string): string => AMENITY_LABELS[code as AmenityCode] ?? code;

/** Thứ tự hiển thị trong tuần: Thứ hai → Chủ nhật (BE dùng 0 = Chủ nhật). */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Giờ mở cửa theo ngày ("Thứ hai: 07:00–22:00"), nhiều khung trong ngày gộp một dòng. Chưa khai giờ → mảng rỗng. */
export function formatOpenHours(hours: readonly OpenHour[]): string[] {
  return DAY_ORDER.flatMap((day) => {
    const slots = hours
      .filter((h) => h.day === day)
      .sort((a, b) => a.open.localeCompare(b.open))
      .map((h) => `${h.open}–${h.close}`);
    return slots.length > 0 ? [`${WEEKDAY_LABELS[day]}: ${slots.join(', ')}`] : [];
  });
}

/** "4,5 ★ (12)" hoặc "Chưa có đánh giá"; độ ồn "2,1/5". */
export function formatRating(loc: { ratingAvg: number; ratingCount: number }): string {
  return loc.ratingCount > 0
    ? `${formatNumber(loc.ratingAvg, 1)} ★ (${formatNumber(loc.ratingCount)})`
    : 'Chưa có đánh giá';
}

export const formatNoise = (loc: { noiseAvg: number; ratingCount: number }): string =>
  loc.ratingCount > 0 ? `${formatNumber(loc.noiseAvg, 1)}/5` : '—';

/** Tiệm gắn với địa điểm: không có / chờ duyệt / đã duyệt / tạm ngưng — cột "Tiệm in" của bảng địa điểm. */
export function shopChip(shop: LocationShopBrief | null | undefined): string {
  if (!shop) return 'Không';
  if (shop.status === 'PENDING') return 'Chờ duyệt';
  if (shop.status === 'SUSPENDED') return 'Tạm ngưng';
  return 'Có';
}

/**
 * Liên kết OpenStreetMap tới đúng toạ độ — thay tạm cho bản đồ nhúng (chưa có `mapbox-gl`, xem `CoordinateFields`).
 * Toạ độ là số do BE trả nên ghép chuỗi an toàn, không cần mã hoá.
 */
export const mapLinkOf = (lat: number, lng: number): string =>
  `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
