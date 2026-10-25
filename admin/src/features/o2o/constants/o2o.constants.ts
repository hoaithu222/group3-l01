import type {
  AmenityCode,
  LocationStatus,
  LocationType,
  PrintShopStatus,
} from '../types/o2o.types';
import { PRINT_ORDER_STATUS_META, PRINT_PAYMENT_META } from './print.constants';
import type { StatusMeta } from './print.constants';

/** Ô lọc "tất cả" — Radix Select không nhận giá trị rỗng. */
export const ALL_FILTER = 'all';

/** BE (`paginationSchema`) mặc định 20, tối đa 100. */
export const O2O_PAGE_SIZE = 20;

/** Ô chọn tiệm ở tab Đơn in lấy tối đa ngần này tiệm (trần `limit` của BE). */
const SHOP_OPTIONS_LIMIT = 100;

/** Giới hạn khớp `dtos/admin.dto.ts` của BE — form kiểm trước để không chờ 400. */
export const O2O_LIMITS = {
  nameMin: 2,
  nameMax: 120,
  addressMin: 3,
  addressMax: 300,
  openHoursMax: 14,
  /** Ảnh địa điểm tối đa (`LIMITS.o2o.photosMax` BE), scope asset `LOCATION`. */
  photosMax: 8,
  priceMax: 1_000_000,
  minOrderMax: 10_000_000,
  /** Lý do sửa tiệm (`adminShopUpdateSchema.reason`). */
  shopReasonMin: 3,
  shopReasonMax: 500,
  /** Mã đơn ≤ 20 ký tự (`adminOrdersQuerySchema.q`). */
  orderCodeMax: 20,
} as const;

export const LOCATION_TYPE_META: Record<LocationType, StatusMeta> = {
  CAFE: { label: 'Quán cà phê', color: 'info' },
  PRINT_SHOP: { label: 'Tiệm in', color: 'indigo' },
  LIBRARY: { label: 'Thư viện', color: 'success' },
};

export const LOCATION_TYPES = Object.keys(LOCATION_TYPE_META) as LocationType[];

export const LOCATION_STATUS_META: Record<LocationStatus, StatusMeta> = {
  ACTIVE: { label: 'Đang hiển thị', color: 'success' },
  HIDDEN: { label: 'Đã ẩn', color: 'neutral' },
};

export const LOCATION_STATUSES = Object.keys(LOCATION_STATUS_META) as LocationStatus[];

export const SHOP_STATUS_META: Record<PrintShopStatus, StatusMeta> = {
  PENDING: { label: 'Chờ duyệt', color: 'warning' },
  APPROVED: { label: 'Đã duyệt', color: 'success' },
  SUSPENDED: { label: 'Tạm ngưng', color: 'error' },
};

export const SHOP_STATUSES = Object.keys(SHOP_STATUS_META) as PrintShopStatus[];

/** Thứ tự = thứ tự BE (`LIMITS.o2o.amenities`). Mã lạ hiện chính mã (`amenityLabel`). */
export const AMENITY_LABELS: Record<AmenityCode, string> = {
  wifi_fast: 'Wi-Fi nhanh',
  power_outlets: 'Ổ cắm điện',
  quiet_zone: 'Khu yên tĩnh',
  ac: 'Điều hoà',
  open_late: 'Mở khuya',
  group_tables: 'Bàn làm việc nhóm',
  printer: 'Có máy in',
  parking: 'Chỗ gửi xe',
};

export const AMENITY_CODES = Object.keys(AMENITY_LABELS) as AmenityCode[];

/** Khớp `LIMITS.upload.scopeRestrict.LOCATION` BE — JPEG/PNG/WebP, không SVG/GIF/HEIC. */
export const LOCATION_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';

export const AMENITY_OPTIONS = AMENITY_CODES.map((value) => ({
  value,
  label: AMENITY_LABELS[value],
}));

/** `OpenHour.day`: 0 = Chủ nhật … 6 = Thứ bảy (khớp BE). Hiện Thứ hai đầu tuần ở form (`WEEKDAY_ORDER`). */
export const WEEKDAY_LABELS = [
  'Chủ nhật',
  'Thứ hai',
  'Thứ ba',
  'Thứ tư',
  'Thứ năm',
  'Thứ sáu',
  'Thứ bảy',
] as const;

