/**
 * Phân hệ O2O (module `o2o`): địa điểm học tập quanh khu trường (quán cà phê, thư viện, tiệm in), đánh giá, tiệm in và đơn in.
 *
 * Ghi ĐÚNG như app: `Location.geo` = GeoJSON Point [lng, lat]; `hiddenAt` của đánh giá ghi `null` tường minh; `ratingAvg/ratingCount/noiseAvg`
 * phi chuẩn hoá tính từ chính các đánh giá hiển thị (cùng công thức `PrismaLocationReviewRepository.stats`: trung bình làm tròn 1 chữ số);
 * báo giá đơn in dùng chính `computeQuote`. Idempotent: địa điểm theo `normalizedName`, đánh giá theo (địa điểm, người), tiệm theo `locationId`,
 * đơn theo `code` (sinh tất định từ khoá đơn). KHÔNG tạo outbox/thông báo/tệp — ảnh địa điểm bỏ qua.
 *
 * Đơn in: `PrintOrder.fileAssetId` là BẮT BUỘC và seed không tự tạo tệp, nên một đơn chỉ được tạo khi đã có SẴN một tệp PDF `READY` trong DB — PDF do chính người đặt tải lên, hoặc PDF trong
 * Resource Hub của nhóm họ là thành viên (nguồn `RESOURCE`) — kèm `AssetLink PRINT_ORDER`; không có tệp ⇒ bỏ qua đơn đó (chạy lại sau khi có tệp sẽ tạo bổ sung). Số trang lấy theo khai báo của đơn mẫu.
 */
import { createHash } from "crypto";
import { normalizeSearch } from "../../../../src/core/utils/normalize";
import { newObjectId } from "../../../../src/core/utils/object-id";
import { computeQuote } from "../../../../src/modules/o2o/domain/print-quote";
import { DAY_MS, MIN_MS, prisma } from "../core";
import type { ModuleCtx, ModuleSeed } from "../module-ctx";
import { LOCATIONS, ORDERS, REVIEWS, SHOPS, type OrderSpec } from "./o2o.content";

const HOUR_MS = 3_600_000;
const THU = "thu";
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Mã đơn "PO-XXXXXX" sinh tất định từ khoá đơn (cùng bảng chữ với `generateOrderCode`). */
function orderCode(id: string): string {
  const digest = createHash("sha256").update(`seed-rich:o2o:order:${id}`).digest();
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[digest[i] % CODE_ALPHABET.length];
  return `PO-${s}`;
}

const round1 = (v: number | null): number => (v === null ? 0 : Math.round(v * 10) / 10);

