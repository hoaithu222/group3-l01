/**
 * Kiểu DTO của backend In ấn O2O (p6-05) — ĐÃ đối chiếu với mã BE thật
 * (`be/src/modules/o2o/services/o2o.presenter.ts`, `locations.service.ts`, `print-orders.service.ts`,
 * `print-order-actions.service.ts`, `dtos/*.dto.ts`; `be.md` chỉ để tra nhanh, mã THẬT thắng tài liệu).
 *
 * ⚠️ Viết TAY (chưa có công cụ sinh kiểu OpenAPI). Ngày tháng là chuỗi ISO qua JSON, không phải `Date`.
 * ⛔ Lệch với BE là lỗi của phía app — đổi tên trường thì chỉ `*.service.ts` phải sửa, còn kiểu ở đây khớp BE.
 */

export const LOCATION_TYPES = ['CAFE', 'PRINT_SHOP', 'LIBRARY'] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

/** Khớp `LIMITS.o2o.amenities` của BE — mã lạ (BE thêm mới) vẫn hiện được bằng chính mã đó. */
export const AMENITY_CODES = [
  'wifi_fast',
  'power_outlets',
  'quiet_zone',
  'ac',
  'open_late',
  'group_tables',
  'printer',
  'parking',
] as const;
export type AmenityCode = (typeof AMENITY_CODES)[number];

export const PAPER_SIZES = ['A4', 'A3'] as const;
export type PaperSize = (typeof PAPER_SIZES)[number];

export const PRINT_ORDER_STATUSES = [
  'DRAFT',
  'QUOTED',
  'PENDING',
  'ACCEPTED',
  'PRINTING',
  'READY',
  'PICKED_UP',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
] as const;
export type PrintOrderStatus = (typeof PRINT_ORDER_STATUSES)[number];

/** Nhóm trạng thái của "Đơn của tôi" (`GET /print-orders?group=`). */
export type OrderGroup = 'ACTIVE' | 'DONE' | 'CLOSED';

