/**
 * Kiểu ĐỊA ĐIỂM (vận hành) — viết tay theo BE thật (`be/src/modules/o2o`): `services/admin-locations.service.ts` (`view` + `shop`/`photos`,
 * đánh giá cursor), `dtos/admin.dto.ts` (`adminLocationSchema`, `adminLocationUpdateSchema`, `adminLocationsQuerySchema`). Đổi contract ở BE
 * thì đối chiếu lại file này. Tiệm/đơn ở `o2o.types.ts`; kiểu lõi đơn dùng chung ở `print.types.ts`.
 */
import type { CursorMeta } from '@/shared/types/api.types';

import type { PrintShopStatus } from './print.types';

export type LocationType = 'CAFE' | 'PRINT_SHOP' | 'LIBRARY';
export type LocationStatus = 'ACTIVE' | 'HIDDEN';

/** Mã tiện ích BE cho phép (`LIMITS.o2o.amenities`). Dữ liệu cũ có thể chứa mã lạ nên nơi hiển thị luôn có đường lùi về chính mã. */
export type AmenityCode =
  | 'wifi_fast'
  | 'power_outlets'
  | 'quiet_zone'
  | 'ac'
  | 'open_late'
  | 'group_tables'
  | 'printer'
  | 'parking';

/** `day`: 0 = Chủ nhật … 6 = Thứ bảy; `open`/`close` "HH:mm" (giờ đóng có thể "24:00"), đóng phải SAU mở. */
export interface OpenHour {
  day: number;
  open: string;
  close: string;
}

export interface LocationShopBrief {
  id: string;
  displayName: string;
  status: PrintShopStatus;
}

export interface AdminLocation {
  id: string;
  name: string;
  type: LocationType;
  address: string;
  lat: number;
  lng: number;
  amenities: string[];
  ratingAvg: number;
  ratingCount: number;
  noiseAvg: number;
  openHours: OpenHour[];
  photoAssetIds: string[];
  status: LocationStatus;
  hiddenReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** Có ở danh sách + chi tiết; vắng ở kết quả tạo/sửa/ẩn (BE trả riêng). `null` = địa điểm chưa có tiệm. */
  shop?: LocationShopBrief | null;
}

export interface LocationPhoto {
  assetId: string;
  url: string | null;
  thumbUrl: string | null;
  expiresAt: string | null;
}

export interface AdminLocationDetail extends AdminLocation {
  photos: LocationPhoto[];
}

/** Đánh giá của người dùng (kể cả đã ẩn). BE có kèm `mine` (luôn `false` ở view vận hành) — màn này không dùng nên không khai. */
export interface AdminLocationReview {
  id: string;
  rating: number;
  noise: number;
  comment: string | null;
  author: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
  hiddenAt: string | null;
}

/** `GET …/reviews` phân trang CURSOR: `{ data, meta: { nextCursor, hasMore, limit } }` (khác `ApiResponse.meta` kiểu trang). */
export interface ReviewsPage {
  data: AdminLocationReview[];
  meta: CursorMeta;
}

/** `POST …/location-reviews/:id/hide|unhide` — `hiddenAt` mới của đánh giá. */
export interface ReviewHiddenResult {
  id: string;
  hiddenAt: string | null;
}

export interface AdminLocationsParams {
  page: number;
  limit: number;
  q?: string;
  type?: LocationType;
  status?: LocationStatus;
  amenity?: AmenityCode;
}

export interface LocationBody {
  name: string;
  address: string;
  lat: number;
  lng: number;
  type: LocationType;
  amenities: string[];
  openHours: OpenHour[];
  photoAssetIds: string[];
}

export interface UpdateLocationPayload extends Partial<LocationBody> {
  id: string;
  expectedVersion: number;
}

/** Đích của form địa điểm: `{ location: null }` = tạo mới, có địa điểm = sửa, `null` (ở nơi giữ state) = đóng. */
export interface LocationFormTarget {
  location: AdminLocation | null;
}
