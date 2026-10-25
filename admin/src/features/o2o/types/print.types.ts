/**
 * Kiểu DÙNG CHUNG của đơn in — viết tay theo BE thật (`be/src/modules/o2o`: `entities/o2o.interface.ts`,
 * `services/o2o.presenter.ts` `orderCore`/`shopBrief`). Cả `o2o` (vận hành, `/admin/print-*`) lẫn `partner` (chủ tiệm,
 * `/partner/*`) đọc CÙNG lõi đơn nên kiểu này nằm ở `o2o` và `partner` import qua `@/features/o2o` — không chép hai bản.
 * Ngày giờ là chuỗi ISO (JSON); tiền là SỐ NGUYÊN đồng.
 */

export type PrintOrderStatus =
  | 'DRAFT'
  | 'QUOTED'
  | 'PENDING'
  | 'ACCEPTED'
  | 'PRINTING'
  | 'READY'
  | 'PICKED_UP'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED';

/** Trạng thái duyệt của tiệm — dùng ở cả vận hành (bảng tiệm, chip địa điểm) lẫn cổng chủ tiệm (banner, tài khoản). */
export type PrintShopStatus = 'PENDING' | 'APPROVED' | 'SUSPENDED';

export type PrintPaymentStatus = 'UNPAID' | 'PAID';
export type PrintPaymentMethod = 'AT_COUNTER' | 'VIETQR';
export type PaperSize = 'A4' | 'A3';

/** Đồng/trang (số nguyên) + % giảm 2 mặt + đơn tối thiểu. */
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

export interface PrintSettings {
  paper: PaperSize;
  color: boolean;
  copies: number;
  duplex: boolean;
  /** Đã chuẩn hoá ("1-3,5"); `null` = in hết. */
  pageRange: string | null;
  binding: boolean;
}

/** Snapshot báo giá lúc gửi — tiệm đổi bảng giá sau đó KHÔNG làm đổi số này (IR-15). */
export interface PrintQuote {
  printablePages: number;
  sheets: number;
  unitPrice: number;
  subtotal: number;
  duplexDiscount: number;
  total: number;
  priceTableVersion: number;
  quotedAt: string;
}

export interface PrintOrderPayment {
  method: PrintPaymentMethod;
  status: PrintPaymentStatus;
  confirmedAt: string | null;
}

/**
 * Một dòng dòng-thời-gian. `status` là trạng thái đơn HOẶC nhãn sự kiện không đổi trạng thái (`PIN_REGENERATED`, `PAID`).
 * `by` (id người thao tác, `null` = hệ thống) CHỈ có ở view vận hành — chủ tiệm không nhận.
 */
export interface PrintOrderEvent {
  status: string;
  at: string;
  note: string | null;
  by?: string | null;
}

/** Trường chung của mọi view đơn (khách / chủ tiệm / vận hành) — KHÔNG có PIN, KHÔNG có URL tệp. */
export interface PrintOrderCore {
  id: string;
  code: string;
  status: PrintOrderStatus;
  shopId: string;
  fileName: string;
  /** `null` = chưa đếm xong (job `print.count-pages`) hoặc tệp lỗi (`pageCountError`). */
  pages: number | null;
  /** Mã lỗi `O2O_003` (tệp hỏng) / `O2O_011` (quá số trang) / `O2O_002` / `O2O_012`. */
  pageCountError: string | null;
  settings: PrintSettings;
  quote: PrintQuote | null;
  payment: PrintOrderPayment;
  events: PrintOrderEvent[];
  rejectReason: string | null;
  cancelReason: string | null;
  /** Hẹn lấy (khách chọn). */
  pickupBy: string | null;
  submittedAt: string | null;
  readyAt: string | null;
  pickedUpAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}
