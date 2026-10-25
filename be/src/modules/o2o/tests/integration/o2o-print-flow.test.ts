import { installMocks, redisStore } from "./o2o-test-mocks";
import { buildO2oApp, cleanupO2o, makeApi, seedPdfAsset, seedUser, setupApprovedShop } from "./o2o-test-kit";
import { prisma } from "../../../../infrastructure/database";
import { storage } from "../../../../infrastructure/storage";
import { getO2oContainer } from "../../o2o.container";
import { makePdf } from "../o2o-test-kit";

const app = buildO2oApp();
const api = makeApi(app);
const SETTINGS = { paper: "A4", color: true, copies: 1, duplex: true, binding: false };
const wrongPin = (pin: string) => String((Number(pin) + 1) % 1_000_000).padStart(6, "0");

/** Khách tạo đơn từ PDF 12 trang → job đếm trang → QUOTED. */
async function quotedOrder(shopId: string) {
  const customer = await seedUser();
  const assetId = await seedPdfAsset(customer);
  const created = await api("post", "/print-orders", customer, { shopId, source: { kind: "UPLOAD", assetId }, settings: SETTINGS });
  expect(created.status).toBe(201);
  await getO2oContainer().services.pageCount.handle({ orderId: created.body.data.id, assetId });
  return { customer, orderId: created.body.data.id as string };
}

