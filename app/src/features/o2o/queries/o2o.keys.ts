import type { LatLng, OrderGroup, PrintSettings, LocationType } from '../api/o2o.types';
import { roundLatLng } from '../utils/geo';

/** Bộ lọc của danh sách "Gần tôi" — MỌI thứ ảnh hưởng kết quả đều nằm trong khoá (thiếu một cái là đổi lọc mà danh sách đứng yên). */
export interface NearFilters {
  radiusM: number;
  type?: LocationType;
  amenities?: string[];
  openNow?: boolean;
}

/**
 * Khoá React Query của feature (app.md §4). Tâm bản đồ được LÀM TRÒN 3 chữ số (~110 m) ngay trong khoá: kéo bản đồ vài mét không tạo
 * một truy vấn mới, và khoá không mang toạ độ người dùng ở độ chính xác cao.
 */
export const o2oKeys = {
  all: ['o2o'] as const,
  nearAll: () => ['o2o', 'near'] as const,
  near: (center: LatLng, filters: NearFilters) =>
    [
      'o2o',
      'near',
      roundLatLng(center),
      { ...filters, amenities: [...(filters.amenities ?? [])].sort() },
    ] as const,
  location: (locationId: string) => ['o2o', 'location', locationId] as const,
  reviews: (locationId: string) => ['o2o', 'location', locationId, 'reviews'] as const,
  shop: (shopId: string) => ['o2o', 'shop', shopId] as const,
  quote: (shopId: string, pages: number, settings: PrintSettings) =>
    ['o2o', 'quote', shopId, pages, settings] as const,
  order: (orderId: string) => ['o2o', 'order', orderId] as const,
  ordersAll: () => ['o2o', 'orders'] as const,
  orders: (group: OrderGroup) => ['o2o', 'orders', group] as const,
};
