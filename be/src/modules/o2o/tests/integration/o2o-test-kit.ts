/**
 * Bộ dựng test tích hợp `o2o`: app Express với 3 router, token, seed người dùng/asset PDF, dựng tiệm qua API vận hành, dọn dữ liệu.
 * KHÔNG phải test (không khớp `*.test.ts`).
 */
import express from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { JwtUtils } from "../../../../core/utils/jwt";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";
import o2oRoutes from "../../o2o.routes";
import partnerRoutes from "../../partner.routes";
import adminO2oRoutes from "../../admin-o2o.routes";

export function buildO2oApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1", o2oRoutes);
  app.use("/api/v1", partnerRoutes);
  app.use("/api/v1", adminO2oRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export const tokenFor = (userId: string, role = "user"): string =>
  JwtUtils.generateAccessToken({ userId, email: `${userId}@e.com`, name: "T", role, sv: 1 });

export type Api = (method: "get" | "post" | "put" | "patch" | "delete", path: string, userId: string, body?: unknown, role?: string) => request.Test;

export function makeApi(app: ReturnType<typeof buildO2oApp>): Api {
  return (method, path, userId, body, role = "user") => {
    const req = request(app)[method](`/api/v1${path}`).set("Authorization", `Bearer ${tokenFor(userId, role)}`);
    return body === undefined ? req : req.send(body as object);
  };
}

/** Ghi nhận mọi id tạo trong test để dọn đúng phần của mình (DB memory dùng chung giữa các suite). */
export const created = { users: [] as string[], locations: [] as string[], assets: [] as string[] };

export async function seedUser(role = "user"): Promise<string> {
  const id = newObjectId();
  await prisma.user.create({ data: { id, email: `${id}@e.com`, name: `Người ${id.slice(-4)}`, role } });
  created.users.push(id);
  return id;
}

/** Asset PDF READY của `ownerId` (scope PRINT) — nội dung tệp được `storage.readRange` giả trả về trong test. */
export async function seedPdfAsset(ownerId: string, size = 2048): Promise<string> {
  const id = newObjectId();
  await prisma.asset.create({
    data: { id, ownerId, scope: "PRINT", kind: "FILE", status: "READY", uploadMethod: "API_PUT", mime: "application/pdf", declaredSize: size, size, originalName: "de-cuong.pdf", storageKey: `test/print/${id}/original.pdf`, readyAt: new Date() },
  });
  created.assets.push(id);
  return id;
}

export const PRICE_TABLE = { a4Bw: 500, a4Color: 2000, a3Bw: 1000, a3Color: 4000, duplexDiscountPct: 10, minOrder: 2000 };

/** Vận hành tạo địa điểm PRINT_SHOP + tiệm rồi duyệt — trả id tiệm, địa điểm, chủ tiệm. */
export async function setupApprovedShop(api: Api, opsId: string): Promise<{ shopId: string; locationId: string; ownerId: string }> {
  const ownerId = await seedUser();
  const loc = await api("post", "/admin/locations", opsId, { name: "Photo Bách Khoa", address: "1 Đại Cồ Việt", lat: 21.005, lng: 105.843, type: "PRINT_SHOP" }, "admin");
  if (loc.status !== 201) throw new Error(`tạo địa điểm lỗi ${loc.status} ${JSON.stringify(loc.body)}`);
  created.locations.push(loc.body.data.id);
  const shop = await api(
    "post",
    "/admin/print-shops",
    opsId,
    { locationId: loc.body.data.id, ownerEmail: `${ownerId}@e.com`, displayName: "Photo BK", priceTable: PRICE_TABLE, capabilities: { color: true, duplex: true, a3: true, binding: false } },
    "admin"
  );
  if (shop.status !== 201) throw new Error(`tạo tiệm lỗi ${shop.status} ${JSON.stringify(shop.body)}`);
  const approved = await api("post", `/admin/print-shops/${shop.body.data.id}/approve`, opsId, { reason: "Đã xác minh giấy phép" }, "admin");
  if (approved.status !== 200) throw new Error(`duyệt tiệm lỗi ${approved.status}`);
  return { shopId: shop.body.data.id, locationId: loc.body.data.id, ownerId };
}

export async function cleanupO2o(): Promise<void> {
  const users = created.users.splice(0);
  const locations = created.locations.splice(0);
  const assets = created.assets.splice(0);
  const orders = await prisma.printOrder.findMany({ where: { userId: { in: users } }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  const notifIds = orderIds.length
    ? (await prisma.notification.findMany({ where: { OR: orderIds.map((id) => ({ dedupeKey: { contains: id } })) }, select: { id: true } })).map((n) => n.id)
    : [];
  await prisma.notificationRecipient.deleteMany({ where: { notificationId: { in: notifIds } } });
  await prisma.notification.deleteMany({ where: { id: { in: notifIds } } });
  await prisma.outboxEvent.deleteMany({
    where: { OR: [{ aggregateId: { in: orderIds } }, ...notifIds.map((id) => ({ aggregateId: { startsWith: id } }))] },
  });
  await prisma.assetLink.deleteMany({ where: { assetId: { in: assets } } });
  await prisma.printOrder.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.printShop.deleteMany({ where: { locationId: { in: locations } } });
  await prisma.locationReview.deleteMany({ where: { locationId: { in: locations } } });
  await prisma.location.deleteMany({ where: { id: { in: locations } } });
  await prisma.asset.deleteMany({ where: { id: { in: assets } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
}
