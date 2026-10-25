import { LIMITS } from "../../../core/constants/limits";
import { newObjectId } from "../../../core/utils/object-id";
import { buildHarness, publishedFixture, seedUser, tinyPng, type Harness } from "./support/harness";

/** CR-32 (skill.revoked → dựng lại, bỏ huy hiệu), CR-36 (ẩn danh hoá), dọn build, dọn slug hết hạn. */
let h: Harness;
const run = (portfolioId: string, buildVersion: number) => h.c.build.run({ portfolioId, buildVersion }, { retry: false, finalAttempt: false });

beforeEach(() => {
  h = buildHarness();
});

describe("CR-32: huy hiệu bị thu hồi sau khi publish", () => {
  it("skill.revoked → dựng lại (trigger SKILL_REVOKED, bỏ qua giới hạn Publish) → HTML mới không còn huy hiệu", async () => {
    const fx = await publishedFixture(h, { badges: ["ReactJS", "NodeJS"] });
    const html1 = h.storage.html(`portfolio/${fx.portfolioId}/b1/index.html`);
    expect(html1).toContain("ReactJS");
    expect(html1).toContain("NodeJS");

    h.career.revokeBadge(fx.user.id, "ReactJS");
    expect(await h.c.events.onSkillRevoked(fx.user.id)).toBe("SCHEDULED");
    const build = await h.builds.find(fx.portfolioId, 2);
    expect(build).toMatchObject({ status: "QUEUED", trigger: "SKILL_REVOKED", createdBy: null });
    expect(h.outbox.byJob("portfolio.build").at(-1)).toMatchObject({ dedupeKey: `portfolio.build:portfolio:${fx.portfolioId}:b2` });

    expect(await run(fx.portfolioId, 2)).toBe("READY");
    const html2 = h.storage.html(`portfolio/${fx.portfolioId}/b2/index.html`);
    expect(html2).not.toContain("ReactJS");
    expect(html2).toContain("NodeJS");
    expect((await h.portfolios.findById(fx.portfolioId))?.currentBuildVersion).toBe(2);
    expect(h.outbox.byJob("portfolio.purge-build").at(-1)).toMatchObject({ payload: { portfolioId: fx.portfolioId, buildVersion: 1 } }); // bản cũ có huy hiệu được xếp dọn
  });

  it("idempotent: đã có bản CHỜ thì không xếp thêm; hồ sơ chưa công khai/bị gỡ/không có → SKIPPED", async () => {
    const fx = await publishedFixture(h, { badges: ["ReactJS"] });
    expect(await h.c.events.onSkillRevoked(fx.user.id)).toBe("SCHEDULED");
    expect(await h.c.events.onSkillRevoked(fx.user.id)).toBe("SKIPPED");
    expect(await h.builds.listByPortfolio(fx.portfolioId)).toHaveLength(2);
    expect(await h.c.events.onSkillRevoked(seedUser(h, "Không hồ sơ").id)).toBe("SKIPPED");
    await h.c.publish.unpublish(fx.user.id);
    expect(await h.c.events.onSkillRevoked(fx.user.id)).toBe("SKIPPED");
  });

  it("huy hiệu bị thu hồi lúc build đang DỰNG: vẫn xếp thêm một bản (bản đang dựng có thể đã đọc huy hiệu cũ)", async () => {
    const fx = await publishedFixture(h, { badges: ["ReactJS"] });
    const pf = await h.portfolios.findById(fx.portfolioId);
    const { buildVersion } = await h.c.publish.publish(fx.user.id, pf?.version ?? 1);
    await h.builds.claim((await h.builds.find(fx.portfolioId, buildVersion))?.id ?? "", { now: new Date(), staleBefore: new Date() }); // BUILDING
    expect(await h.c.events.onSkillRevoked(fx.user.id)).toBe("SCHEDULED");
  });
});

