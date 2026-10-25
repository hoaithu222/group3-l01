import { ErrorCode } from "../../../core/utils/error.codes";
import { makeKit, PRICES, user } from "./o2o-test-kit";

const admin = () => user(undefined, "admin");
const caps = { color: true, duplex: true, a3: false, binding: false };

describe("Admin O2O (địa điểm, tiệm, đơn)", () => {
  it("tạo tiệm: chủ tiệm theo email (O2O_009), chỉ địa điểm PRINT_SHOP chưa có tiệm (O2O_013); duyệt → xoá cache quyền partner", async () => {
    const kit = makeKit();
    const ops = admin();
    const owner = kit.directory.addUser();
    const loc = await kit.services.adminLocations.create(ops, { name: "Photo Minh", address: "12 Tạ Quang Bửu", lat: 21, lng: 105.8, type: "PRINT_SHOP", amenities: [], openHours: [], photoAssetIds: [] });
    const cafe = await kit.services.adminLocations.create(ops, { name: "Cà phê", address: "Hà Nội", lat: 21, lng: 105.8, type: "CAFE", amenities: ["wifi_fast"], openHours: [], photoAssetIds: [] });
    const body = { locationId: loc.id, ownerEmail: owner.email, displayName: "Photo Minh", priceTable: PRICES, capabilities: caps };

    await expect(kit.services.adminShops.create(ops, { ...body, ownerEmail: "khong-co@e.com" })).rejects.toMatchObject({ errorCode: ErrorCode.O2O_009 });
    await expect(kit.services.adminShops.create(ops, { ...body, locationId: cafe.id })).rejects.toMatchObject({ errorCode: ErrorCode.O2O_013 });
    const shop = await kit.services.adminShops.create(ops, body);
    expect(shop).toMatchObject({ status: "PENDING", owner: { id: owner.id, email: owner.email }, orders30d: 0 });
    await expect(kit.services.adminShops.create(ops, body)).rejects.toMatchObject({ errorCode: ErrorCode.O2O_013 });

    const approved = await kit.services.adminShops.approve(ops, shop.id, "Đã kiểm tra giấy phép kinh doanh");
    expect(approved.status).toBe("APPROVED");
    expect(kit.invalidated).toEqual([owner.id]);
    expect(kit.audits.map((a) => a.action)).toEqual(expect.arrayContaining(["o2o.location-create", "print.shop-create", "print.shop-approve"]));
  });

  it("tạm ngưng tiệm: đơn PENDING tự REJECTED 'Tiệm tạm ngưng' + báo khách; chi tiết nêu số đơn ảnh hưởng", async () => {
    const kit = makeKit();
    const { shop } = await kit.shop();
    const a = await kit.quotedOrder(shop.id);
    await kit.services.orderActions.submit(a.customer, a.orderId);
    expect((await kit.services.adminShops.get(admin(), shop.id)).pendingOrders).toBe(1);
    const r = await kit.services.adminShops.suspend(admin(), shop.id, "Vi phạm chất lượng in nhiều lần");
    expect(r).toMatchObject({ status: "SUSPENDED", rejectedOrders: 1 });
    expect((await kit.deps.orders.findById(a.orderId))!).toMatchObject({ status: "REJECTED", rejectReason: "Tiệm tạm ngưng" });
    expect(kit.notifications.at(-1)).toMatchObject({ type: "print-order.rejected", recipients: [{ userId: a.customer.id }] });
  });

  it("sửa bảng giá cần đúng version (RES_003) và tăng version; huỷ đơn bởi vận hành có audit + báo cả hai bên", async () => {
    const kit = makeKit();
    const { shop, owner } = await kit.shop();
    const cur = await kit.services.adminShops.get(admin(), shop.id);
    await expect(kit.services.adminShops.update(admin(), shop.id, { priceTable: PRICES, expectedVersion: cur.version + 5 })).rejects.toMatchObject({ errorCode: ErrorCode.RES_003 });
    const next = await kit.services.adminShops.update(admin(), shop.id, { priceTable: { ...PRICES, a4Bw: 700 }, reason: "Tăng giá giấy", expectedVersion: cur.version });
    expect(next).toMatchObject({ version: cur.version + 1, priceTable: { a4Bw: 700 } });

    const o = await kit.quotedOrder(shop.id);
    await kit.services.orderActions.submit(o.customer, o.orderId);
    const cancelled = await kit.services.adminOrders.cancel(admin(), o.orderId, "Khách khiếu nại trùng đơn");
    expect(cancelled).toMatchObject({ status: "CANCELLED", adminActions: { canCancel: false } });
    expect(JSON.stringify(cancelled)).not.toMatch(/pinHash|pin"/);
    expect(kit.audits.at(-1)).toMatchObject({ action: "print.order-cancel-admin", targetId: o.orderId });
    expect(kit.notifications.at(-1)?.recipients).toEqual(expect.arrayContaining([{ userId: o.customer.id }, { userId: owner.id }]));
  });

  it("địa điểm: ảnh qua AssetLink LOCATION_PHOTO (chỉ ảnh), sửa theo version, ẩn/hiện có audit", async () => {
    const kit = makeKit();
    const ops = admin();
    const photo = kit.assets.add(ops.id, { kind: "IMAGE", mime: "image/jpeg", scope: "LOCATION" });
    const pdf = kit.assets.add(ops.id);
    const base = { name: "Thư viện Tạ Quang Bửu", address: "Bách Khoa", lat: 21.004, lng: 105.846, type: "LIBRARY" as const, amenities: ["quiet_zone" as const], openHours: [] };
    await expect(kit.services.adminLocations.create(ops, { ...base, photoAssetIds: [pdf.id] })).rejects.toMatchObject({ errorCode: ErrorCode.O2O_003 });
    const loc = await kit.services.adminLocations.create(ops, { ...base, photoAssetIds: [photo.id] });
    expect(kit.assets.links.at(-1)).toMatchObject({ targetType: "LOCATION_PHOTO", scopeType: "USER", assetIds: [photo.id] });

    const updated = await kit.services.adminLocations.update(ops, loc.id, { photoAssetIds: [], name: "Thư viện TQB", expectedVersion: loc.version });
    expect(updated).toMatchObject({ name: "Thư viện TQB", photoAssetIds: [] });
    expect(kit.assets.detached.at(-1)).toMatchObject({ targetType: "LOCATION_PHOTO", assetIds: [photo.id] });
    const hidden = await kit.services.adminLocations.setHidden(ops, loc.id, true, "Đóng cửa sửa chữa dài hạn");
    expect(hidden).toMatchObject({ status: "HIDDEN", hiddenReason: "Đóng cửa sửa chữa dài hạn" });
  });
});
