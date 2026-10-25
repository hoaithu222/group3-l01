import type { Location, LocationReview, PrintOrder, PrintShop } from "../entities/o2o.interface";
import { canPerform, FILE_DOWNLOAD_STATUSES } from "../domain/print-order.state-machine";

/** DTO trả client (be.md §4) — KHÔNG bao giờ chứa `pinHash`, toạ độ người dùng, email người khác (trừ admin có `user:view`). */

export const latLng = (l: Location) => ({ lat: l.geo.coordinates[1], lng: l.geo.coordinates[0] });

export function locationBase(l: Location) {
  return {
    id: l.id,
    name: l.name,
    type: l.type,
    address: l.address,
    ...latLng(l),
    amenities: l.amenities,
    ratingAvg: l.ratingAvg,
    ratingCount: l.ratingCount,
    noiseAvg: l.noiseAvg,
  };
}

export function reviewView(r: LocationReview, authorName: string | null, viewerId: string) {
  return {
    id: r.id,
    rating: r.rating,
    noise: r.noise,
    comment: r.comment,
    author: { id: r.userId, name: authorName ?? "Người dùng" },
    mine: r.userId === viewerId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** Tiệm công khai (người dùng) — bảng giá tóm tắt + năng lực + trạng thái nhận đơn. */
export function shopPublicView(s: PrintShop, location?: Location | null) {
  return {
    id: s.id,
    locationId: s.locationId,
    displayName: s.displayName,
    phone: s.phone,
    priceTable: s.priceTable,
    capabilities: s.capabilities,
    acceptingOrders: s.acceptingOrders,
    priceTableVersion: s.version,
    ...(location && { location: { name: location.name, address: location.address, ...latLng(location) } }),
  };
}

const orderCore = (o: PrintOrder) => ({
  id: o.id,
  code: o.code,
  status: o.status,
  shopId: o.shopId,
  fileName: o.fileName,
  pages: o.pages,
  pageCountError: o.pageCountError,
  settings: o.settings,
  quote: o.quote,
  payment: { method: o.payment.method, status: o.payment.status, confirmedAt: o.payment.confirmedAt },
  events: o.events.map((e) => ({ status: e.status, at: e.at, note: e.note })),
  rejectReason: o.rejectReason,
  cancelReason: o.cancelReason,
  pickupBy: o.pickupBy,
  submittedAt: o.submittedAt,
  readyAt: o.readyAt,
  pickedUpAt: o.pickedUpAt,
  version: o.version,
  createdAt: o.createdAt,
  updatedAt: o.updatedAt,
});

export interface ShopBrief {
  id: string;
  displayName: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

export function shopBrief(s: PrintShop | null | undefined, location?: Location | null): ShopBrief | null {
  if (!s) return null;
  return { id: s.id, displayName: s.displayName, address: location?.address ?? null, ...(location ? latLng(location) : { lat: null, lng: null }) };
}

/** Chủ đơn (app) — `myActions` do server tính, app chỉ vẽ nút. */
export function customerOrderView(o: PrintOrder, shop: ShopBrief | null) {
  return {
    ...orderCore(o),
    source: { kind: o.source.kind, resourceId: o.source.resourceId },
    shop,
    hasPin: o.pinHash !== null,
    myActions: {
      canEdit: canPerform("UPDATE_SETTINGS", o.status),
      canSubmit: canPerform("SUBMIT", o.status) && o.quote !== null,
      canCancel: canPerform("CANCEL", o.status),
      canRegeneratePin: canPerform("REGENERATE_PIN", o.status),
    },
  };
}

/** Tiệm (partner) — không PIN, không tệp (tải tệp qua `/file` riêng); khách chỉ hiện tên. */
export function partnerOrderView(o: PrintOrder, customerName: string | null) {
  return {
    ...orderCore(o),
    customer: { name: customerName ?? "Khách" },
    partnerActions: {
      canAccept: canPerform("ACCEPT", o.status),
      canReject: canPerform("REJECT", o.status),
      canStartPrinting: canPerform("START_PRINTING", o.status),
      canMarkReady: canPerform("MARK_READY", o.status),
      canPickup: canPerform("PICKUP", o.status),
      canMarkPaid: canPerform("MARK_PAID", o.status) && o.payment.status !== "PAID",
      canDownload: FILE_DOWNLOAD_STATUSES.includes(o.status),
    },
  };
}

/** Vận hành — không PIN, không nút tải tệp (viewpoint riêng tư, admin.md §2.3). */
export function adminOrderView(o: PrintOrder, customer: { id: string; name: string } | null, shop: ShopBrief | null) {
  return {
    ...orderCore(o),
    customer: customer ?? { id: o.userId, name: "Người dùng" },
    shop,
    events: o.events.map((e) => ({ status: e.status, at: e.at, by: e.by, note: e.note })),
    adminActions: { canCancel: canPerform("ADMIN_CANCEL", o.status) },
  };
}
