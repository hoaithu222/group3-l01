import { newObjectId } from "../../../core/utils/object-id";
import { SLUG_REGEX, slugify } from "../services/portfolio-slug.service";
import { buildHarness, seedUser, type Harness } from "./support/harness";

/** CR-10 / CR-34 (phần slug): dạng hợp lệ, từ dành riêng, từ cấm có dấu, trùng, slug cũ giữ 30 ngày. */
let h: Harness;
beforeEach(() => {
  h = buildHarness();
});

const create = async (slug: string, userId = newObjectId()) =>
  h.portfolios.create({ userId, slug, displayName: "An", headline: null, bio: null, avatarAssetId: null, links: [], theme: { template: "CLASSIC", accent: "GREEN" }, sections: [], seoIndexable: false });

describe("SLUG_REGEX — biên độ dài và gạch ngang", () => {
  it.each([
    ["abc", true],
    ["a1b", true],
    ["an-dev", true],
    ["a".repeat(30), true],
    ["ab", false],
    ["a".repeat(31), false],
    ["-abc", false],
    ["abc-", false],
    ["a--b", false],
    ["An-Dev", false],
    ["an_dev", false],
    ["an dev", false],
    ["đường-dẫn", false],
  ])("%s → %s", (slug, ok) => {
    expect(SLUG_REGEX.test(slug)).toBe(ok);
  });
});

describe("PortfolioSlugService.check", () => {
  it("chuẩn hoá chữ hoa/khoảng trắng đầu cuối trước khi kiểm", async () => {
    expect(await h.c.slugs.check("  An-Dev  ", null)).toEqual({ ok: true, slugKey: "an-dev" });
  });

  it("sai dạng → INVALID (PORT_002)", async () => {
    expect(await h.c.slugs.check("a--b", null)).toEqual({ ok: false, reason: "INVALID" });
    await expect(h.c.slugs.assertUsable("ab", null)).rejects.toMatchObject({ errorCode: "PORT_002", statusCode: 400 });
  });

  it("từ dành riêng (admin, support, vcijsc…) → RESERVED, PORT_003 400", async () => {
    for (const slug of ["admin", "support", "vcijsc", "official"]) expect(await h.c.slugs.check(slug, null)).toEqual({ ok: false, reason: "RESERVED" });
    await expect(h.c.slugs.assertUsable("admin", null)).rejects.toMatchObject({ errorCode: "PORT_003", statusCode: 400 });
  });

  it("từ cấm cấu hình (chứa chuỗi, không phân biệt dấu/hoa thường/gạch ngang) → BANNED, PORT_003", async () => {
    h.config.banned = ["Lừa Đảo", "cam ket"];
    expect(await h.c.slugs.check("lua-dao-999", null)).toEqual({ ok: false, reason: "BANNED" });
    expect(await h.c.slugs.check("luadao", null)).toEqual({ ok: false, reason: "BANNED" });
    expect(await h.c.slugs.check("an-camket-nhe", null)).toEqual({ ok: false, reason: "BANNED" });
    expect(await h.c.slugs.check("an-nguyen", null)).toEqual({ ok: true, slugKey: "an-nguyen" });
    await expect(h.c.slugs.assertUsable("lua-dao-999", null)).rejects.toMatchObject({ errorCode: "PORT_003" });
  });

  it("đã có hồ sơ khác dùng → TAKEN (PORT_001 409); của chính mình → dùng lại được", async () => {
    const owner = await create("an-dev");
    expect(await h.c.slugs.check("an-dev", null)).toEqual({ ok: false, reason: "TAKEN" });
    expect(await h.c.slugs.check("an-dev", newObjectId())).toEqual({ ok: false, reason: "TAKEN" });
    await expect(h.c.slugs.assertUsable("an-dev", null)).rejects.toMatchObject({ errorCode: "PORT_001", statusCode: 409 });
    expect(await h.c.slugs.check("an-dev", owner.id)).toEqual({ ok: true, slugKey: "an-dev" });
  });

  it("slug cũ còn giữ của người khác → TAKEN; của chính mình → dùng lại; hết hạn → giải phóng", async () => {
    const mine = await create("an-nguyen");
    await h.reservations.upsert({ slugKey: "an-dev", portfolioId: mine.id, redirectTo: "an-nguyen", expiresAt: new Date("2026-10-26T03:00:00.000Z") });
    expect(await h.c.slugs.check("an-dev", newObjectId())).toEqual({ ok: false, reason: "TAKEN" });
    expect(await h.c.slugs.check("an-dev", mine.id)).toEqual({ ok: true, slugKey: "an-dev" });
    h.clock.now = new Date("2026-10-27T00:00:00.000Z");
    expect(await h.c.slugs.check("an-dev", newObjectId())).toEqual({ ok: true, slugKey: "an-dev" });
  });
});

describe("sinh slug", () => {
  it("slugify bỏ dấu tiếng Việt, gạch ngang gọn, cắt ≤ 24 ký tự, tên quá ngắn → 'portfolio'", () => {
    expect(slugify("Nguyễn Văn Đức")).toBe("nguyen-van-duc");
    expect(slugify("  ***An***  Dev !!  ")).toBe("an-dev");
    expect(slugify("a".repeat(60)).length).toBeLessThanOrEqual(24);
    expect(slugify("Đ")).toBe("portfolio");
    expect(slugify("😀😀")).toBe("portfolio");
  });

  it("generate: tên + 4 ký tự, hợp lệ, không trùng hồ sơ có sẵn", async () => {
    const user = seedUser(h, "Trần Thị Bích");
    const slug = await h.c.slugs.generate(user.name);
    expect(slug).toMatch(/^tran-thi-bich-[0-9a-f]{4}$/);
    expect(SLUG_REGEX.test(slug)).toBe(true);
    expect((await h.c.slugs.check(slug, null)).ok).toBe(true);
  });
});
