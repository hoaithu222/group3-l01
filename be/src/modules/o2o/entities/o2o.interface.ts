/** Thực thể miền của module `o2o` (p6-05 be.md §2) — tách khỏi kiểu Prisma để service/test không phụ thuộc client. */

export const LOCATION_TYPES = ["CAFE", "PRINT_SHOP", "LIBRARY"] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

export const LOCATION_STATUSES = ["ACTIVE", "HIDDEN"] as const;
export type LocationStatus = (typeof LOCATION_STATUSES)[number];

export interface OpenHour {
  /** 0 = Chủ nhật … 6 = Thứ bảy. */
  day: number;
  open: string;
  close: string;
}

export interface GeoPoint {
  type: "Point";
  /** [lng, lat] */
  coordinates: [number, number];
}

export interface Location {
  id: string;
  name: string;
  normalizedName: string;
  address: string;
  geo: GeoPoint;
  type: LocationType;
  amenities: string[];
  openHours: OpenHour[];
  photoAssetIds: string[];
  ratingAvg: number;
  ratingCount: number;
  noiseAvg: number;
  status: LocationStatus;
  hiddenReason: string | null;
  createdBy: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Kết quả truy vấn gần (`$geoNear`) — `distanceM` tính bởi Mongo. */
export interface NearLocation extends Location {
  distanceM: number;
}

export interface LocationReview {
  id: string;
  locationId: string;
  userId: string;
  rating: number;
  noise: number;
  comment: string | null;
  hiddenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const PRINT_SHOP_STATUSES = ["PENDING", "APPROVED", "SUSPENDED"] as const;
export type PrintShopStatus = (typeof PRINT_SHOP_STATUSES)[number];

/** Đồng/trang, số nguyên. */
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

export interface PrintShop {
  id: string;
  locationId: string;
  ownerUserId: string;
  displayName: string;
  phone: string | null;
  priceTable: PrintPriceTable;
  capabilities: PrintCapabilities;
  status: PrintShopStatus;
  approvedBy: string | null;
  approvedAt: Date | null;
  suspendedReason: string | null;
  acceptingOrders: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export const PRINT_ORDER_STATUSES = [
  "DRAFT",
  "QUOTED",
  "PENDING",
  "ACCEPTED",
  "PRINTING",
  "READY",
  "PICKED_UP",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
] as const;
export type PrintOrderStatus = (typeof PRINT_ORDER_STATUSES)[number];

export const PAPER_SIZES = ["A4", "A3"] as const;
export type PaperSize = (typeof PAPER_SIZES)[number];

export interface PrintSettings {
  paper: PaperSize;
  color: boolean;
  copies: number;
  duplex: boolean;
  pageRange: string | null;
  binding: boolean;
}

export interface PrintSource {
  kind: "RESOURCE" | "UPLOAD";
  resourceId: string | null;
  assetId: string;
}

export interface PrintQuote {
  printablePages: number;
  sheets: number;
  unitPrice: number;
  subtotal: number;
  duplexDiscount: number;
  total: number;
  priceTableVersion: number;
  quotedAt: Date;
}

export interface PrintPayment {
  method: "AT_COUNTER" | "VIETQR";
  status: "UNPAID" | "PAID";
  confirmedBy: string | null;
  confirmedAt: Date | null;
}

export interface PrintOrderEvent {
  status: string;
  at: Date;
  by: string | null;
  note: string | null;
}

export interface PrintOrder {
  id: string;
  code: string;
  userId: string;
  shopId: string;
  shopOwnerId: string;
  workspaceId: string | null;
  source: PrintSource;
  fileAssetId: string;
  fileName: string;
  pages: number | null;
  pageCountError: string | null;
  settings: PrintSettings;
  quote: PrintQuote | null;
  pinHash: string | null;
  status: PrintOrderStatus;
  payment: PrintPayment;
  events: PrintOrderEvent[];
  rejectReason: string | null;
  cancelReason: string | null;
  pickupBy: Date | null;
  submittedAt: Date | null;
  readyAt: Date | null;
  pickedUpAt: Date | null;
  fileAccessUntil: Date | null;
  expiringNotifiedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export const TERMINAL_ORDER_STATUSES: readonly PrintOrderStatus[] = ["PICKED_UP", "REJECTED", "CANCELLED", "EXPIRED"];
export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  paper: "A4",
  color: false,
  copies: 1,
  duplex: false,
  pageRange: null,
  binding: false,
};