describe("CR-36: tài khoản bị ẩn danh hoá", () => {
  it("trang 404, object build xoá, dự án + link ảnh xoá, slug giữ 30 ngày (redirectTo null), hồ sơ xoá, sự kiện ANONYMIZED", async () => {
    const fx = await publishedFixture(h);
    const avatar = newObjectId();
    h.assets.images.set(avatar, await tinyPng());
    const pf = (await h.c.portfolio.overview(fx.user.id)).portfolio;
    await h.c.portfolio.update(fx.user.id, { displayName: pf?.displayName ?? "An", headline: null, bio: "Xin chào", avatarAssetId: avatar, links: [], theme: { template: "CLASSIC", accent: "GREEN" }, sections: pf?.sections as never, seoIndexable: false, expectedVersion: pf?.version ?? 1 });
    expect(h.storage.keys().length).toBeGreaterThan(0);
    expect((await h.c.publicPages.resolve(fx.slug)).kind).toBe("PAGE");
    expect(h.assets.links.length).toBeGreaterThan(0);

    expect(await h.c.events.onUserAnonymized(fx.user.id)).toBe("DELETED");
    expect(h.storage.keys()).toEqual([]);
    expect(await h.portfolios.findById(fx.portfolioId)).toBeNull();
    expect(await h.projects.listByPortfolio(fx.portfolioId)).toEqual([]);
    expect(await h.builds.listByPortfolio(fx.portfolioId)).toEqual([]);
    expect(h.assets.links).toEqual([]);
    const held = await h.reservations.findByKey(fx.slug);
    expect(held).toMatchObject({ portfolioId: fx.portfolioId, redirectTo: null });
    expect(held?.expiresAt.getTime()).toBe(new Date("2026-09-26T03:00:00.000Z").getTime() + LIMITS.portfolio.slugReserveDays * 86_400_000);
    expect(h.outbox.byJob("portfolio.events").at(-1)).toMatchObject({ payload: { event: "portfolio.unpublished", reason: "ANONYMIZED", userId: fx.user.id } });
    expect(h.cache.deleted).toContain(fx.slug);
    expect((await h.c.publicPages.resolve(fx.slug)).kind).toBe("NOT_FOUND"); // 404
  });

  it("slug KHÔNG ai lấy được trong 30 ngày, giải phóng sau đó (cron dọn)", async () => {
    const fx = await publishedFixture(h);
    await h.c.events.onUserAnonymized(fx.user.id);
    const other = seedUser(h, "Người khác").id;
    await h.c.portfolio.update(other, { displayName: "Người khác", headline: null, bio: "x", avatarAssetId: null, links: [], theme: { template: "CLASSIC", accent: "GREEN" }, sections: [{ kind: "ABOUT", visible: true, order: 0 }, { kind: "PROJECTS", visible: true, order: 1 }, { kind: "SKILLS", visible: true, order: 2 }, { kind: "CONTACT", visible: true, order: 3 }], seoIndexable: false, expectedVersion: 0 });
    await expect(h.c.portfolio.changeSlug(other, { slug: fx.slug, expectedVersion: 1 })).rejects.toMatchObject({ errorCode: "PORT_001" });
    h.clock.now = new Date("2026-10-27T00:00:00.000Z");
    expect(await h.c.events.cleanupReservations()).toBe(1);
    expect(await h.reservations.findByKey(fx.slug)).toBeNull();
    await expect(h.c.portfolio.changeSlug(other, { slug: fx.slug, expectedVersion: 1 })).resolves.toMatchObject({ slug: fx.slug });
  });

  it("slug cũ đã đổi (chuyển hướng) của tài khoản bị xoá cũng thành 404 (redirectTo null), không lộ slug mới", async () => {
    const fx = await publishedFixture(h);
    const pf = await h.portfolios.findById(fx.portfolioId);
    await h.c.portfolio.changeSlug(fx.user.id, { slug: "slug-moi", expectedVersion: pf?.version ?? 1 });
    await h.c.events.onUserAnonymized(fx.user.id);
    expect((await h.reservations.findByKey(fx.slug))?.redirectTo).toBeNull();
    expect((await h.c.publicPages.resolve(fx.slug)).kind).toBe("NOT_FOUND");
    expect((await h.c.publicPages.resolve("slug-moi")).kind).toBe("NOT_FOUND");
  });

  it("chạy lại (job retry) hoặc người chưa có hồ sơ → NONE, không lỗi", async () => {
    const fx = await publishedFixture(h);
    expect(await h.c.events.onUserAnonymized(fx.user.id)).toBe("DELETED");
    expect(await h.c.events.onUserAnonymized(fx.user.id)).toBe("NONE");
    expect(await h.c.events.onUserAnonymized(newObjectId())).toBe("NONE");
  });
});

