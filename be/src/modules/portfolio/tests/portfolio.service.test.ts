import { LIMITS } from "../../../core/constants/limits";
import type { UpdatePortfolioDto } from "../dtos";
import { buildHarness, publishedFixture, seedUser, tinyPng, type Harness } from "./support/harness";
import { newObjectId } from "../../../core/utils/object-id";

/** Hồ sơ (tạo lười, CAS version), đổi slug (CR-34 phần ghi), mẫu, slug-available, hasUnpublishedChanges. */
let h: Harness;
let me: string;

const dto = (over: Partial<UpdatePortfolioDto> = {}): UpdatePortfolioDto => ({
  displayName: "Nguyễn Văn An",
  headline: "Lập trình viên",
  bio: "Xin chào",
  avatarAssetId: null,
  links: [{ label: "GitHub", url: "https://github.com/an-dev" }],
  theme: { template: "DEVELOPER", accent: "BLUE" },
  sections: [
    { kind: "ABOUT", visible: true, order: 0 },
    { kind: "PROJECTS", visible: true, order: 1 },
    { kind: "SKILLS", visible: true, order: 2 },
    { kind: "CONTACT", visible: true, order: 3 },
  ],
  seoIndexable: true,
  expectedVersion: 0,
  ...over,
});

beforeEach(() => {
  h = buildHarness();
  me = seedUser(h, "Nguyễn Văn An").id;
});

describe("update — tạo lười và CAS", () => {
  it("lần đầu (expectedVersion 0): tạo hồ sơ với đúng trường gửi lên + slug tự sinh từ tên", async () => {
    const created = await h.c.portfolio.update(me, dto());
    expect(created).toMatchObject({ displayName: "Nguyễn Văn An", headline: "Lập trình viên", theme: { template: "DEVELOPER", accent: "BLUE" }, seoIndexable: true, status: "DRAFT", version: 1, takenDown: false });
    expect(created.slug).toMatch(/^nguyen-van-an-[0-9a-f]{4}$/);
    expect(created.links).toEqual([{ label: "GitHub", url: "https://github.com/an-dev" }]);
  });

  it("chưa có hồ sơ mà gửi expectedVersion > 0 → 404", async () => {
    await expect(h.c.portfolio.update(me, dto({ expectedVersion: 3 }))).rejects.toMatchObject({ statusCode: 404 });
  });

  it("sửa: version tăng; lệch version → 409 RES_003 (details.currentVersion)", async () => {
    await h.c.portfolio.update(me, dto());
    const v2 = await h.c.portfolio.update(me, dto({ expectedVersion: 1, displayName: "An Nguyễn" }));
    expect(v2).toMatchObject({ displayName: "An Nguyễn", version: 2 });
    await expect(h.c.portfolio.update(me, dto({ expectedVersion: 1 }))).rejects.toMatchObject({ errorCode: "RES_003", statusCode: 409, details: { currentVersion: 2 } });
  });

  it("ảnh đại diện riêng: gắn link asset (PORTFOLIO), thay bằng ảnh khác, gỡ về null", async () => {
    await h.c.portfolio.update(me, dto());
    const a = newObjectId();
    const b = newObjectId();
    h.assets.images.set(a, await tinyPng());
    h.assets.images.set(b, await tinyPng("#00ff00"));
    const pf = (await h.c.portfolio.overview(me)).portfolio;
    const withA = await h.c.portfolio.update(me, dto({ expectedVersion: 1, avatarAssetId: a }));
    expect(h.assets.links).toEqual([{ targetId: pf?.id, assetId: a }]);
    await h.c.portfolio.update(me, dto({ expectedVersion: withA.version, avatarAssetId: b }));
    expect(h.assets.links).toEqual([{ targetId: pf?.id, assetId: b }]);
    await h.c.portfolio.update(me, dto({ expectedVersion: withA.version + 1, avatarAssetId: null }));
    expect(h.assets.links).toEqual([]);
    await expect(h.c.portfolio.update(me, dto({ expectedVersion: withA.version + 2, avatarAssetId: newObjectId() }))).rejects.toMatchObject({ statusCode: 404 });
  });

  it("hai người dùng khác nhau có hồ sơ và slug độc lập", async () => {
    const other = seedUser(h, "Nguyễn Văn An").id;
    const a = await h.c.portfolio.update(me, dto());
    const b = await h.c.portfolio.update(other, dto());
    expect(a.slug).not.toBe(b.slug);
    expect(a.id).not.toBe(b.id);
  });
});

