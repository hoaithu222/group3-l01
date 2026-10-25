import { ErrorCode } from "../../../core/utils/error.codes";
import { makeKit, user, type Kit } from "./o2o-test-kit";

async function readyOrder(kit: Kit) {
  const { shop, owner } = await kit.shop();
  const { customer, orderId } = await kit.quotedOrder(shop.id);
  const { pin } = await kit.services.orderActions.submit(customer, orderId);
  await kit.services.partner.act(owner, orderId, "ACCEPT");
  await kit.services.partner.act(owner, orderId, "START_PRINTING");
  await kit.services.partner.act(owner, orderId, "MARK_READY");
  return { shop, owner, customer, orderId, pin };
}

const wrong = (pin: string) => String((Number(pin) + 1) % 1_000_000).padStart(6, "0");

describe("PartnerOrdersService (chủ tiệm)", () => {
  it("IR-11/IR-08: tải tệp khi PENDING → 403 O2O_006; sau khi nhận → URL ký + audit print.file-download", async () => {
    const kit = makeKit();
    const { shop, owner } = await kit.shop();
    const { customer, orderId } = await kit.quotedOrder(shop.id);
    await kit.services.orderActions.submit(customer, orderId);
    await expect(kit.services.partner.file(owner, orderId)).rejects.toMatchObject({ errorCode: ErrorCode.O2O_006, statusCode: 403 });

    const accepted = await kit.services.partner.act(owner, orderId, "ACCEPT");
    expect(accepted.partnerActions).toMatchObject({ canDownload: true, canStartPrinting: true });
    const file = await kit.services.partner.file(owner, orderId);
    expect(file).toMatchObject({ url: expect.stringContaining("https://files.test/"), fileName: "bai-tap.pdf" });
    expect(kit.audits.at(-1)).toMatchObject({ action: "print.file-download", targetId: orderId });
    expect(kit.notifications.at(-1)).toMatchObject({ type: "print-order.accepted", recipients: [{ userId: customer.id }] });
  });

  it("IR-13: chủ tiệm A xem/thao tác đơn tiệm B → 404; đơn chưa gửi cũng 404", async () => {
    const kit = makeKit();
    const a = await kit.shop();
    const b = await kit.shop();
    const { customer, orderId } = await kit.quotedOrder(b.shop.id);
    await expect(kit.services.partner.get(b.owner, orderId)).rejects.toMatchObject({ errorCode: ErrorCode.PERM_404 });
    await kit.services.orderActions.submit(customer, orderId);
    await expect(kit.services.partner.get(a.owner, orderId)).rejects.toMatchObject({ errorCode: ErrorCode.PERM_404 });
    await expect(kit.services.partner.act(a.owner, orderId, "ACCEPT")).rejects.toMatchObject({ errorCode: ErrorCode.PERM_404 });
    expect((await kit.services.partner.list(a.owner, { limit: 20 })).data).toEqual([]);
    expect((await kit.services.partner.list(b.owner, { limit: 20 })).data.map((o) => o.id)).toEqual([orderId]);
  });

  it("IR-09: sai PIN 5 lần → khoá 15 phút (O2O_008, kể cả PIN đúng); hết khoá, PIN đúng → PICKED_UP + đã thu tiền + báo khách", async () => {
    const kit = makeKit();
    const { owner, customer, orderId, pin } = await readyOrder(kit);
    for (let left = 4; left >= 1; left -= 1) {
      await expect(kit.services.partner.pickup(owner, orderId, { pin: wrong(pin), markPaid: true })).rejects.toMatchObject({
        errorCode: ErrorCode.O2O_007,
        details: { attemptsLeft: left },
      });
    }
    await expect(kit.services.partner.pickup(owner, orderId, { pin: wrong(pin), markPaid: true })).rejects.toMatchObject({
      errorCode: ErrorCode.O2O_008,
      statusCode: 423,
      details: { retryAfterSeconds: 900 },
    });
    await expect(kit.services.partner.pickup(owner, orderId, { pin, markPaid: true })).rejects.toMatchObject({ errorCode: ErrorCode.O2O_008 });

    kit.advance(15 * 60_000 + 1);
    const done = await kit.services.partner.pickup(owner, orderId, { pin, markPaid: true });
    expect(done).toMatchObject({ status: "PICKED_UP", payment: { status: "PAID" } });
    expect(kit.notifications.at(-1)).toMatchObject({ type: "print-order.picked-up", recipients: [{ userId: customer.id }] });
    await expect(kit.services.partner.file(owner, orderId)).rejects.toMatchObject({ errorCode: ErrorCode.O2O_006 });
  });

  it("giao không thu tiền rồi đánh dấu đã thu (idempotent); từ chối cần lý do và báo khách", async () => {
    const kit = makeKit();
    const { owner, orderId, pin } = await readyOrder(kit);
    const picked = await kit.services.partner.pickup(owner, orderId, { pin, markPaid: false });
    expect(picked.payment.status).toBe("UNPAID");
    expect((await kit.services.partner.markPaid(owner, orderId)).payment.status).toBe("PAID");
    expect((await kit.services.partner.markPaid(owner, orderId)).payment.status).toBe("PAID");

    const { shop, owner: o2 } = await kit.shop();
    const { customer, orderId: id2 } = await kit.quotedOrder(shop.id);
    await kit.services.orderActions.submit(customer, id2);
    const rejected = await kit.services.partner.reject(o2, id2, "Hết giấy A4");
    expect(rejected).toMatchObject({ status: "REJECTED", rejectReason: "Hết giấy A4" });
    expect(kit.notifications.at(-1)).toMatchObject({ type: "print-order.rejected", recipients: [{ userId: customer.id }] });
  });

  it("chuyển sai trạng thái → O2O_004 (in khi chưa nhận, sẵn sàng khi chưa in)", async () => {
    const kit = makeKit();
    const { shop, owner } = await kit.shop();
    const { customer, orderId } = await kit.quotedOrder(shop.id);
    await kit.services.orderActions.submit(customer, orderId);
    await expect(kit.services.partner.act(owner, orderId, "START_PRINTING")).rejects.toMatchObject({ errorCode: ErrorCode.O2O_004 });
    await expect(kit.services.partner.act(owner, orderId, "MARK_READY")).rejects.toMatchObject({ errorCode: ErrorCode.O2O_004 });
    expect(user().id).not.toBe(owner.id);
  });
});