describe("purgeBuild", () => {
  it("dọn object của build KHÔNG còn phục vụ; đánh dấu purgedAt; chạy lại SKIPPED", async () => {
    const fx = await publishedFixture(h);
    const pf = await h.portfolios.findById(fx.portfolioId);
    const { buildVersion } = await h.c.publish.publish(fx.user.id, pf?.version ?? 1);
    await run(fx.portfolioId, buildVersion);
    expect(h.storage.keys()).toEqual([`portfolio/${fx.portfolioId}/b1/index.html`, `portfolio/${fx.portfolioId}/b2/index.html`]);
    expect(await h.c.events.purgeBuild(fx.portfolioId, 1)).toBe("PURGED");
    expect(h.storage.keys()).toEqual([`portfolio/${fx.portfolioId}/b2/index.html`]);
    expect((await h.builds.find(fx.portfolioId, 1))?.purgedAt).not.toBeNull();
    expect(await h.c.events.purgeBuild(fx.portfolioId, 1)).toBe("SKIPPED");
  });

  it("KHÔNG xoá build đang phục vụ (hồ sơ PUBLISHED); xoá được sau khi Ngừng công khai", async () => {
    const fx = await publishedFixture(h);
    expect(await h.c.events.purgeBuild(fx.portfolioId, 1)).toBe("SKIPPED");
    expect(h.storage.keys()).toHaveLength(1);
    await h.c.publish.unpublish(fx.user.id);
    expect(await h.c.events.purgeBuild(fx.portfolioId, 1)).toBe("PURGED");
    expect(h.storage.keys()).toEqual([]);
  });

  it("build đang chờ/đang dựng hoặc không tồn tại → SKIPPED (không xoá dưới chân job)", async () => {
    const fx = await publishedFixture(h);
    const pf = await h.portfolios.findById(fx.portfolioId);
    const { buildVersion } = await h.c.publish.publish(fx.user.id, pf?.version ?? 1);
    expect(await h.c.events.purgeBuild(fx.portfolioId, buildVersion)).toBe("SKIPPED");
    expect(await h.c.events.purgeBuild(fx.portfolioId, 99)).toBe("SKIPPED");
    expect(await h.c.events.purgeBuild(newObjectId(), 1)).toBe("SKIPPED");
  });

  it("lỗi storage khi xoá → ném (BullMQ thử lại), KHÔNG đánh dấu purgedAt", async () => {
    const fx = await publishedFixture(h);
    await h.c.publish.unpublish(fx.user.id);
    jest.spyOn(h.storage, "deleteMany").mockRejectedValueOnce(new Error("s3 down"));
    await expect(h.c.events.purgeBuild(fx.portfolioId, 1)).rejects.toThrow("s3 down");
    expect((await h.builds.find(fx.portfolioId, 1))?.purgedAt).toBeNull();
    expect(await h.c.events.purgeBuild(fx.portfolioId, 1)).toBe("PURGED");
  });
});

describe("cleanupReservations", () => {
  it("chỉ xoá bản ghi hết hạn và xoá cache của chúng", async () => {
    const pid = newObjectId();
    await h.reservations.upsert({ slugKey: "het-han", portfolioId: pid, redirectTo: null, expiresAt: new Date("2026-09-01T00:00:00.000Z") });
    await h.reservations.upsert({ slugKey: "con-han", portfolioId: pid, redirectTo: null, expiresAt: new Date("2026-10-15T00:00:00.000Z") });
    expect(await h.c.events.cleanupReservations()).toBe(1);
    expect(await h.reservations.findByKey("het-han")).toBeNull();
    expect(await h.reservations.findByKey("con-han")).not.toBeNull();
    expect(h.cache.deleted).toEqual(["het-han"]);
    expect(await h.c.events.cleanupReservations()).toBe(0);
  });
});
