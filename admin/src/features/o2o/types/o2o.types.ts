/**
 * Kiểu vận hành O2O — TIỆM IN và ĐƠN IN (viết tay theo BE thật, `be/src/modules/o2o`): tiệm ở `services/admin-shops.service.ts` (`views`) +
 * `services/o2o.presenter.ts` (`shopPublicView`); đơn ở `services/o2o.presenter.ts` (`adminOrderView`) + `services/order-views.ts`. Đổi contract ở BE
 * thì đối chiếu lại file này. Địa điểm ở `location.types.ts` (re-export bên dưới để nơi dùng chỉ import một chỗ); lõi đơn dùng chung ở `print.types.ts`.
 */
import type {
  PrintCapabilities,
  PrintOrderCore,
  PrintOrderStatus,
  PrintPaymentStatus,
  PrintPriceTable,
  PrintShopStatus,
} from './print.types';

export type * from './location.types';
export type { PrintShopStatus } from './print.types';

export interface AdminShop {
  id: string;
  locationId: string;
  displayName: string;
  phone: string | null;
  priceTable: PrintPriceTable;
  capabilities: PrintCapabilities;
  acceptingOrders: boolean;
  priceTableVersion: number;
  location?: { name: string; address: string; lat: number; lng: number };
  status: PrintShopStatus;
  approvedAt: string | null;
  suspendedReason: string | null;
  /** `email` chỉ có khi người xem có `user:view`. */
  owner: { id: string; name: string; email?: string };
  orders30d: number;
  version: number;
  createdAt: string;
}

/** `GET /admin/print-shops/:id` — kèm số đơn PENDING (xác nhận tạm ngưng nêu số đơn bị ảnh hưởng). */
export interface AdminShopDetail extends AdminShop {
  pendingOrders: number;
}

/** `POST …/suspend` — số đơn PENDING đã tự chuyển REJECTED "Tiệm tạm ngưng". */
export interface AdminShopSuspendResult extends AdminShop {
  rejectedOrders: number;
}

export interface PrintShopBrief {
  id: string;
  displayName: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

export interface AdminOrder extends PrintOrderCore {
  customer: { id: string; name: string };
  shop: PrintShopBrief | null;
  adminActions: { canCancel: boolean };
}

export interface AdminShopsParams {
  page: number;
  limit: number;
  q?: string;
  status?: PrintShopStatus;
}

export interface AdminOrdersParams {
  page: number;
  limit: number;
  shopId?: string;
  status?: PrintOrderStatus;
  paymentStatus?: PrintPaymentStatus;
  /** Mốc ISO đầu/cuối ngày (BE lọc theo NGÀY TẠO đơn). */
  from?: string;
  to?: string;
  /** Mã đơn — BE khớp CHÍNH XÁC (tự viết hoa), tối đa 20 ký tự. */
  q?: string;
}

export interface CreateShopPayload {
  locationId: string;
  ownerEmail: string;
  displayName: string;
  phone: string | null;
  priceTable: PrintPriceTable;
  capabilities: PrintCapabilities;
}

export interface UpdateShopPayload {
  id: string;
  expectedVersion: number;
  displayName?: string;
  phone?: string | null;
  priceTable?: PrintPriceTable;
  capabilities?: PrintCapabilities;
  acceptingOrders?: boolean;
  /** 3–500 ký tự, vào nhật ký quản trị. */
  reason?: string;
}

/** Hành động có lý do (≥ 10 ký tự): ẩn/hiện địa điểm & đánh giá, duyệt/tạm ngưng tiệm, huỷ đơn. */
export interface ReasonPayload {
  id: string;
  reason: string;
}
