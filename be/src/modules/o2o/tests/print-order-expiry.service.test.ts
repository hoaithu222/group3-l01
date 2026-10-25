import { clearAssetTargetReadResolvers, getAssetTargetReadResolver } from "../../../shared/ports/asset-target-access.port";
import { clearDataPermissionProviders, resolveDataPermissions } from "../../../core/permission/data-permissions";
import { registerO2oIntegrations } from "../services/o2o-integrations";
import { makeKit, user } from "./o2o-test-kit";

const HOUR = 3_600_000;

describe("PrintOrderExpiryService (cron print.order-expire) + resolver tệp PRINT_ORDER", () => {
  afterEach(() => {
    clearAssetTargetReadResolvers();
    clearDataPermissionProviders();
  });

  it("IR-14: READY quá 7 ngày → EXPIRED + báo khách + tiệm; nhắc sắp hết hạn đúng MỘT lần; tiệm mất quyền tệp sau 24 h", async () => {
    const kit = makeKit();
    registerO2oIntegrations(kit.deps);
    const { shop, owner } = await kit.shop();
    const { customer, orderId, asset } = await kit.quotedOrder(shop.id);
    await kit.services.orderActions.submit(customer, orderId);
    await kit.services.partner.act(owner, orderId, "ACCEPT");
    await kit.services.partner.act(owner, orderId, "START_PRINTING");
    await kit.services.partner.act(owner, orderId, "MARK_READY");
    const resolver = getAssetTargetReadResolver("PRINT_ORDER")!;
    const link = { assetId: asset.id, targetType: "PRINT_ORDER", targetId: orderId, scopeType: "NONE", scopeId: null };
    expect(await resolver.canRead(owner, link)).toBe(true);
    expect(await resolver.canRead(user(), link)).toBe(false);

    kit.advance(6 * 24 * HOUR + HOUR);
    expect(await kit.services.expiry.tick()).toMatchObject({ expiringNotified: 1, expiredReady: 0 });
    expect(kit.notifications.at(-1)).toMatchObject({ type: "print-order.expiring", recipients: [{ userId: customer.id }] });
    expect(await kit.services.expiry.tick()).toMatchObject({ expiringNotified: 0 });

    kit.advance(24 * HOUR);
    expect(await kit.services.expiry.tick()).toMatchObject({ expiredReady: 1 });
    const expired = (await kit.deps.orders.findById(orderId))!;
    expect(expired.status).toBe("EXPIRED");
    expect(kit.notifications.at(-1)).toMatchObject({
      type: "print-order.expired",
      recipients: expect.arrayContaining([{ userId: customer.id }, { userId: owner.id }]),
    });
    expect(await resolver.canRead(owner, link)).toBe(true); // còn trong 24 h ân hạn
    kit.advance(24 * HOUR + 1);
    expect(await resolver.canRead(owner, link)).toBe(false);
    expect(await resolver.canRead(customer, link)).toBe(false);
  });

  it("PENDING quá 24 h → EXPIRED; đơn nháp bỏ dở quá 72 h → CANCELLED (không thông báo)", async () => {
    const kit = makeKit();
    const { shop } = await kit.shop();
    const pending = await kit.quotedOrder(shop.id);
    await kit.services.orderActions.submit(pending.customer, pending.orderId);
    const draft = await kit.quotedOrder(shop.id);
    const before = kit.notifications.length;
    kit.advance(25 * HOUR);
    expect(await kit.services.expiry.tick()).toMatchObject({ expiredPending: 1, abandoned: 0 });
    expect(kit.notifications.length).toBe(before + 1);
    kit.advance(48 * HOUR);
    expect(await kit.services.expiry.tick()).toMatchObject({ abandoned: 1 });
    expect((await kit.deps.orders.findById(draft.orderId))!.status).toBe("CANCELLED");
    expect(kit.notifications.length).toBe(before + 1);
  });

  it("tiệm KHÔNG đọc được tệp trước khi nhận đơn (IR-08) — resolver; provider partner:* theo tiệm APPROVED", async () => {
    const kit = makeKit();
    registerO2oIntegrations(kit.deps);
    const { shop, owner } = await kit.shop();
    const { customer, orderId, asset } = await kit.quotedOrder(shop.id);
    await kit.services.orderActions.submit(customer, orderId);
    const link = { assetId: asset.id, targetType: "PRINT_ORDER", targetId: orderId, scopeType: "NONE", scopeId: null };
    expect(await getAssetTargetReadResolver("PRINT_ORDER")!.canRead(owner, link)).toBe(false);
    expect(await getAssetTargetReadResolver("PRINT_ORDER")!.canRead(customer, link)).toBe(true);

    expect(await resolveDataPermissions(owner.id)).toEqual(["partner:view", "partner:update"]);
    expect(await resolveDataPermissions(customer.id)).toEqual([]);
  });
});