export const WEEKDAY_OPTIONS = [1, 2, 3, 4, 5, 6, 0].map((day) => ({
  value: String(day),
  label: WEEKDAY_LABELS[day],
}));

/** Dạng "HH:mm" hợp lệ (giờ đóng có thể "24:00") — khớp `TIME_PATTERN` của BE (`domain/open-hours.ts`). */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;

/** Khung giờ mới thêm ở form địa điểm: Thứ hai 07:00–22:00 — điểm xuất phát thường gặp, người dùng sửa được. */
export const NEW_OPEN_HOUR = { day: '1', open: '07:00', close: '22:00' } as const;

/** Ô lọc: "Mọi …" đứng đầu rồi tới từng giá trị (Radix Select không nhận giá trị rỗng nên dùng `ALL_FILTER`). */
const withAll = (allLabel: string, options: ReadonlyArray<{ value: string; label: string }>) => [
  { value: ALL_FILTER, label: allLabel },
  ...options,
];

const metaOptions = (meta: Record<string, StatusMeta>) =>
  Object.entries(meta).map(([value, m]) => ({ value, label: m.label }));

export const LOCATION_TYPE_FILTER_OPTIONS = withAll('Mọi loại', metaOptions(LOCATION_TYPE_META));
export const LOCATION_STATUS_FILTER_OPTIONS = withAll(
  'Mọi trạng thái',
  metaOptions(LOCATION_STATUS_META),
);
export const AMENITY_FILTER_OPTIONS = withAll('Mọi tiện ích', AMENITY_OPTIONS);
export const SHOP_STATUS_FILTER_OPTIONS = withAll('Mọi trạng thái', metaOptions(SHOP_STATUS_META));

/** Ô chọn loại ở form địa điểm (không có "Mọi loại"). */
export const LOCATION_TYPE_OPTIONS = metaOptions(LOCATION_TYPE_META);

/** Truy vấn địa điểm cho ô chọn ở form tạo tiệm: loại "Tiệm in" (lọc tiếp địa điểm chưa có tiệm ở phía client). */
export const SHOP_LOCATION_QUERY = {
  page: 1,
  limit: SHOP_OPTIONS_LIMIT,
  type: 'PRINT_SHOP',
} as const;

/** Số đơn gần đây hiện ở ngăn kéo tiệm (tab "Đơn gần đây"). */
export const RECENT_ORDERS_LIMIT = 10;

export const ORDER_STATUS_FILTER_OPTIONS = withAll(
  'Mọi trạng thái',
  metaOptions(PRINT_ORDER_STATUS_META),
);
export const PAYMENT_FILTER_OPTIONS = withAll('Mọi thanh toán', metaOptions(PRINT_PAYMENT_META));

/** Truy vấn tiệm cho ô lọc "Tiệm" ở tab Đơn in (tối đa `limit` của BE). */
export const ORDER_SHOP_OPTIONS_QUERY = { page: 1, limit: SHOP_OPTIONS_LIMIT } as const;

/** Tab (`:tab` của deep link `/o2o/:tab/:id`) → khoá URL của ngăn kéo chi tiết trên tab đó. */
export const O2O_DETAIL_PARAM: Readonly<Record<string, string>> = {
  locations: 'locationId',
  shops: 'shopId',
  orders: 'orderId',
};

/**
 * Khoá URL bị XOÁ khi đổi tab của `O2oPage`: các tab dùng chung `page`, `q`, `status`… và cùng một ngăn kéo nên bộ lọc của tab cũ
 * không được rò sang tab mới (`status=HIDDEN` của địa điểm vô nghĩa ở tab đơn in).
 */
export const O2O_TAB_RESET_PARAMS = [
  'page',
  'q',
  'type',
  'status',
  'amenity',
  'paymentStatus',
  'shop',
  'from',
  'to',
  'locationId',
  'shopId',
  'orderId',
] as const;