describe("changeSlug (CR-34 phần ghi, CR-10)", () => {
  let pfId: string;
  beforeEach(async () => {
    const created = await h.c.portfolio.update(me, dto());
    pfId = created.id;
  });

  it("đổi slug: cập nhật slug, giữ slug cũ 30 ngày → chuyển hướng, xoá cache cả hai, version tăng", async () => {
    const before = (await h.c.portfolio.overview(me)).portfolio;
    const oldSlug = before?.slug ?? "";
    const r = await h.c.portfolio.changeSlug(me, { slug: "An-Nguyen", expectedVersion: 1 });
    expect(r).toMatchObject({ slug: "an-nguyen", version: 2 });
    const held = await h.reservations.findByKey(oldSlug);
    expect(held).toMatchObject({ portfolioId: pfId, redirectTo: "an-nguyen" });
    expect(held?.expiresAt.getTime()).toBe(new Date("2026-09-26T03:00:00.000Z").getTime() + LIMITS.portfolio.slugReserveDays * 86_400_000);
    expect(h.cache.deleted).toEqual(expect.arrayContaining([oldSlug, "an-nguyen"]));
  });

  it("CR-34: người khác KHÔNG lấy được slug cũ trong 30 ngày (PORT_001), lấy được sau khi hết hạn", async () => {
    const oldSlug = (await h.c.portfolio.overview(me)).portfolio?.slug ?? "";
    await h.c.portfolio.changeSlug(me, { slug: "an-nguyen", expectedVersion: 1 });
    const other = seedUser(h, "Người khác").id;
    await h.c.portfolio.update(other, dto());
    const otherPf = (await h.c.portfolio.overview(other)).portfolio;
    await expect(h.c.portfolio.changeSlug(other, { slug: oldSlug, expectedVersion: otherPf?.version ?? 1 })).rejects.toMatchObject({ errorCode: "PORT_001", statusCode: 409 });
    h.clock.now = new Date("2026-10-27T00:00:00.000Z");
    const ok = await h.c.portfolio.changeSlug(other, { slug: oldSlug, expectedVersion: otherPf?.version ?? 1 });
    expect(ok.slug).toBe(oldSlug);
  });

  it("đổi liên tiếp A→B→C: mọi slug cũ trỏ thẳng slug mới nhất (không chuỗi chuyển hướng)", async () => {
    const a = (await h.c.portfolio.overview(me)).portfolio?.slug ?? "";
    await h.c.portfolio.changeSlug(me, { slug: "slug-b", expectedVersion: 1 });
    await h.c.portfolio.changeSlug(me, { slug: "slug-c", expectedVersion: 2 });
    expect((await h.reservations.findByKey(a))?.redirectTo).toBe("slug-c");
    expect((await h.reservations.findByKey("slug-b"))?.redirectTo).toBe("slug-c");
  });

  it("lấy lại slug cũ của chính mình: reservation của nó bị xoá", async () => {
    const a = (await h.c.portfolio.overview(me)).portfolio?.slug ?? "";
    await h.c.portfolio.changeSlug(me, { slug: "slug-b", expectedVersion: 1 });
    await h.c.portfolio.changeSlug(me, { slug: a, expectedVersion: 2 });
    expect(await h.reservations.findByKey(a)).toBeNull();
    expect((await h.reservations.findByKey("slug-b"))?.redirectTo).toBe(a);
  });

  it.each([
    ["ab", "PORT_002", 400],
    ["a--b", "PORT_002", 400],
    ["admin", "PORT_003", 400],
  ])("slug '%s' → %s (%i)", async (slug, code, status) => {
    await expect(h.c.portfolio.changeSlug(me, { slug, expectedVersion: 1 })).rejects.toMatchObject({ errorCode: code, statusCode: status });
  });

  it("slug đang có người dùng → PORT_001 409; slug hiện tại → không đổi gì", async () => {
    const other = seedUser(h, "Khác").id;
    const o = await h.c.portfolio.update(other, dto());
    await expect(h.c.portfolio.changeSlug(me, { slug: o.slug, expectedVersion: 1 })).rejects.toMatchObject({ errorCode: "PORT_001" });
    const cur = (await h.c.portfolio.overview(me)).portfolio;
    expect((await h.c.portfolio.changeSlug(me, { slug: cur?.slug ?? "", expectedVersion: 1 })).version).toBe(1);
  });

  it("version lệch → RES_003; chưa có hồ sơ → 404", async () => {
    await expect(h.c.portfolio.changeSlug(me, { slug: "slug-b", expectedVersion: 9 })).rejects.toMatchObject({ errorCode: "RES_003" });
    await expect(h.c.portfolio.changeSlug(seedUser(h, "Mới").id, { slug: "slug-b", expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("đang PUBLISHED: đổi slug xếp thêm một build (trang chứa slug ở canonical/ảnh)", async () => {
    const fx = await publishedFixture(h, { name: "Trần B" });
    const before = h.outbox.byJob("portfolio.build").length;
    await h.c.portfolio.changeSlug(fx.user.id, { slug: "tran-b-moi", expectedVersion: (await h.c.portfolio.overview(fx.user.id)).portfolio?.version ?? 1 });
    expect(h.outbox.byJob("portfolio.build")).toHaveLength(before + 1);
  });
});

describe("slugAvailability / templates / overview", () => {
  it("slug-available: available / INVALID / RESERVED / BANNED / TAKEN; slug của chính mình → available", async () => {
    const mine = await h.c.portfolio.update(me, dto());
    h.config.banned = ["cam"];
    expect(await h.c.portfolio.slugAvailability(me, "an-moi")).toEqual({ available: true });
    expect(await h.c.portfolio.slugAvailability(me, "a")).toEqual({ available: false, reason: "INVALID" });
    expect(await h.c.portfolio.slugAvailability(me, "admin")).toEqual({ available: false, reason: "RESERVED" });
    expect(await h.c.portfolio.slugAvailability(me, "an-cam-do")).toEqual({ available: false, reason: "BANNED" });
    expect(await h.c.portfolio.slugAvailability(me, mine.slug)).toEqual({ available: true });
    const other = seedUser(h, "Khác").id;
    expect(await h.c.portfolio.slugAvailability(other, mine.slug)).toEqual({ available: false, reason: "TAKEN" });
  });

  it("templates: 4 mẫu × 6 màu, mã màu hợp lệ, mô tả chữ", () => {
    const t = h.c.portfolio.templates();
    expect(t.map((x) => x.template)).toEqual(["CLASSIC", "DEVELOPER", "DESIGNER", "MINIMAL"]);
    for (const x of t) {
      expect(x.accents).toHaveLength(6);
      expect(x.accents.every((a) => /^#[0-9a-f]{6}$/.test(a.color))).toBe(true);
      expect(x.description.length).toBeGreaterThan(10);
    }
    expect(t.find((x) => x.template === "DEVELOPER")?.dark).toBe(true);
  });

  it("overview: chưa tạo → portfolio null; PUBLISHED → publicUrl + hasUnpublishedChanges theo thay đổi sau lần dựng", async () => {
    expect((await h.c.portfolio.overview(me)).portfolio).toBeNull();
    const fx = await publishedFixture(h);
    const o1 = await h.c.portfolio.overview(fx.user.id);
    expect(o1.publicUrl).toBe(`https://superapp.test/p/${fx.slug}`);
    expect(o1.portfolio?.status).toBe("PUBLISHED");
    expect(o1.portfolio?.hasUnpublishedChanges).toBe(false);
    expect(o1.latestBuild).toMatchObject({ status: "READY", buildVersion: 1 });
    h.clock.now = new Date("2026-09-26T04:00:00.000Z");
    await h.c.portfolio.update(fx.user.id, dto({ displayName: "Đổi tên", expectedVersion: o1.portfolio?.version ?? 1 }));
    expect((await h.c.portfolio.overview(fx.user.id)).portfolio?.hasUnpublishedChanges).toBe(true);
  });
});