export const seedO2o: ModuleSeed = async (c) => {
  const { dir, now } = c;
  const nowMs = now.getTime();
  const cap = (ms: number) => Math.min(ms, nowMs - 10 * MIN_MS);

  // Mốc sớm nhất cho bản ghi của một người: không cũ hơn tài khoản (tài khoản thật `thu` có sẵn từ trước nên không chặn).
  const keys = new Set<string>([THU, ...LOCATIONS.map((l) => l.by), ...REVIEWS.map((r) => r.by), ...SHOPS.map((s) => s.owner), ...ORDERS.map((o) => o.by)]);
  const users = await prisma.user.findMany({ where: { id: { in: [...keys].map((k) => dir.id(k)) } }, select: { id: true, createdAt: true } });
  const createdOf = new Map(users.map((u) => [u.id, u.createdAt.getTime()]));
  const floorOf = (key: string): number => (key === THU ? 0 : (createdOf.get(dir.id(key)) ?? 0));

  // ── Địa điểm ──
  const locBySlug = new Map<string, { id: string; createdAt: Date; status: string }>();
  let locNew = 0;
  for (const spec of LOCATIONS) {
    const normalizedName = normalizeSearch(spec.name);
    const existing = await prisma.location.findFirst({ where: { normalizedName }, select: { id: true, createdAt: true, status: true } });
    if (existing) {
      locBySlug.set(spec.slug, existing);
      continue;
    }
    const createdAt = new Date(cap(Math.max(nowMs - spec.daysAgo * DAY_MS, floorOf(spec.by) + 2 * HOUR_MS)));
    const row = await prisma.location.create({
      data: {
        name: spec.name,
        normalizedName,
        address: spec.address,
        geo: { type: "Point", coordinates: [spec.lng, spec.lat] },
        type: spec.type,
        amenities: spec.amenities,
        openHours: spec.hours,
        photoAssetIds: [],
        ratingAvg: 0,
        ratingCount: 0,
        noiseAvg: 0,
        status: spec.hiddenReason ? "HIDDEN" : "ACTIVE",
        hiddenReason: spec.hiddenReason ?? null,
        createdBy: dir.id(spec.by),
        createdAt,
        updatedAt: createdAt,
      },
      select: { id: true, createdAt: true, status: true },
    });
    locBySlug.set(spec.slug, row);
    locNew += 1;
  }

  // ── Đánh giá (rồi tính lại số liệu phi chuẩn hoá của địa điểm vừa có đánh giá mới) ──
  let reviewNew = 0;
  const touched = new Set<string>();
  for (const r of REVIEWS) {
    const loc = locBySlug.get(r.loc);
    if (!loc || loc.status !== "ACTIVE") continue;
    const userId = dir.id(r.by);
    if (await prisma.locationReview.findUnique({ where: { locationId_userId: { locationId: loc.id, userId } }, select: { id: true } })) continue;
    const at = new Date(cap(Math.max(nowMs - r.daysAgo * DAY_MS, loc.createdAt.getTime() + 3 * HOUR_MS, floorOf(r.by) + 2 * HOUR_MS)));
    await prisma.locationReview.create({
      data: { locationId: loc.id, userId, rating: r.rating, noise: r.noise, comment: r.comment, hiddenAt: null, createdAt: at, updatedAt: at },
    });
    touched.add(loc.id);
    reviewNew += 1;
  }
  for (const id of touched) {
    const agg = await prisma.locationReview.aggregate({ where: { locationId: id, hiddenAt: null }, _avg: { rating: true, noise: true }, _count: { _all: true } });
    await prisma.location.update({ where: { id }, data: { ratingAvg: round1(agg._avg.rating), ratingCount: agg._count._all, noiseAvg: round1(agg._avg.noise) } });
  }

  // ── Tiệm in (đã duyệt) ──
  const admin = await prisma.user.findFirst({ where: { role: { startsWith: "admin" } }, orderBy: { createdAt: "asc" }, select: { id: true } });
  const shopBySlug = new Map<string, { id: string; ownerUserId: string; version: number; createdAt: Date; priceTable: (typeof SHOPS)[number]["price"]; capabilities: (typeof SHOPS)[number]["caps"] }>();
  let shopNew = 0;
  for (const spec of SHOPS) {
    const loc = locBySlug.get(spec.loc);
    if (!loc) continue;
    let shop = await prisma.printShop.findUnique({ where: { locationId: loc.id } });
    if (!shop) {
      const ownerId = dir.id(spec.owner);
      const createdAt = new Date(cap(Math.max(nowMs - (spec.approvedDaysAgo + 1) * DAY_MS, loc.createdAt.getTime() + HOUR_MS, floorOf(spec.owner) + 2 * HOUR_MS)));
      const approvedAt = new Date(cap(createdAt.getTime() + 5 * HOUR_MS));
      shop = await prisma.printShop.create({
        data: {
          locationId: loc.id,
          ownerUserId: ownerId,
          displayName: spec.displayName,
          phone: null,
          priceTable: spec.price,
          capabilities: spec.caps,
          status: "APPROVED",
          approvedBy: admin && admin.id !== ownerId ? admin.id : null,
          approvedAt,
          suspendedReason: null,
          acceptingOrders: spec.accepting,
          createdAt,
          updatedAt: approvedAt,
        },
      });
      shopNew += 1;
    }
    shopBySlug.set(spec.loc, { id: shop.id, ownerUserId: shop.ownerUserId, version: shop.version, createdAt: shop.createdAt, priceTable: shop.priceTable, capabilities: shop.capabilities });
  }

  // ── Đơn in (chỉ khi chủ đơn có sẵn tệp PDF READY) ──
  const orderStats = await seedOrders({ now, floorOf, dirId: dir.id.bind(dir), shopBySlug, workspaces: c.workspaces });

  const orderNote = orderStats.skipped > 0 ? `, ${orderStats.skipped} đơn bỏ qua do chủ đơn chưa có tệp PDF READY` : "";
  return `O2O: +${locNew} địa điểm, +${reviewNew} đánh giá, +${shopNew} tiệm in, +${orderStats.created} đơn in${orderNote}`;
};

