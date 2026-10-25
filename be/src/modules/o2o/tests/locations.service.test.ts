import { ErrorCode } from "../../../core/utils/error.codes";
import { offsetNorth } from "../domain/geo";
import { makeKit, user } from "./o2o-test-kit";

const CENTER = { lat: 21.0285, lng: 105.8542 };

describe("LocationsService (người dùng)", () => {
  async function seed(kit: ReturnType<typeof makeKit>, meters: number, over: Partial<{ type: "CAFE" | "PRINT_SHOP" | "LIBRARY"; amenities: string[] }> = {}) {
    const p = offsetNorth(CENTER, meters);
    return kit.deps.locations.create({
      name: `Điểm ${meters}m`,
      normalizedName: `diem ${meters}m`,
      address: "Hà Nội",
      lat: p.lat,
      lng: p.lng,
      type: over.type ?? "CAFE",
      amenities: over.amenities ?? [],
      openHours: [{ day: 5, open: "07:00", close: "22:00" }],
      photoAssetIds: [],
      createdBy: "000000000000000000000000",
    });
  }

  it("gần tôi: theo khoảng cách, trong bán kính, bỏ HIDDEN, lọc loại + tiện ích + đang mở", async () => {
    const kit = makeKit(new Date("2026-09-25T03:00:00Z")); // Thứ Sáu 10:00 ICT
    await seed(kit, 1500, { amenities: ["wifi_fast", "quiet_zone"] });
    await seed(kit, 300, { amenities: ["wifi_fast"] });
    const hidden = await seed(kit, 100);
    await kit.deps.locations.setStatus(hidden.id, "HIDDEN", "Đóng cửa");
    await seed(kit, 5000);
    await seed(kit, 800, { type: "LIBRARY" });

    const base = { lat: CENTER.lat, lng: CENTER.lng, radiusM: 2000, limit: 50 };
    const all = await kit.services.locations.near(base);
    expect(all.map((l) => l.name)).toEqual(["Điểm 300m", "Điểm 800m", "Điểm 1500m"]);
    expect(all[0]).toMatchObject({ distanceM: expect.any(Number), openNow: true, shop: null });
    expect(Math.abs(all[0].distanceM - 300)).toBeLessThan(2);

    expect((await kit.services.locations.near({ ...base, type: "CAFE", amenities: ["wifi_fast", "quiet_zone"] })).map((l) => l.name)).toEqual(["Điểm 1500m"]);
    kit.advance(13 * 3_600_000); // 23:00 ICT
    expect(await kit.services.locations.near({ ...base, openNow: true })).toEqual([]);
  });

  it("đánh giá: 1 người/địa điểm (ghi đè), điểm TB cập nhật; địa điểm ẩn → O2O_010", async () => {
    const kit = makeKit();
    const loc = await seed(kit, 100);
    const a = user(kit.directory.addUser().id);
    const b = user(kit.directory.addUser().id);
    await kit.services.locations.upsertReview(a, loc.id, { rating: 5, noise: 1, comment: "Yên tĩnh" });
    await kit.services.locations.upsertReview(a, loc.id, { rating: 4, noise: 2 });
    const r = await kit.services.locations.upsertReview(b, loc.id, { rating: 2, noise: 4 });
    expect(r.location).toMatchObject({ ratingAvg: 3, ratingCount: 2, noiseAvg: 3 });

    const detail = await kit.services.locations.detail(a, loc.id);
    expect(detail.myReview).toMatchObject({ rating: 4, mine: true });
    expect(detail.recentReviews).toHaveLength(2);
    expect((await kit.services.locations.deleteReview(b, loc.id)).location).toMatchObject({ ratingCount: 1, ratingAvg: 4 });

    await kit.deps.locations.setStatus(loc.id, "HIDDEN", "Vi phạm");
    await expect(kit.services.locations.detail(a, loc.id)).rejects.toMatchObject({ errorCode: ErrorCode.O2O_010, statusCode: 404 });
  });

  it("chi tiết tiệm in: chỉ hiện tiệm APPROVED kèm bảng giá; báo giá thử không lưu", async () => {
    const kit = makeKit();
    const { shop, location } = await kit.shop();
    const detail = await kit.services.locations.detail(user(), location.id);
    expect(detail.shop).toMatchObject({ id: shop.id, acceptingOrders: true, priceTable: { a4Color: 2000 } });
    const q = await kit.services.shops.quote(shop.id, { pages: 12, settings: { paper: "A4", color: true, copies: 1, duplex: true, binding: false } });
    expect(q.total).toBe(21_600);
    await kit.deps.shops.setStatus(shop.id, ["APPROVED"], { status: "SUSPENDED" });
    expect((await kit.services.locations.detail(user(), location.id)).shop).toBeNull();
    await expect(kit.services.shops.getPublic(shop.id)).rejects.toMatchObject({ errorCode: ErrorCode.PERM_404 });
  });
});
