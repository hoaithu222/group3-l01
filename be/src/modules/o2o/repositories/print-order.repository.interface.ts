import type {
  PrintOrder,
  PrintOrderEvent,
  PrintOrderStatus,
  PrintPayment,
  PrintQuote,
  PrintSettings,
  PrintSource,
} from "../entities/o2o.interface";
import type { TxHandle } from "./tx";

export interface OrderCreateInput {
  code: string;
  userId: string;
  shopId: string;
  shopOwnerId: string;
  workspaceId: string | null;
  source: PrintSource;
  fileAssetId: string;
  fileName: string;
  settings: PrintSettings;
  pickupBy: Date | null;
  event: PrintOrderEvent;
}

/** Trường được ghi trong một lần chuyển (CAS). Vắng = giữ nguyên; `quote: null` = xoá báo giá. */
export interface OrderSetPatch {
  status?: PrintOrderStatus;
  settings?: PrintSettings;
  pages?: number | null;
  pageCountError?: string | null;
  quote?: PrintQuote | null;
  pinHash?: string | null;
  payment?: PrintPayment;
  rejectReason?: string | null;
  cancelReason?: string | null;
  pickupBy?: Date | null;
  submittedAt?: Date | null;
  readyAt?: Date | null;
  pickedUpAt?: Date | null;
  fileAccessUntil?: Date | null;
  expiringNotifiedAt?: Date | null;
}

export interface OrderTransition {
  /** CAS: chỉ ghi khi đơn còn ở `from` VÀ `version` khớp. */
  from: PrintOrderStatus;
  version: number;
  set: OrderSetPatch;
  event?: PrintOrderEvent;
}

export interface OrderCursor {
  at: Date;
  id: string;
}

export interface AdminOrderFilter {
  page: number;
  limit: number;
  shopId?: string;
  status?: PrintOrderStatus;
  paymentStatus?: "UNPAID" | "PAID";
  from?: Date;
  to?: Date;
  code?: string;
}

export type DueKind = "PENDING_EXPIRE" | "READY_EXPIRE" | "READY_EXPIRING" | "DRAFT_ABANDON";

export interface IPrintOrderRepository {
  /** Ném lỗi P2002 khi trùng `code` — service sinh mã khác rồi thử lại. */
  create(input: OrderCreateInput, tx?: TxHandle): Promise<PrintOrder>;
  findById(id: string): Promise<PrintOrder | null>;
  transition(id: string, t: OrderTransition, tx?: TxHandle): Promise<PrintOrder | null>;
  /** Ghi kết quả đếm trang khi đơn còn DRAFT/QUOTED và vẫn trỏ đúng `assetId` (job chạy lại vô hại). */
  setPageCount(id: string, assetId: string, set: OrderSetPatch, event?: PrintOrderEvent): Promise<PrintOrder | null>;
  listByUser(userId: string, opts: { statuses?: readonly PrintOrderStatus[]; before?: OrderCursor; limit: number }): Promise<PrintOrder[]>;
  /** Đơn ĐÃ GỬI của các tiệm do `ownerUserId` sở hữu (partner). */
  listForOwner(ownerUserId: string, opts: { statuses?: readonly PrintOrderStatus[]; before?: OrderCursor; limit: number }): Promise<PrintOrder[]>;
  listAdmin(filter: AdminOrderFilter): Promise<{ data: PrintOrder[]; total: number }>;
  /** Đơn tới hạn xử lý của cron (be.md §7) — `threshold` là mốc so với `submittedAt`/`readyAt`/`createdAt`. */
  findDue(kind: DueKind, threshold: Date, limit: number): Promise<PrintOrder[]>;
  countByShopsSince(shopIds: string[], since: Date): Promise<Map<string, number>>;
  countByShopStatus(shopId: string, statuses: readonly PrintOrderStatus[]): Promise<number>;
  listByShopStatus(shopId: string, statuses: readonly PrintOrderStatus[], limit: number): Promise<PrintOrder[]>;
}
