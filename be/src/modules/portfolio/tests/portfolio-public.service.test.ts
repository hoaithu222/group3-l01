import { newObjectId } from "../../../core/utils/object-id";
import type { AuthUser } from "../../../core/types/express";
import { PortfolioReportTarget } from "../services/portfolio-report-target";
import { buildHarness, publishedFixture, seedUser, tinyPng, type Harness } from "./support/harness";

/** CR-05 (BE: 200 → unpublish → 404), CR-34 (301 + 404 sau 30 ngày), cache 60 s, công tắc khẩn cấp, ảnh, đích báo cáo PORTFOLIO. */
let h: Harness;
const admin: AuthUser = { id: newObjectId(), email: "a@e.com", role: "admin" };

beforeEach(() => {
  h = buildHarness();
});

describe("resolve", () => {
  it("PUBLISHED → PAGE (kèm buildVersion/seoIndexable) và được cache; ghi cache CHỈ kết quả dương", async () => {
    const fx = await publishedFixture(h);
    const r = await h.c.publicPages.resolve(fx.slug);
    expect(r).toEqual({ kind: "PAGE", portfolioId: fx.portfolioId, buildVersion: 1, seoIndexable: false });
    expect(h.cache.map.get(fx.slug)).toEqual(r);
    expect(await h.c.publicPages.resolve("khong-ton-tai")).toEqual({ kind: "NOT_FOUND" });
    expect(h.cache.map.has("khong-ton-tai")).toBe(false);
  });

  it("slug viết hoa vẫn tra được (chuẩn hoá); slug sai dạng → NOT_FOUND không chạm DB", async () => {
    const fx = await publishedFixture(h);
    expect((await h.c.publicPages.resolve(fx.slug.toUpperCase())).kind).toBe("PAGE");
    const spy = jest.spyOn(h.portfolios, "findBySlugKey");
    expect((await h.c.publicPages.resolve("a--b")).kind).toBe("NOT_FOUND");
    expect((await h.c.publicPages.resolve("../etc/passwd")).kind).toBe("NOT_FOUND");
    expect(spy).not.toHaveBeenCalled();
  });

  it("nháp / đã ngừng / bị gỡ → NOT_FOUND (cùng một kết quả, không phân biệt)", async () => {
    const draft = seedUser(h, "Nháp");
    const draftPf = await h.c.portfolio.update(draft.id, { displayName: "Nháp", headline: null, bio: "x", avatarAssetId: null, links: [], theme: { template: "CLASSIC", accent: "GREEN" }, sections: [{ kind: "ABOUT", visible: true, order: 0 }, { kind: "PROJECTS", visible: true, order: 1 }, { kind: "SKILLS", visible: true, order: 2 }, { kind: "CONTACT", visible: true, order: 3 }], seoIndexable: false, expectedVersion: 0 });
    expect(await h.c.publicPages.resolve(draftPf.slug)).toEqual({ kind: "NOT_FOUND" });
    const fx = await publishedFixture(h);
    await h.c.publish.unpublish(fx.user.id);
    expect(await h.c.publicPages.resolve(fx.slug)).toEqual({ kind: "NOT_FOUND" });
    const fx2 = await publishedFixture(h, { name: "Người hai" });
    await h.c.publish.takedown(admin, fx2.portfolioId, { reason: "Vi phạm quy định" });
    expect(await h.c.publicPages.resolve(fx2.slug)).toEqual({ kind: "NOT_FOUND" });
  });

  it("CR-05 (BE): 200 → Ngừng công khai → 404 NGAY (cache bị xoá cùng lúc)", async () => {
    const fx = await publishedFixture(h);
    expect((await h.c.publicPages.resolve(fx.slug)).kind).toBe("PAGE");
    await h.c.publish.unpublish(fx.user.id);
    expect(h.cache.map.has(fx.slug)).toBe(false);
    expect((await h.c.publicPages.resolve(fx.slug)).kind).toBe("NOT_FOUND");
  });

  it("gỡ vi phạm cũng 404 NGAY dù cache còn (takedown xoá cache)", async () => {
    const fx = await publishedFixture(h);
    await h.c.publicPages.resolve(fx.slug);
    await h.c.publish.takedown(admin, fx.portfolioId, { reason: "Vi phạm quy định" });
    expect((await h.c.publicPages.resolve(fx.slug)).kind).toBe("NOT_FOUND");
  });

  it("công tắc khẩn cấp (cờ career hoặc portfolio.enabled tắt) → mọi trang 404, kể cả đang cache", async () => {
    const fx = await publishedFixture(h);
    await h.c.publicPages.resolve(fx.slug);
    h.config.isActive = false;
    expect(await h.c.publicPages.resolve(fx.slug)).toEqual({ kind: "NOT_FOUND" });
    h.config.isActive = true;
    expect((await h.c.publicPages.resolve(fx.slug)).kind).toBe("PAGE");
  });

  it("bật SEO → seoIndexable true trong kết quả", async () => {
    const fx = await publishedFixture(h);
    const pf = (await h.c.portfolio.overview(fx.user.id)).portfolio;
    await h.c.portfolio.update(fx.user.id, { displayName: pf?.displayName ?? "An", headline: null, bio: "x", avatarAssetId: null, links: [], theme: { template: "CLASSIC", accent: "GREEN" }, sections: pf?.sections as never, seoIndexable: true, expectedVersion: pf?.version ?? 1 });
    expect(await h.c.publicPages.resolve(fx.slug)).toMatchObject({ kind: "PAGE", seoIndexable: true });
  });
});

