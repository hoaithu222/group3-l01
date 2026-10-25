/**
 * Kiểu cổng chủ tiệm in — viết tay theo BE thật (`be/src/modules/o2o`): `services/o2o.presenter.ts` (`partnerOrderView`),
 * `services/print-shops.service.ts` (`myShops`), `services/partner-orders.service.ts` (`file`), `dtos/partner.dto.ts`. Lõi đơn
 * (cấu hình in, báo giá, dòng thời gian…) dùng chung với vận hành nên import từ `@/features/o2o`. Ngày giờ là chuỗi ISO.
 */
import type { CursorMeta } from '@/shared/types/api.types';

import type {
  PrintCapabilities,
  PrintOrderCore,
  PrintPriceTable,
  PrintShopStatus,
} from '@/features/o2o';

/** Hành động chủ tiệm được phép — server tính (`canPerform`), giao diện CHỈ vẽ nút theo cờ này, không tự suy từ `status`. */
export interface PartnerOrderActions {
  canAccept: boolean;
  canReject: boolean;
  canStartPrinting: boolean;
  canMarkReady: boolean;
  canPickup: boolean;
  /** Đã tính sẵn "chưa thu tiền" (BE: `MARK_PAID` hợp lệ VÀ `payment.status !== 'PAID'`). */
  canMarkPaid: boolean;
  /** Chỉ ACCEPTED/PRINTING (`O2O_006` khi gọi ngoài hai trạng thái này). */
  canDownload: boolean;
}

/** Đơn nhìn từ chủ tiệm: KHÔNG PIN, KHÔNG URL tệp (lấy riêng qua `GET …/file`), khách chỉ có TÊN. */
export interface PartnerOrder extends PrintOrderCore {
  customer: { name: string };
  partnerActions: PartnerOrderActions;
}

/** `GET /partner/orders` — phân trang CURSOR `{ data, meta: { nextCursor, hasMore, limit } }`. */
export interface PartnerOrdersPage {
  data: PartnerOrder[];
  meta: CursorMeta;
}

/** `GET /partner/shops/me` — mọi tiệm tôi sở hữu, kể cả chờ duyệt/tạm ngưng (màn "Tài khoản" hiện trạng thái). */
export interface PartnerShop {
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
  suspendedReason: string | null;
  approvedAt: string | null;
}

/** `GET /partner/orders/:id/file` — URL ký (hết hạn rất ngắn) + tên tệp gốc. */
export interface PartnerFileUrl {
  url: string;
  expiresAt: string;
  fileName: string;
}

export type PartnerOrderStep = 'accept' | 'printing' | 'ready';

export interface PartnerRejectPayload {
  id: string;
  /** 3–200 ký tự (`LIMITS.o2o.rejectReason*`). */
  reason: string;
}

export interface PartnerPickupPayload {
  id: string;
  /** 6 chữ số. */
  pin: string;
  /** Đã thu tiền tại quầy (D-11 bước 1) — BE mặc định `true`. */
  markPaid: boolean;
}

export interface PartnerAcceptingPayload {
  id: string;
  acceptingOrders: boolean;
}

/**
 * Tải sự kiện socket `partner:order` (S→C `user:{shopOwnerId}`, chỉ khi khách vừa GỬI đơn) — `be/src/modules/o2o/jobs/o2o.jobs.ts`, BE bọc thêm
 * `{ v, serverNow }` (`stampPayload`). KHÔNG có PIN, tên tệp hay tên khách.
 */
export interface PartnerOrderEvent {
  v: number;
  serverNow: string;
  shopId: string;
  orderId: string;
  code: string;
  status: string;
  pages: number | null;
  total: number | null;
  submittedAt: string | null;
}