interface OrderCtx {
  now: Date;
  workspaces: ModuleCtx["workspaces"];
  floorOf: (key: string) => number;
  dirId: (key: string) => string;
  shopBySlug: Map<string, { id: string; ownerUserId: string; version: number; createdAt: Date; priceTable: (typeof SHOPS)[number]["price"]; capabilities: (typeof SHOPS)[number]["caps"] }>;
}

interface Step {
  status: string;
  offsetMin: number;
  by: "user" | "owner" | null;
  note?: string | null;
}

/** Chuỗi sự kiện dòng thời gian theo máy trạng thái thật (DRAFT → QUOTED → PENDING → ACCEPTED → PRINTING → READY → PICKED_UP, hoặc rẽ nhánh kết thúc). */
function stepsOf(spec: OrderSpec): Step[] {
  const head: Step[] = [
    { status: "DRAFT", offsetMin: 0, by: "user" },
    { status: "QUOTED", offsetMin: 0.4, by: null, note: `${spec.pages} trang` },
    { status: "PENDING", offsetMin: 4, by: "user" },
  ];
  const accepted: Step[] = [...head, { status: "ACCEPTED", offsetMin: 16, by: "owner" }];
  switch (spec.status) {
    case "PENDING":
      return head;
    case "ACCEPTED":
      return accepted;
    case "PRINTING":
      return [...accepted, { status: "PRINTING", offsetMin: 40, by: "owner" }];
    case "READY":
      return [...accepted, { status: "PRINTING", offsetMin: 40, by: "owner" }, { status: "READY", offsetMin: 75, by: "owner" }];
    case "PICKED_UP":
      return [...accepted, { status: "PRINTING", offsetMin: 40, by: "owner" }, { status: "READY", offsetMin: 75, by: "owner" }, { status: "PICKED_UP", offsetMin: 190, by: "owner" }];
    case "REJECTED":
      return [...head, { status: "REJECTED", offsetMin: 22, by: "owner", note: spec.note ?? null }];
    case "CANCELLED":
      return [...head, { status: "CANCELLED", offsetMin: 35, by: "user", note: spec.note ?? null }];
    case "EXPIRED":
      return [...head, { status: "EXPIRED", offsetMin: 24 * 60 + 4, by: null }];
    default:
      return head.slice(0, 2);
  }
}

