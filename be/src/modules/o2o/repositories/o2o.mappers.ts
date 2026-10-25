import type {
  Location as PrismaLocation,
  LocationReview as PrismaLocationReview,
  PrintOrder as PrismaPrintOrder,
  PrintShop as PrismaPrintShop,
} from "@prisma/client";
import type {
  Location,
  LocationReview,
  PrintOrder,
  PrintOrderStatus,
  PrintPayment,
  PrintShop,
  PrintSource,
  PaperSize,
} from "../entities/o2o.interface";

/** Prisma → thực thể miền (enum/chuỗi thu hẹp về kiểu miền; composite type sao chép nông). */
export function toLocation(r: PrismaLocation): Location {
  const [lng, lat] = r.geo.coordinates;
  return {
    id: r.id,
    name: r.name,
    normalizedName: r.normalizedName,
    address: r.address,
    geo: { type: "Point", coordinates: [lng ?? 0, lat ?? 0] },
    type: r.type,
    amenities: [...r.amenities],
    openHours: r.openHours.map((h) => ({ day: h.day, open: h.open, close: h.close })),
    photoAssetIds: [...r.photoAssetIds],
    ratingAvg: r.ratingAvg,
    ratingCount: r.ratingCount,
    noiseAvg: r.noiseAvg,
    status: r.status,
    hiddenReason: r.hiddenReason ?? null,
    createdBy: r.createdBy,
    version: r.version,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function toReview(r: PrismaLocationReview): LocationReview {
  return {
    id: r.id,
    locationId: r.locationId,
    userId: r.userId,
    rating: r.rating,
    noise: r.noise,
    comment: r.comment ?? null,
    hiddenAt: r.hiddenAt ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function toShop(r: PrismaPrintShop): PrintShop {
  return {
    id: r.id,
    locationId: r.locationId,
    ownerUserId: r.ownerUserId,
    displayName: r.displayName,
    phone: r.phone ?? null,
    priceTable: { ...r.priceTable },
    capabilities: { ...r.capabilities },
    status: r.status,
    approvedBy: r.approvedBy ?? null,
    approvedAt: r.approvedAt ?? null,
    suspendedReason: r.suspendedReason ?? null,
    acceptingOrders: r.acceptingOrders,
    version: r.version,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function toOrder(r: PrismaPrintOrder): PrintOrder {
  return {
    id: r.id,
    code: r.code,
    userId: r.userId,
    shopId: r.shopId,
    shopOwnerId: r.shopOwnerId,
    workspaceId: r.workspaceId ?? null,
    source: {
      kind: r.source.kind as PrintSource["kind"],
      resourceId: r.source.resourceId ?? null,
      assetId: r.source.assetId,
    },
    fileAssetId: r.fileAssetId,
    fileName: r.fileName,
    pages: r.pages ?? null,
    pageCountError: r.pageCountError ?? null,
    settings: {
      paper: r.settings.paper as PaperSize,
      color: r.settings.color,
      copies: r.settings.copies,
      duplex: r.settings.duplex,
      pageRange: r.settings.pageRange ?? null,
      binding: r.settings.binding,
    },
    quote: r.quote ? { ...r.quote } : null,
    pinHash: r.pinHash ?? null,
    status: r.status as PrintOrderStatus,
    payment: {
      method: r.payment.method as PrintPayment["method"],
      status: r.payment.status as PrintPayment["status"],
      confirmedBy: r.payment.confirmedBy ?? null,
      confirmedAt: r.payment.confirmedAt ?? null,
    },
    events: r.events.map((e) => ({ status: e.status, at: e.at, by: e.by ?? null, note: e.note ?? null })),
    rejectReason: r.rejectReason ?? null,
    cancelReason: r.cancelReason ?? null,
    pickupBy: r.pickupBy ?? null,
    submittedAt: r.submittedAt ?? null,
    readyAt: r.readyAt ?? null,
    pickedUpAt: r.pickedUpAt ?? null,
    fileAccessUntil: r.fileAccessUntil ?? null,
    expiringNotifiedAt: r.expiringNotifiedAt ?? null,
    version: r.version,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** Số từ kết quả `aggregateRaw` (JSON thuần hoặc Extended JSON `{ $numberDouble }`). */
export function rawNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const inner = o.$numberDouble ?? o.$numberInt ?? o.$numberLong;
    if (inner !== undefined) return Number(inner);
  }
  return Number.NaN;
}

/** `_id` từ kết quả `aggregateRaw` (`{ $oid }`). */
export function rawId(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && typeof (v as { $oid?: unknown }).$oid === "string") return (v as { $oid: string }).$oid;
  return null;
}