describe("CR-34: đổi slug an-dev → an-nguyen", () => {
  it("slug cũ 301 sang slug mới trong 30 ngày; hết hạn → 404; slug mới phục vụ trang", async () => {
    const fx = await publishedFixture(h);
    const pf = await h.portfolios.findById(fx.portfolioId);
    await h.c.portfolio.changeSlug(fx.user.id, { slug: "an-nguyen", expectedVersion: pf?.version ?? 1 });
    expect(await h.c.publicPages.resolve(fx.slug)).toEqual({ kind: "REDIRECT", to: "an-nguyen" });
    expect((await h.c.publicPages.resolve("an-nguyen")).kind).toBe("PAGE");
    h.cache.map.clear();
    h.clock.now = new Date("2026-10-25T00:00:00.000Z"); // ngày 29
    expect((await h.c.publicPages.resolve(fx.slug)).kind).toBe("REDIRECT");
    h.cache.map.clear();
    h.clock.now = new Date("2026-10-27T00:00:00.000Z"); // quá 30 ngày
    expect(await h.c.publicPages.resolve(fx.slug)).toEqual({ kind: "NOT_FOUND" });
  });

  it("KHÔNG chuyển hướng tới hồ sơ đã ngừng công khai/bị gỡ (không lộ slug mới)", async () => {
    const fx = await publishedFixture(h);
    const pf = await h.portfolios.findById(fx.portfolioId);
    await h.c.portfolio.changeSlug(fx.user.id, { slug: "an-nguyen", expectedVersion: pf?.version ?? 1 });
    await h.c.publish.unpublish(fx.user.id);
    h.cache.map.clear();
    expect(await h.c.publicPages.resolve(fx.slug)).toEqual({ kind: "NOT_FOUND" });
  });
});

