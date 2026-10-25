import { ErrorCode } from "../../../core/utils/error.codes";
import { newObjectId } from "../../../core/utils/object-id";
import { makeKit, makePdf, user } from "./o2o-test-kit";

const settings = { paper: "A4" as "A4" | "A3", color: true, copies: 1, duplex: true, binding: false };

describe("PrintOrdersService + PrintOrderActionsService (chủ đơn)", () => {
  it("tạo đơn UPLOAD → DRAFT + AssetLink PRINT_ORDER + outbox đếm trang; job → QUOTED với báo giá", async () => {
    const kit = makeKit();
    const { shop } = await kit.shop();
    const me = user(kit.directory.addUser().id);
    const asset = kit.assets.add(me.id);
    const draft = await kit.services.orders.create(me, { shopId: shop.id, source: { kind: "UPLOAD", assetId: asset.id }, settings });
    expect(draft).toMatchObject({ status: "DRAFT", code: expect.stringMatching(/^PO-/), pages: null, hasPin: false });
    expect(kit.assets.links).toEqual([expect.objectContaining({ targetType: "PRINT_ORDER", targetId: draft.id, scopeType: "NONE", foreign: false })]);
    expect(kit.outbox.events.map((e) => e.jobName)).toEqual(["print.count-pages"]);

    const counted = await kit.services.pageCount.handle({ orderId: draft.id, assetId: asset.id });
    expect(counted).toMatchObject({ status: "QUOTED", pages: 12, quote: { total: 21_600 } });
    // Chạy lại job (retry) vô hại.
    expect(await kit.services.pageCount.handle({ orderId: draft.id, assetId: asset.id })).toBeNull();
  });

  it("tạo đơn RESOURCE: cần quyền đọc tài liệu (404 trung tính) và snapshot asset hiện tại", async () => {
    const kit = makeKit();
    const { shop } = await kit.shop();
    const me = user(kit.directory.addUser().id);
    const uploader = kit.directory.addUser();
    const asset = kit.assets.add(uploader.id, { scope: "RESOURCE" });
    const wsId = newObjectId();
    const resourceId = newObjectId();
    kit.directory.resources.set(resourceId, { id: resourceId, workspaceId: wsId, assetId: asset.id, name: "Báo cáo nhóm.pdf", mime: "application/pdf", deleted: false });
    const input = { shopId: shop.id, source: { kind: "RESOURCE" as const, resourceId } };

    await expect(kit.services.orders.create(me, input)).rejects.toMatchObject({ errorCode: ErrorCode.PERM_404 });
    kit.access.readers.add(`${wsId}:${me.id}`);
    const order = await kit.services.orders.create(me, input);
    expect(order).toMatchObject({ fileName: "Báo cáo nhóm.pdf", source: { kind: "RESOURCE", resourceId } });
    expect(kit.assets.links[0]).toMatchObject({ assetIds: [asset.id], foreign: true });
  });

  it("tệp không phải PDF / chưa READY → O2O_003; tiệm tắt nhận đơn → O2O_001; vượt năng lực → O2O_002", async () => {
    const kit = makeKit();
    const { shop } = await kit.shop({ capabilities: { a3: false } });
    const me = user(kit.directory.addUser().id);
    const docx = kit.assets.add(me.id, { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const pending = kit.assets.add(me.id, { status: "PROCESSING" });
    const ok = kit.assets.add(me.id);
    const create = (assetId: string, s = settings) => kit.services.orders.create(me, { shopId: shop.id, source: { kind: "UPLOAD", assetId }, settings: s });

    await expect(create(docx.id)).rejects.toMatchObject({ errorCode: ErrorCode.O2O_003 });
    await expect(create(pending.id)).rejects.toMatchObject({ errorCode: ErrorCode.O2O_003 });
    await expect(create(ok.id, { ...settings, paper: "A3" as "A4" | "A3" })).rejects.toMatchObject({ errorCode: ErrorCode.O2O_002, details: { field: "paper" } });
    await kit.deps.shops.setAccepting(shop.id, shop.ownerUserId, false);
    await expect(create(ok.id)).rejects.toMatchObject({ errorCode: ErrorCode.O2O_001 });
  });

  it("tệp vượt 500 trang → DRAFT + O2O_011; gửi bị chặn với đúng mã", async () => {
    const kit = makeKit();
    const { shop } = await kit.shop();
    const me = user(kit.directory.addUser().id);
    const big = kit.assets.add(me.id, {}, makePdf(501));
    const draft = await kit.services.orders.create(me, { shopId: shop.id, source: { kind: "UPLOAD", assetId: big.id } });
    await kit.services.pageCount.handle({ orderId: draft.id, assetId: big.id });
    expect(await kit.services.orders.get(me, draft.id)).toMatchObject({ status: "DRAFT", pages: 501, pageCountError: ErrorCode.O2O_011 });
    await expect(kit.services.orderActions.submit(me, draft.id)).rejects.toMatchObject({ errorCode: ErrorCode.O2O_011 });
  });

  it("IR-08: gửi → PENDING, PIN 6 số trả MỘT lần, báo giá đúng bảng giá, chủ tiệm nhận thông báo + partner:order", async () => {
    const kit = makeKit();
    const { shop, owner } = await kit.shop();
    const { customer, orderId } = await kit.quotedOrder(shop.id, 12);
    const { order, pin } = await kit.services.orderActions.submit(customer, orderId);
    expect(pin).toMatch(/^\d{6}$/);
    expect(order).toMatchObject({ status: "PENDING", hasPin: true, quote: { printablePages: 12, unitPrice: 2000, subtotal: 24_000, duplexDiscount: 2_400, total: 21_600 } });
    expect(JSON.stringify(order)).not.toContain(pin);
    expect(kit.notifications.at(-1)).toMatchObject({ type: "print-order.new", recipients: [{ userId: owner.id }] });
    expect(kit.outbox.events.at(-1)?.payload).toMatchObject({ status: "PENDING", partnerNew: true, submitted: true });
    // Đơn đã gửi không sửa cấu hình được nữa.
    await expect(kit.services.orders.update(customer, orderId, { settings, expectedVersion: order.version })).rejects.toMatchObject({ errorCode: ErrorCode.O2O_004 });
  });

  it("sửa cấu hình (QUOTED): báo giá lại theo khoảng trang; version lệch → RES_003; khoảng trang vượt → O2O_012", async () => {
    const kit = makeKit();
    const { shop } = await kit.shop();
    const { customer, orderId } = await kit.quotedOrder(shop.id, 12);
    const cur = await kit.services.orders.get(customer, orderId);
    const next = await kit.services.orders.update(customer, orderId, { settings: { ...settings, pageRange: "1-4", copies: 2 }, expectedVersion: cur.version });
    expect(next.quote).toMatchObject({ printablePages: 4, subtotal: 16_000, total: 14_400 });
    await expect(kit.services.orders.update(customer, orderId, { settings, expectedVersion: cur.version })).rejects.toMatchObject({ errorCode: ErrorCode.RES_003 });
    await expect(kit.services.orders.update(customer, orderId, { settings: { ...settings, pageRange: "10-20" }, expectedVersion: next.version })).rejects.toMatchObject({ errorCode: ErrorCode.O2O_012 });
  });

  it("IR-15: tiệm đổi bảng giá SAU khi khách gửi → báo giá của đơn đã gửi không đổi", async () => {
    const kit = makeKit();
    const { shop } = await kit.shop();
    const { customer, orderId } = await kit.quotedOrder(shop.id, 12);
    const { order } = await kit.services.orderActions.submit(customer, orderId);
    const current = (await kit.deps.shops.findById(shop.id))!;
    await kit.deps.shops.update(shop.id, current.version, { priceTable: { ...current.priceTable, a4Color: 9_999 } });
    expect((await kit.services.orders.get(customer, orderId)).quote).toEqual(order.quote);
  });

  it("IR-12: khách huỷ khi PRINTING → O2O_004; huỷ khi PENDING → CANCELLED + báo tiệm; tạo PIN mới vô hiệu PIN cũ", async () => {
    const kit = makeKit();
    const { shop, owner } = await kit.shop();
    const a = await kit.quotedOrder(shop.id);
    await kit.services.orderActions.submit(a.customer, a.orderId);
    await kit.services.partner.act(owner, a.orderId, "ACCEPT");
    await kit.services.partner.act(owner, a.orderId, "START_PRINTING");
    await expect(kit.services.orderActions.cancel(a.customer, a.orderId, {})).rejects.toMatchObject({ errorCode: ErrorCode.O2O_004 });

    const b = await kit.quotedOrder(shop.id);
    const { pin: oldPin } = await kit.services.orderActions.submit(b.customer, b.orderId);
    const { pin: newPin } = await kit.services.orderActions.regeneratePin(b.customer, b.orderId);
    const stored = (await kit.deps.orders.findById(b.orderId))!;
    const { verifyPin } = await import("../domain/pickup-pin");
    expect(verifyPin(b.orderId, newPin, stored.pinHash)).toBe(true);
    if (oldPin !== newPin) expect(verifyPin(b.orderId, oldPin, stored.pinHash)).toBe(false);
    const cancelled = await kit.services.orderActions.cancel(b.customer, b.orderId, { reason: "Đổi ý" });
    expect(cancelled).toMatchObject({ status: "CANCELLED", cancelReason: "Đổi ý" });
    expect(kit.notifications.at(-1)).toMatchObject({ type: "print-order.cancelled", recipients: [{ userId: owner.id }] });
  });

  it("đơn của người khác → 404 trung tính", async () => {
    const kit = makeKit();
    const { shop } = await kit.shop();
    const { orderId } = await kit.quotedOrder(shop.id);
    await expect(kit.services.orders.get(user(), orderId)).rejects.toMatchObject({ errorCode: ErrorCode.PERM_404 });
  });
});
