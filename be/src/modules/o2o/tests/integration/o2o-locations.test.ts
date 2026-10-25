import { installMocks, redisStore } from "./o2o-test-mocks";
import { buildO2oApp, cleanupO2o, created, makeApi, seedUser } from "./o2o-test-kit";
import { prisma } from "../../../../infrastructure/database";
import { ensureManualIndexes } from "../../../../infrastructure/database/manual-indexes";
import { offsetNorth } from "../../domain/geo";

const app = buildO2oApp();
const api = makeApi(app);
// Tâm lệch khỏi tâm mặc định để không lẫn với địa điểm của suite khác trên cùng DB memory.
const CENTER = { lat: 10.7626, lng: 106.6601 };

describe("o2o — địa điểm (integration, Mongo memory + 2dsphere)", () => {
  beforeAll(async () => {
    await ensureManualIndexes((command) => prisma.$runCommandRaw(command as Parameters<typeof prisma.$runCommandRaw>[0]));
  });
  beforeEach(() => installMocks());
  afterEach(async () => {
    await cleanupO2o();
    redisStore.clear();
  });

  it("IR-07: 60 địa điểm, bán kính 2 km → ≤ 50 kết quả theo khoảng cách tăng dần, có distanceM, bỏ HIDDEN/ngoài bán kính", async () => {
    const opsId = await seedUser("admin");
    const me = await seedUser();
    // 55 điểm trong 2 km (35 m … 1925 m) + 5 điểm ngoài (2,5–4,5 km); 1 điểm trong bán kính bị ẩn.
    const distances = [...Array.from({ length: 55 }, (_, i) => 35 * (i + 1)), 2500, 3000, 3500, 4000, 4500];
    const rows = await Promise.all(
      distances.map((d, i) => {
        const p = offsetNorth(CENTER, d);
        return prisma.location.create({
          data: { name: `Quán ${d}`, normalizedName: `quan ${d}`, address: "Q.10", geo: { type: "Point", coordinates: [p.lng, p.lat] }, type: i % 3 === 0 ? "PRINT_SHOP" : "CAFE", amenities: ["wifi_fast"], openHours: [], photoAssetIds: [], status: i === 2 ? "HIDDEN" : "ACTIVE", hiddenReason: null, createdBy: opsId },
        });
      })
    );
    created.locations.push(...rows.map((r) => r.id));

    const res = await api("get", `/locations/near?lat=${CENTER.lat}&lng=${CENTER.lng}&radiusM=2000`, me);
    expect(res.status).toBe(200);
    const items = res.body.data as Array<{ name: string; distanceM: number; type: string; shop: unknown }>;
    expect(items).toHaveLength(50);
    expect(items.every((l) => typeof l.distanceM === "number" && l.distanceM <= 2000)).toBe(true);
    expect(items.map((l) => l.distanceM)).toEqual([...items.map((l) => l.distanceM)].sort((a, b) => a - b));
    expect(items[0]).toMatchObject({ name: "Quán 35", shop: null });
    expect(items.map((l) => l.name)).not.toContain("Quán 105"); // HIDDEN
    expect(Math.abs(items[0].distanceM - 35)).toBeLessThanOrEqual(2);

    const printShops = await api("get", `/locations/near?lat=${CENTER.lat}&lng=${CENTER.lng}&radiusM=10000&type=PRINT_SHOP`, me);
    expect(printShops.body.data.every((l: { type: string }) => l.type === "PRINT_SHOP")).toBe(true);
    expect((await api("get", `/locations/near?lat=${CENTER.lat}&lng=${CENTER.lng}&radiusM=20000`, me)).status).toBe(400);
  });

  it("chi tiết + đánh giá qua API: 1 người/địa điểm, điểm TB cập nhật trong transaction; vận hành ẩn đánh giá → TB tính lại", async () => {
    const opsId = await seedUser("admin");
    const a = await seedUser();
    const b = await seedUser();
    const loc = await api("post", "/admin/locations", opsId, { name: "Cà phê Sách", address: "Q.3", lat: 10.78, lng: 106.69, type: "CAFE", amenities: ["quiet_zone"], openHours: [{ day: 1, open: "07:00", close: "22:00" }] }, "admin");
    expect(loc.status).toBe(201);
    created.locations.push(loc.body.data.id);
    const id = loc.body.data.id as string;

    expect((await api("put", `/locations/${id}/reviews/me`, a, { rating: 5, noise: 1, comment: "Rất yên tĩnh" })).status).toBe(200);
    const second = await api("put", `/locations/${id}/reviews/me`, b, { rating: 3, noise: 3 });
    expect(second.body.data.location).toMatchObject({ ratingAvg: 4, ratingCount: 2, noiseAvg: 2 });
    expect((await api("put", `/locations/${id}/reviews/me`, a, { rating: 6, noise: 1 })).status).toBe(400);

    const detail = await api("get", `/locations/${id}`, a);
    expect(detail.body.data).toMatchObject({ name: "Cà phê Sách", ratingCount: 2, myReview: { rating: 5, mine: true } });

    const reviews = await api("get", `/admin/locations/${id}/reviews`, opsId, undefined, "admin");
    const bReview = reviews.body.data.find((r: { author: { id: string } }) => r.author.id === b);
    expect((await api("post", `/admin/location-reviews/${bReview.id}/hide`, opsId, { reason: "Nội dung quảng cáo spam" }, "admin")).status).toBe(200);
    expect((await api("get", `/locations/${id}`, a)).body.data).toMatchObject({ ratingAvg: 5, ratingCount: 1 });

    expect((await api("post", `/admin/locations/${id}/hide`, opsId, { reason: "Quán đã đóng cửa vĩnh viễn" }, "admin")).status).toBe(200);
    const gone = await api("get", `/locations/${id}`, a);
    expect(gone.status).toBe(404);
    expect(gone.body.error.code).toBe("O2O_010");
    // Người dùng thường không vào được API vận hành.
    expect((await api("get", "/admin/locations", a)).status).toBe(403);
  });
});