async function seedOrders(o: OrderCtx): Promise<{ created: number; skipped: number }> {
  const nowMs = o.now.getTime();
  let created = 0;
  let skipped = 0;
  const used = new Map<string, number>();
  let hashPin: ((orderId: string, pin: string) => string) | null = null;
  try {
    hashPin = (await import("../../../../src/modules/o2o/domain/pickup-pin")).hashPin;
  } catch {
    hashPin = null; // thiếu ENCRYPTION_KEY trong môi trường chạy seed ⇒ đơn không có PIN (chủ đơn bấm "tạo PIN mới" khi cần)
  }

  for (const spec of ORDERS) {
    const code = orderCode(spec.id);
    if (await prisma.printOrder.findUnique({ where: { code }, select: { id: true } })) continue;
    const shop = o.shopBySlug.get(spec.shop);
    const userId = o.dirId(spec.by);
    // Tệp in: ưu tiên PDF READY do chính người đặt tải lên; không có thì dùng PDF của Resource Hub ở nhóm họ là thành viên.
    // Lọc `deletedAt` ở JS: tài liệu cũ có thể thiếu hẳn trường (Mongo: vắng mặt ≠ null).
    const own = (
      await prisma.asset.findMany({ where: { ownerId: userId, status: "READY", mime: "application/pdf", variant: "ORIGINAL" }, orderBy: { createdAt: "asc" }, select: { id: true, deletedAt: true } })
    ).filter((a) => !a.deletedAt);
    const files: Array<{ assetId: string; kind: "UPLOAD" | "RESOURCE"; resourceId: string | null; workspaceId: string | null; name: string | null }> = own.map((a) => ({ assetId: a.id, kind: "UPLOAD", resourceId: null, workspaceId: null, name: null }));
    if (files.length === 0) {
      const wsIds = [...o.workspaces.values()].filter((w) => w.roles.has(spec.by)).map((w) => w.id);
      const resources = (await prisma.resource.findMany({ where: { workspaceId: { in: wsIds }, mime: "application/pdf" }, orderBy: { createdAt: "asc" } })).filter((r) => !r.deletedAt);
      const ready = new Set((await prisma.asset.findMany({ where: { id: { in: resources.map((r) => r.assetId) }, status: "READY" }, select: { id: true } })).map((a) => a.id));
      for (const r of resources) if (ready.has(r.assetId)) files.push({ assetId: r.assetId, kind: "RESOURCE", resourceId: r.id, workspaceId: r.workspaceId, name: r.name });
    }
    if (!shop || files.length === 0) {
      skipped += 1;
      continue;
    }
    const nth = used.get(userId) ?? 0;
    used.set(userId, nth + 1);
    const file = files[nth % files.length];

    const steps = stepsOf(spec);
    const span = steps[steps.length - 1].offsetMin * MIN_MS;
    let t0 = Math.max(nowMs - spec.daysAgo * DAY_MS, o.floorOf(spec.by) + 2 * HOUR_MS, shop.createdAt.getTime() + 6 * HOUR_MS);
    if (t0 + span > nowMs - 5 * MIN_MS) t0 = nowMs - 5 * MIN_MS - span;
    const at = (s: Step) => new Date(t0 + s.offsetMin * MIN_MS);

    const quoted = at(steps[1]);
    const r = computeQuote({ pages: spec.pages, settings: spec.settings, priceTable: shop.priceTable, capabilities: shop.capabilities, priceTableVersion: shop.version, now: quoted });
    if (!r.ok) throw new Error(`[o2o] đơn "${spec.id}" vượt năng lực tiệm "${spec.shop}": ${r.reason}`);

    const id = newObjectId();
    const events = steps.map((s) => ({ status: s.status, at: at(s), by: s.by === "user" ? userId : s.by === "owner" ? shop.ownerUserId : null, note: s.note ?? null }));
    const last = events[events.length - 1];
    const find = (status: string) => events.find((e) => e.status === status)?.at ?? null;
    const terminal = ["PICKED_UP", "REJECTED", "CANCELLED", "EXPIRED"].includes(spec.status);
    const paid = spec.status === "PICKED_UP" && spec.paid === true;
    const pickedUpAt = find("PICKED_UP");
    const pin = String(100000 + (createHash("sha256").update(`seed-rich:o2o:pin:${spec.id}`).digest().readUInt32BE(0) % 900000));

    await prisma.printOrder.create({
      data: {
        id,
        code,
        userId,
        shopId: shop.id,
        shopOwnerId: shop.ownerUserId,
        workspaceId: file.workspaceId,
        source: { kind: file.kind, resourceId: file.resourceId, assetId: file.assetId },
        fileAssetId: file.assetId,
        fileName: file.name ?? spec.fileName,
        pages: spec.pages,
        pageCountError: null,
        settings: spec.settings,
        quote: r.quote,
        pinHash: hashPin ? hashPin(id, pin) : null,
        status: spec.status,
        payment: { method: "AT_COUNTER", status: paid ? "PAID" : "UNPAID", confirmedBy: paid ? shop.ownerUserId : null, confirmedAt: paid ? pickedUpAt : null },
        events,
        rejectReason: spec.status === "REJECTED" ? (spec.note ?? null) : null,
        cancelReason: spec.status === "CANCELLED" ? (spec.note ?? null) : null,
        pickupBy: null,
        submittedAt: find("PENDING"),
        readyAt: find("READY"),
        pickedUpAt,
        fileAccessUntil: terminal ? new Date(last.at.getTime() + 24 * HOUR_MS) : null,
        expiringNotifiedAt: null,
        version: events.length,
        createdAt: events[0].at,
        updatedAt: last.at,
      },
    });
    // Liên kết tệp ↔ đơn như `assets.attach` (scope NONE, chủ tệp là chủ đơn).
    if (!(await prisma.assetLink.findFirst({ where: { assetId: file.assetId, targetType: "PRINT_ORDER", targetId: id }, select: { id: true } }))) {
      await prisma.assetLink.create({ data: { assetId: file.assetId, targetType: "PRINT_ORDER", targetId: id, scopeType: "NONE", scopeId: null, createdBy: userId, createdAt: events[0].at } });
    }
    created += 1;
  }
  return { created, skipped };
}
