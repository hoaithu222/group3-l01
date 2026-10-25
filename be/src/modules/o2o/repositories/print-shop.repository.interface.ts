import type { PrintCapabilities, PrintPriceTable, PrintShop, PrintShopStatus } from "../entities/o2o.interface";
import type { TxHandle } from "./tx";

export interface ShopCreateInput {
  locationId: string;
  ownerUserId: string;
  displayName: string;
  phone: string | null;
  priceTable: PrintPriceTable;
  capabilities: PrintCapabilities;
}

export interface ShopPatch {
  displayName?: string;
  phone?: string | null;
  priceTable?: PrintPriceTable;
  capabilities?: PrintCapabilities;
  acceptingOrders?: boolean;
}

export interface ShopStatusPatch {
  status: PrintShopStatus;
  approvedBy?: string | null;
  approvedAt?: Date | null;
  suspendedReason?: string | null;
}

export interface AdminShopFilter {
  page: number;
  limit: number;
  q?: string;
  status?: PrintShopStatus;
}

export interface IPrintShopRepository {
  findById(id: string): Promise<PrintShop | null>;
  findByLocationId(locationId: string): Promise<PrintShop | null>;
  findByLocationIds(locationIds: string[]): Promise<PrintShop[]>;
  listByOwner(ownerUserId: string): Promise<PrintShop[]>;
  hasApprovedForOwner(ownerUserId: string): Promise<boolean>;
  create(input: ShopCreateInput, tx?: TxHandle): Promise<PrintShop>;
  /** CAS theo `expectedVersion`, tăng `version` (báo giá mới ghi `priceTableVersion` = version mới). `null` khi lệch. */
  update(id: string, expectedVersion: number, patch: ShopPatch, tx?: TxHandle): Promise<PrintShop | null>;
  /** Đổi trạng thái duyệt khi đang ở một trong `from` — `null` khi không khớp. */
  setStatus(id: string, from: readonly PrintShopStatus[], patch: ShopStatusPatch, tx?: TxHandle): Promise<PrintShop | null>;
  /** Chủ tiệm bật/tắt nhận đơn (không đổi bảng giá → không tăng version). */
  setAccepting(id: string, ownerUserId: string, acceptingOrders: boolean): Promise<PrintShop | null>;
  listAdmin(filter: AdminShopFilter): Promise<{ data: PrintShop[]; total: number }>;
}