describe("page / asset", () => {
  it("page: đọc index.html của build đang phục vụ; object mất → null (route trả 404)", async () => {
    const fx = await publishedFixture(h);
    const r = await h.c.publicPages.resolve(fx.slug);
    if (r.kind !== "PAGE") throw new Error("expect PAGE");
    expect((await h.c.publicPages.page(r))?.toString("utf8")).toContain("<h1>Nguyễn Văn An</h1>");
    h.storage.objects.clear();
    expect(await h.c.publicPages.page(r)).toBeNull();
  });

  it("asset: chỉ tên img-xxxxxxxx.webp; ảnh thật của build; đường dẫn lạ/không tồn tại → null", async () => {
    const fx = await publishedFixture(h);
    const avatar = newObjectId();
    h.assets.images.set(avatar, await tinyPng());
    const pf = (await h.c.portfolio.overview(fx.user.id)).portfolio;
    await h.c.portfolio.update(fx.user.id, { displayName: pf?.displayName ?? "An", headline: null, bio: "x", avatarAssetId: avatar, links: [], theme: { template: "CLASSIC", accent: "GREEN" }, sections: pf?.sections as never, seoIndexable: false, expectedVersion: pf?.version ?? 1 });
    const { buildVersion } = await h.c.publish.publish(fx.user.id, (await h.portfolios.findById(fx.portfolioId))?.version ?? 1);
    await h.c.build.run({ portfolioId: fx.portfolioId, buildVersion }, { retry: false, finalAttempt: false });
    h.cache.map.clear();
    const file = (await h.builds.find(fx.portfolioId, buildVersion))?.files.find((f) => f.startsWith("img-")) ?? "";
    expect((await h.c.publicPages.asset(fx.slug, file))?.length).toBeGreaterThan(50);
    for (const bad of ["index.html", "../index.html", "img-xxxxxxxx.webp", "IMG-abcdef12.webp", "img-abcdef12.png", "img-abcdef123.webp"]) expect(await h.c.publicPages.asset(fx.slug, bad)).toBeNull();
    expect(await h.c.publicPages.asset("khong-co", file)).toBeNull();
  });

  it("ảnh của trang vẫn lấy được qua slug CŨ (HTML build cũ còn trỏ slug cũ tới khi build mới xong)", async () => {
    const fx = await publishedFixture(h);
    const avatar = newObjectId();
    h.assets.images.set(avatar, await tinyPng());
    const pf = (await h.c.portfolio.overview(fx.user.id)).portfolio;
    await h.c.portfolio.update(fx.user.id, { displayName: pf?.displayName ?? "An", headline: null, bio: "x", avatarAssetId: avatar, links: [], theme: { template: "CLASSIC", accent: "GREEN" }, sections: pf?.sections as never, seoIndexable: false, expectedVersion: pf?.version ?? 1 });
    const b = await h.c.publish.publish(fx.user.id, (await h.portfolios.findById(fx.portfolioId))?.version ?? 1);
    await h.c.build.run({ portfolioId: fx.portfolioId, buildVersion: b.buildVersion }, { retry: false, finalAttempt: false });
    const file = (await h.builds.find(fx.portfolioId, b.buildVersion))?.files.find((f) => f.startsWith("img-")) ?? "";
    await h.c.portfolio.changeSlug(fx.user.id, { slug: "an-nguyen", expectedVersion: (await h.portfolios.findById(fx.portfolioId))?.version ?? 1 });
    h.cache.map.clear();
    expect((await h.c.publicPages.asset(fx.slug, file))?.length).toBeGreaterThan(50);
  });
});

describe("đích báo cáo PORTFOLIO (p1-08)", () => {
  const ext = () => new PortfolioReportTarget(h.portfolios);

  it("chỉ trang ĐANG công khai báo cáo được; chủ hồ sơ → SELF; còn lại NOT_FOUND trung tính", async () => {
    const fx = await publishedFixture(h);
    const stranger: AuthUser = { id: newObjectId(), email: "s@e.com" };
    expect(await ext().resolve(stranger, fx.portfolioId)).toEqual({
      targetType: "PORTFOLIO",
      targetId: fx.portfolioId,
      groupKey: `PORTFOLIO:${fx.portfolioId}`,
      scopeType: null,
      scopeId: null,
      scopeIsPrivate: false,
      workspaceId: null,
      targetAuthorId: fx.user.id,
      handlerLevel: "PLATFORM_ONLY",
    });
    expect(await ext().resolve({ id: fx.user.id, email: "o@e.com" }, fx.portfolioId)).toBe("SELF");
    expect(await ext().resolve(stranger, newObjectId())).toBe("NOT_FOUND");
    await h.c.publish.unpublish(fx.user.id);
    expect(await ext().resolve(stranger, fx.portfolioId)).toBe("NOT_FOUND");
  });

  it("bị gỡ → NOT_FOUND", async () => {
    const fx = await publishedFixture(h);
    await h.c.publish.takedown(admin, fx.portfolioId, { reason: "Vi phạm quy định" });
    expect(await ext().resolve({ id: newObjectId(), email: "s@e.com" }, fx.portfolioId)).toBe("NOT_FOUND");
  });
});