describe("o2o — luồng đơn in app → partner → PIN (integration)", () => {
  beforeEach(() => {
    installMocks();
    jest.spyOn(storage, "readRange").mockResolvedValue(makePdf(12));
  });
  afterEach(async () => {
    await cleanupO2o();
    redisStore.clear();
  });

  it("IR-08/IR-11/IR-09: báo giá đúng + PIN; tiệm không lấy tệp trước khi nhận; sai PIN 5 lần khoá; đúng PIN → PICKED_UP + thông báo", async () => {
    const opsId = await seedUser("admin");
    const { shopId, ownerId } = await setupApprovedShop(api, opsId);
    const { customer, orderId } = await quotedOrder(shopId);

    const submitted = await api("post", `/print-orders/${orderId}/submit`, customer);
    expect(submitted.status).toBe(200);
    const pin = submitted.body.data.pin as string;
    expect(pin).toMatch(/^\d{6}$/);
    expect(submitted.body.data.order).toMatchObject({ status: "PENDING", quote: { total: 21_600, printablePages: 12 } });
    expect((await prisma.printOrder.findUnique({ where: { id: orderId } }))?.pinHash).not.toContain(pin);
    expect((await api("get", `/print-orders/${orderId}`, customer)).body.data).not.toHaveProperty("pin");

    // Chủ tiệm có partner:* THEO DỮ LIỆU (tiệm APPROVED); admin vận hành và người thường thì không.
    expect((await api("get", "/partner/shops/me", ownerId)).body.data[0]).toMatchObject({ id: shopId, status: "APPROVED" });
    expect((await api("get", "/partner/orders", opsId, undefined, "admin")).status).toBe(403);
    expect((await api("get", "/partner/orders", customer)).status).toBe(403);
    const queue = await api("get", "/partner/orders?status=PENDING", ownerId);
    expect(queue.body.data.map((o: { id: string }) => o.id)).toEqual([orderId]);
    expect(JSON.stringify(queue.body.data)).not.toMatch(/pinHash|"pin"/);

    const early = await api("get", `/partner/orders/${orderId}/file`, ownerId);
    expect(early.status).toBe(403);
    expect(early.body.error.code).toBe("O2O_006");
    expect((await api("post", `/partner/orders/${orderId}/accept`, ownerId)).body.data.status).toBe("ACCEPTED");
    const file = await api("get", `/partner/orders/${orderId}/file`, ownerId);
    expect(file.status).toBe(200);
    expect(file.body.data).toMatchObject({ url: expect.any(String), expiresAt: expect.any(String), fileName: "de-cuong.pdf" });
    expect(await prisma.auditLog.count({ where: { action: "print.file-download", targetId: orderId } })).toBe(1);
    await api("post", `/partner/orders/${orderId}/printing`, ownerId);
    expect((await api("post", `/partner/orders/${orderId}/ready`, ownerId)).body.data.status).toBe("READY");

    for (let left = 4; left >= 1; left -= 1) {
      const r = await api("post", `/partner/orders/${orderId}/pickup`, ownerId, { pin: wrongPin(pin) });
      expect(r.status).toBe(400);
      expect(r.body.error).toMatchObject({ code: "O2O_007", details: { attemptsLeft: left } });
    }
    const locked = await api("post", `/partner/orders/${orderId}/pickup`, ownerId, { pin: wrongPin(pin) });
    expect(locked.status).toBe(423);
    expect(locked.body.error).toMatchObject({ code: "O2O_008", details: { retryAfterSeconds: 900 } });
    expect((await api("post", `/partner/orders/${orderId}/pickup`, ownerId, { pin })).status).toBe(423);

    redisStore.delete(`o2o:pin:lock:${orderId}`); // hết TTL 15 phút
    const done = await api("post", `/partner/orders/${orderId}/pickup`, ownerId, { pin, markPaid: true });
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ status: "PICKED_UP", payment: { status: "PAID" } });
    const notice = await prisma.notification.findFirst({ where: { type: "print-order.picked-up", dedupeKey: { contains: orderId } }, include: { recipients: true } });
    expect(notice?.recipients.map((r) => r.recipientId)).toEqual([customer]);
    expect(await prisma.notification.count({ where: { type: "print-order.new", dedupeKey: { contains: orderId } } })).toBe(1);
  });

  it("IR-13/IR-12/IR-15: tiệm khác → 404; khách huỷ khi PRINTING → 409 O2O_004; đổi bảng giá sau khi gửi không đổi báo giá", async () => {
    const opsId = await seedUser("admin");
    const a = await setupApprovedShop(api, opsId);
    const b = await setupApprovedShop(api, opsId);
    const { customer, orderId } = await quotedOrder(a.shopId);
    await api("post", `/print-orders/${orderId}/submit`, customer);

    expect((await api("get", `/partner/orders/${orderId}`, b.ownerId)).status).toBe(404);
    expect((await api("post", `/partner/orders/${orderId}/accept`, b.ownerId)).status).toBe(404);

    const shop = await api("get", `/admin/print-shops/${a.shopId}`, opsId, undefined, "admin");
    expect(shop.body.data.pendingOrders).toBe(1);
    const patched = await api("patch", `/admin/print-shops/${a.shopId}`, opsId, { priceTable: { ...shop.body.data.priceTable, a4Color: 5000 }, reason: "Tăng giá mực", expectedVersion: shop.body.data.version }, "admin");
    expect(patched.status).toBe(200);
    expect((await api("get", `/print-orders/${orderId}`, customer)).body.data.quote.total).toBe(21_600);

    await api("post", `/partner/orders/${orderId}/accept`, a.ownerId);
    await api("post", `/partner/orders/${orderId}/printing`, a.ownerId);
    const cancel = await api("post", `/print-orders/${orderId}/cancel`, customer, {});
    expect(cancel.status).toBe(409);
    expect(cancel.body.error.code).toBe("O2O_004");
  });

  it("IR-14: READY quá 7 ngày → cron EXPIRED + thông báo khách và tiệm; tiệm hết tải tệp", async () => {
    const opsId = await seedUser("admin");
    const { shopId, ownerId } = await setupApprovedShop(api, opsId);
    const { customer, orderId } = await quotedOrder(shopId);
    await api("post", `/print-orders/${orderId}/submit`, customer);
    for (const step of ["accept", "printing", "ready"]) await api("post", `/partner/orders/${orderId}/${step}`, ownerId);
    await prisma.printOrder.update({ where: { id: orderId }, data: { readyAt: new Date(Date.now() - 8 * 86_400_000) } });

    const r = await getO2oContainer().services.expiry.tick();
    expect(r.expiredReady).toBeGreaterThanOrEqual(1);
    expect((await api("get", `/print-orders/${orderId}`, customer)).body.data.status).toBe("EXPIRED");
    const notice = await prisma.notification.findFirst({ where: { type: "print-order.expired", dedupeKey: { contains: orderId } }, include: { recipients: true } });
    expect(notice?.recipients.map((x) => x.recipientId).sort()).toEqual([customer, ownerId].sort());
    expect((await api("get", `/partner/orders/${orderId}/file`, ownerId)).body.error.code).toBe("O2O_006");
  });
});