export interface CursorMeta {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/** Khung giờ mở cửa — `day` 0 = Chủ nhật … 6 = Thứ bảy, `open`/`close` dạng `HH:mm` (giờ đóng có thể `24:00`). */
export interface OpenHour {
  day: number;
  open: string;
  close: string;
}

/** Tiệm in gắn với địa điểm ở `GET /locations/near` — chỉ vài trường, chi tiết ở `/print-shops/:id`. */
export interface NearShop {
  id: string;
  displayName: string;
  acceptingOrders: boolean;
}

/** `GET /locations/near` (≤ 50, theo khoảng cách). `openNow: null` = địa điểm chưa khai giờ mở cửa. */
export interface NearLocation extends LatLng {
  id: string;
  name: string;
  type: LocationType;
  address: string;
  amenities: string[];
  ratingAvg: number;
  ratingCount: number;
  /** 1 = yên tĩnh … 5 = rất ồn; 0 = chưa có đánh giá. */
  noiseAvg: number;
  distanceM: number;
  openNow: boolean | null;
  shop: NearShop | null;
}

export interface NearQuery extends LatLng {
  radiusM: number;
  type?: LocationType;
  amenities?: string[];
  openNow?: boolean;
}

export interface LocationPhoto {
  assetId: string;
  /** `null` khi URL ký không cấp được (tệp lỗi) — bỏ ảnh đó khỏi băng chuyền. */
  url: string | null;
  thumbUrl: string | null;
  expiresAt: string | null;
}

export interface ReviewView {
  id: string;
  rating: number;
  noise: number;
  comment: string | null;
  author: { id: string; name: string };
  mine: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PrintPriceTable {
  a4Bw: number;
  a4Color: number;
  a3Bw: number;
  a3Color: number;
  duplexDiscountPct: number;
  minOrder: number;
}

export interface PrintCapabilities {
  color: boolean;
  duplex: boolean;
  a3: boolean;
  binding: boolean;
}

/** Tiệm in công khai (`GET /print-shops/:id`, và khối `shop` của chi tiết địa điểm). `location` chỉ có ở `/print-shops/:id`. */
export interface PrintShopView {
  id: string;
  locationId: string;
  displayName: string;
  phone: string | null;
  priceTable: PrintPriceTable;
  capabilities: PrintCapabilities;
  acceptingOrders: boolean;
  priceTableVersion: number;
  location?: { name: string; address: string } & LatLng;
}

export interface LocationDetail extends Omit<NearLocation, 'distanceM' | 'shop'> {
  openHours: OpenHour[];
  photos: LocationPhoto[];
  recentReviews: ReviewView[];
  myReview: ReviewView | null;
  shop: PrintShopView | null;
}

export interface ReviewPayload {
  rating: number;
  noise: number;
  comment?: string;
}

/** `PUT /locations/:id/reviews/me` — kèm số liệu mới của địa điểm để cập nhật sao/độ ồn tại chỗ. */
export interface ReviewSaved {
  review: ReviewView;
  location: { id: string; ratingAvg: number; ratingCount: number; noiseAvg: number };
}

export interface PrintSettings {
  paper: PaperSize;
  color: boolean;
  copies: number;
  duplex: boolean;
  pageRange: string | null;
  binding: boolean;
}

export interface PrintQuote {
  printablePages: number;
  /** Số tờ MỘT bản (2 mặt → ceil(trang/2)) — chỉ để hiển thị. */
  sheets: number;
  unitPrice: number;
  subtotal: number;
  duplexDiscount: number;
  total: number;
  priceTableVersion: number;
  quotedAt: string;
}

export interface OrderEvent {
  status: string;
  at: string;
  note: string | null;
}

export interface ShopBrief {
  id: string;
  displayName: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

/** `myActions` do SERVER tính từ máy trạng thái — app chỉ vẽ nút, ⛔ không tự suy "huỷ được khi nào". */
export interface OrderActions {
  canEdit: boolean;
  canSubmit: boolean;
  canCancel: boolean;
  canRegeneratePin: boolean;
}

/** Đơn in phía CHỦ ĐƠN (`customerOrderView`) — không bao giờ có PIN (PIN chỉ trả lúc `submit`/`pin/reveal`). */
export interface PrintOrderView {
  id: string;
  code: string;
  status: PrintOrderStatus;
  shopId: string;
  fileName: string;
  /** `null` = chưa đếm xong trang (job `print.count-pages` đang chạy) hoặc tệp lỗi (xem `pageCountError`). */
  pages: number | null;
  /** `O2O_003` (tệp không đọc được) / `O2O_011` (quá số trang) / `O2O_002` / `O2O_012`; `null` = ổn. */
  pageCountError: string | null;
  settings: PrintSettings;
  quote: PrintQuote | null;
  payment: {
    method: 'AT_COUNTER' | 'VIETQR';
    status: 'UNPAID' | 'PAID';
    confirmedAt: string | null;
  };
  events: OrderEvent[];
  rejectReason: string | null;
  cancelReason: string | null;
  pickupBy: string | null;
  submittedAt: string | null;
  readyAt: string | null;
  pickedUpAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  source: { kind: 'RESOURCE' | 'UPLOAD'; resourceId: string | null };
  shop: ShopBrief | null;
  hasPin: boolean;
  myActions: OrderActions;
}

export type PrintSource =
  { kind: 'RESOURCE'; resourceId: string } | { kind: 'UPLOAD'; assetId: string };

export interface CreateOrderPayload {
  shopId: string;
  source: PrintSource;
  settings?: PrintSettings;
  pickupBy?: string | null;
}

export interface UpdateOrderPayload {
  settings: PrintSettings;
  pickupBy?: string | null;
  /** Khoá lạc quan: khác phiên bản server ⇒ `RES_003` (409). */
  expectedVersion: number;
}

/** `submit` / `pin/reveal` — PIN 6 số chỉ trả DUY NHẤT lượt này. */
export interface OrderWithPin {
  order: PrintOrderView;
  pin: string;
}

export interface OrdersPage {
  items: PrintOrderView[];
  meta: CursorMeta;
}

export interface ReviewsPage {
  items: ReviewView[];
  meta: CursorMeta;
}

/**
 * Payload socket `print-order:updated` (`be/.../jobs/o2o.jobs.ts` — mã THẬT thắng `be.md`: KHÔNG có `v`, KHÔNG có `updatedAt` dạng
 * `Date`, KHÔNG PIN). Chỉ mang vài trường: phần còn lại (báo giá, dòng thời gian) app lấy lại bằng `GET /print-orders/:id`.
 * `pageCountError` chỉ có khi tin đến từ job đếm trang.
 */
export interface PrintOrderUpdatedPayload {
  id: string;
  code: string;
  status: PrintOrderStatus;
  version: number;
  pages: number | null;
  total: number | null;
  updatedAt: string;
  pageCountError?: string | null;
}
