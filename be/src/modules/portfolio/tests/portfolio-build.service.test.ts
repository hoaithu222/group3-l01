import sharp from "sharp";
import { LIMITS } from "../../../core/constants/limits";
import { newObjectId } from "../../../core/utils/object-id";
import { buildHarness, publishedFixture, seedUser, seedWorkspace, stats, tinyPng, type Harness } from "./support/harness";

/** Job `portfolio.build`: CR-05 (BE), CR-35 (idempotent), lỗi/retry/timeout, huỷ giữa chừng, ảnh thật qua sharp, cron reaper. */
let h: Harness;
const first = { retry: false, finalAttempt: false };
const last = { retry: true, finalAttempt: true };

beforeEach(() => {
  h = buildHarness();
});

async function queued(userName = "Nguyễn Văn An") {
  const user = seedUser(h, userName);
  const ws = seedWorkspace(h, user.id, "Nhóm Đồ án kho", { teammates: [seedUser(h, "Lan Anh").id, seedUser(h, "Minh").id, seedUser(h, "Khoa").id] });
  h.contribution.scores.set(`${user.id}:${ws}`, { scoreX10: 910, shareX10: 310, boards: 1 });
  await h.c.projectService.add(user.id, ws);
  const pf = (await h.c.portfolio.overview(user.id)).portfolio;
  if (!pf) throw new Error("no portfolio");
  const { buildVersion, buildId } = await h.c.publish.publish(user.id, pf.version);
  return { user, ws, pfId: pf.id, slug: pf.slug, buildVersion, buildId };
}

describe("dựng trang thành công", () => {
  it("READY: ghi index.html vào <prefix><id>/b1/, PUBLISHED + currentBuildVersion, outbox published, xoá cache, socket BUILDING→READY kèm url", async () => {
    const q = await queued();
    h.cache.deleted.length = 0;
    expect(await h.c.build.run({ portfolioId: q.pfId, buildVersion: q.buildVersion }, first)).toBe("READY");
    const pf = await h.portfolios.findById(q.pfId);
    expect(pf).toMatchObject({ status: "PUBLISHED", currentBuildVersion: 1 });
    expect(pf?.publishedAt).not.toBeNull();
    expect(h.storage.keys()).toEqual([`portfolio/${q.pfId}/b1/index.html`]);
    expect(await h.builds.find(q.pfId, 1)).toMatchObject({ status: "READY", storageKey: `portfolio/${q.pfId}/b1/`, files: ["index.html"], error: null });
    expect((await h.builds.find(q.pfId, 1))?.sizeBytes).toBeGreaterThan(500);
    const published = h.outbox.byJob("portfolio.events");
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({ queue: "reports", dedupeKey: `portfolio.published:portfolio:${q.pfId}:b1`, payload: { event: "portfolio.published", portfolioId: q.pfId, userId: q.user.id, slug: q.slug, url: `https://superapp.test/p/${q.slug}`, buildVersion: 1 } });
    expect(h.cache.deleted).toContain(q.slug);
    expect(h.emitter.events.map((e) => e.payload.status)).toEqual(["BUILDING", "READY"]);
    expect(h.emitter.events.at(-1)).toMatchObject({ userId: q.user.id, payload: { v: 1, portfolioId: q.pfId, buildId: q.buildId, buildVersion: 1, url: `https://superapp.test/p/${q.slug}` } });
  });

  it("CR-04: HTML có số liệu đúng + 'Làm cùng 3 đồng đội', KHÔNG chứa tên đồng đội nào", async () => {
    const q = await queued();
    await h.c.build.run({ portfolioId: q.pfId, buildVersion: q.buildVersion }, first);
    const html = h.storage.html(`portfolio/${q.pfId}/b1/index.html`);
    expect(html).toContain("40 task");
    expect(html).toContain("62 điểm");
    expect(html).toContain("90%");
    expect(html).toContain("91/100");
    expect(html).toContain("Làm cùng 3 đồng đội");
    for (const name of ["Lan Anh", "Minh", "Khoa"]) expect(html).not.toContain(name);
    expect(html).not.toMatch(/<script/i);
  });

  it("chụp LẠI snapshot lúc build: số liệu đổi sau khi thêm dự án được cập nhật vào DB và vào trang", async () => {
    const q = await queued();
    h.source.stats.set(`${q.user.id}:${q.ws}`, stats({ tasksDone: 52, storyPointsX10: 800 }));
    await h.c.build.run({ portfolioId: q.pfId, buildVersion: q.buildVersion }, first);
    const [project] = await h.projects.listByPortfolio(q.pfId);
    expect(project.snapshot).toMatchObject({ tasksDone: 52, storyPointsX10: 800 });
    expect(project.snapshotAt.toISOString()).toBe("2026-09-26T03:00:00.000Z");
    expect(h.storage.html(`portfolio/${q.pfId}/b1/index.html`)).toContain("52 task");
  });

  it("cổng số liệu lỗi lúc build: giữ snapshot cũ của dự án, build vẫn READY", async () => {
    const q = await queued();
    h.source.failing.add("memberStats");
    expect(await h.c.build.run({ portfolioId: q.pfId, buildVersion: q.buildVersion }, first)).toBe("READY");
    expect(h.storage.html(`portfolio/${q.pfId}/b1/index.html`)).toContain("40 task");
  });

  it("ảnh thật qua sharp: đại diện 256×256 webp + bìa 1200×630 webp, tên img-xxxxxxxx.webp, HTML trỏ /p/<slug>/assets/…", async () => {
    const q = await queued();
    const avatar = newObjectId();
    const cover = newObjectId();
    h.assets.images.set(avatar, await tinyPng("#3366ff"));
    h.assets.images.set(cover, await tinyPng("#ff6633"));
    const pf = (await h.c.portfolio.overview(q.user.id)).portfolio;
    await h.c.portfolio.update(q.user.id, { displayName: pf?.displayName ?? "An", headline: null, bio: "Xin chào", avatarAssetId: avatar, links: [], theme: { template: "DESIGNER", accent: "VIOLET" }, sections: pf?.sections as never, seoIndexable: false, expectedVersion: pf?.version ?? 1 });
    const project = (await h.c.portfolio.overview(q.user.id)).projects[0];
    await h.c.projectService.update(q.user.id, project.id, { expectedVersion: 1, coverAssetId: cover });
    // build mới (build 1 đã QUEUED từ trước → đóng nó, xếp lại với nội dung mới)
    await h.builds.markFailed((await h.builds.find(q.pfId, 1))?.id ?? "", "huỷ", new Date());
    const fresh = (await h.c.portfolio.overview(q.user.id)).portfolio;
    const { buildVersion } = await h.c.publish.publish(q.user.id, fresh?.version ?? 1);
    await h.c.build.run({ portfolioId: q.pfId, buildVersion }, first);
    const files = (await h.builds.find(q.pfId, buildVersion))?.files ?? [];
    const images = files.filter((f) => f !== "index.html");
    expect(images).toHaveLength(2);
    for (const name of images) expect(name).toMatch(/^img-[a-z0-9]{8}\.webp$/);
    const sizes = await Promise.all(images.map(async (n) => sharp(h.storage.objects.get(`portfolio/${q.pfId}/b${buildVersion}/${n}`) as Buffer).metadata()));
    expect(sizes.map((m) => `${m.format}:${m.width}x${m.height}`).sort()).toEqual(["webp:1200x630", "webp:256x256"]);
    const html = h.storage.html(`portfolio/${q.pfId}/b${buildVersion}/index.html`);
    for (const name of images) expect(html).toContain(`/p/${q.slug}/assets/${name}`);
  });

  it("build kế tiếp thay build hiện hành → xếp dọn build cũ trễ 10 phút; currentBuildVersion chỉ tăng", async () => {
    const fx = await publishedFixture(h);
    const pf = (await h.c.portfolio.overview(fx.user.id)).portfolio;
    const { buildVersion } = await h.c.publish.publish(fx.user.id, pf?.version ?? 1);
    expect(buildVersion).toBe(2);
    await h.c.build.run({ portfolioId: fx.portfolioId, buildVersion }, first);
    expect((await h.portfolios.findById(fx.portfolioId))?.currentBuildVersion).toBe(2);
    const purge = h.outbox.byJob("portfolio.purge-build");
    expect(purge).toHaveLength(1);
    expect(purge[0]).toMatchObject({ delayMs: 10 * 60_000, payload: { portfolioId: fx.portfolioId, buildVersion: 1 } });
  });

  it("build cũ về MUỘN (đã có build mới hơn) không ghi đè trang; object của nó xếp dọn", async () => {
    const fx = await publishedFixture(h);
    // Hai build chờ cùng lúc (b2 do người dùng, b3 do hệ thống); b3 xong TRƯỚC, b2 về muộn.
    for (const trigger of ["PUBLISH", "SKILL_REVOKED"] as const) {
      const n = await h.portfolios.reserveBuildVersion(fx.portfolioId, {});
      await h.builds.create({ portfolioId: fx.portfolioId, buildVersion: n ?? 0, trigger, portfolioVersion: 1, createdBy: null });
    }
    expect(await h.c.build.run({ portfolioId: fx.portfolioId, buildVersion: 3 }, first)).toBe("READY");
    const purgesBefore = h.outbox.byJob("portfolio.purge-build").length;
    expect(await h.c.build.run({ portfolioId: fx.portfolioId, buildVersion: 2 }, first)).toBe("SKIPPED");
    expect((await h.portfolios.findById(fx.portfolioId))?.currentBuildVersion).toBe(3);
    expect(await h.builds.find(fx.portfolioId, 2)).toMatchObject({ status: "READY" });
    const purges = h.outbox.byJob("portfolio.purge-build");
    expect(purges).toHaveLength(purgesBefore + 1);
    expect(purges.at(-1)).toMatchObject({ payload: { portfolioId: fx.portfolioId, buildVersion: 2 } });
    expect(h.outbox.byJob("portfolio.events").filter((r) => r.type === "portfolio.published")).toHaveLength(2); // b1 và b3 (b2 không phục vụ)
  });
});

describe("CR-35: idempotent theo (portfolioId, buildVersion)", () => {
  it("chạy hai lần tuần tự: lần hai SKIPPED, đúng MỘT build READY, MỘT bộ object, MỘT sự kiện published", async () => {
    const q = await queued();
    expect(await h.c.build.run({ portfolioId: q.pfId, buildVersion: q.buildVersion }, first)).toBe("READY");
    expect(await h.c.build.run({ portfolioId: q.pfId, buildVersion: q.buildVersion }, first)).toBe("SKIPPED");
    expect((await h.builds.listByPortfolio(q.pfId)).filter((b) => b.status === "READY")).toHaveLength(1);
    expect(h.storage.keys()).toHaveLength(1);
    expect(h.outbox.byJob("portfolio.events")).toHaveLength(1);
  });

  it("chạy SONG SONG: chỉ một job chiếm được build (CAS QUEUED→BUILDING), không ghi đôi", async () => {
    const q = await queued();
    const results = await Promise.all([1, 2, 3].map(() => h.c.build.run({ portfolioId: q.pfId, buildVersion: q.buildVersion }, first)));
    expect(results.filter((r) => r === "READY")).toHaveLength(1);
    expect(results.filter((r) => r === "SKIPPED")).toHaveLength(2);
    expect(h.outbox.byJob("portfolio.events")).toHaveLength(1);
    expect(h.storage.keys()).toEqual([`portfolio/${q.pfId}/b1/index.html`]);
  });

  it("payload lạ (build không tồn tại) → SKIPPED, không lỗi", async () => {
    expect(await h.c.build.run({ portfolioId: newObjectId(), buildVersion: 9 }, first)).toBe("SKIPPED");
  });
});

describe("lỗi và thử lại", () => {
  it("lỗi tạm thời ở lượt KHÔNG cuối: ném lại cho BullMQ, build vẫn BUILDING, KHÔNG thông báo; lượt retry thành công → READY", async () => {
    const q = await queued();
    h.storage.putFailuresLeft = 1;
    await expect(h.c.build.run({ portfolioId: q.pfId, buildVersion: q.buildVersion }, first)).rejects.toThrow("storage down");
    expect(await h.builds.find(q.pfId, 1)).toMatchObject({ status: "BUILDING" });
    expect(h.notifier.calls).toHaveLength(0);
    expect(await h.c.build.run({ portfolioId: q.pfId, buildVersion: q.buildVersion }, { retry: true, finalAttempt: false })).toBe("READY");
    expect((await h.portfolios.findById(q.pfId))?.status).toBe("PUBLISHED");
  });

  it("lượt CUỐI vẫn lỗi: build FAILED (câu rút gọn, không stack), thông báo build-failed, socket FAILED, dọn object ghi dở, bản đang phục vụ giữ nguyên", async () => {
    const fx = await publishedFixture(h);
    const pf = (await h.c.portfolio.overview(fx.user.id)).portfolio;
    const { buildVersion } = await h.c.publish.publish(fx.user.id, pf?.version ?? 1);
    h.notifier.calls.length = 0;
    h.storage.putFailuresLeft = 5;
    await expect(h.c.build.run({ portfolioId: fx.portfolioId, buildVersion }, last)).rejects.toThrow();
    const build = await h.builds.find(fx.portfolioId, buildVersion);
    expect(build).toMatchObject({ status: "FAILED", error: "Không tạo được trang, vui lòng thử lại" });
    expect(build?.error).not.toMatch(/storage|at |\.ts/);
    expect(h.notifier.calls).toHaveLength(1);
    expect(h.notifier.calls[0]).toMatchObject({ type: "portfolio.build-failed", recipients: [{ userId: fx.user.id }], dedupeKey: `portfolio-build-failed:${build?.id}` });
    expect(h.emitter.events.at(-1)?.payload).toMatchObject({ status: "FAILED", error: "Không tạo được trang, vui lòng thử lại" });
    expect(await h.portfolios.findById(fx.portfolioId)).toMatchObject({ status: "PUBLISHED", currentBuildVersion: 1 });
    expect(h.storage.keys().every((k) => k.includes("/b1/"))).toBe(true);
  });

  it("HTML vượt trần → FAILED NGAY (không retry), câu tiếng Việt rõ nguyên nhân", async () => {
    h = buildHarness({ htmlMaxBytes: 300 });
    const q = await queued();
    expect(await h.c.build.run({ portfolioId: q.pfId, buildVersion: q.buildVersion }, first)).toBe("FAILED");
    expect(await h.builds.find(q.pfId, 1)).toMatchObject({ status: "FAILED", error: "Trang portfolio vượt dung lượng cho phép, hãy rút gọn nội dung" });
    expect(h.storage.keys()).toEqual([]);
    expect(h.notifier.calls[0]).toMatchObject({ type: "portfolio.build-failed" });
  });

  it("hồ sơ bị gỡ / không còn → FAILED ngay, không công khai", async () => {
    const q = await queued();
    await h.portfolios.setTakedown(q.pfId, newObjectId(), "vi phạm", new Date());
    expect(await h.c.build.run({ portfolioId: q.pfId, buildVersion: q.buildVersion }, first)).toBe("FAILED");
    expect(await h.builds.find(q.pfId, 1)).toMatchObject({ status: "FAILED", error: "Hồ sơ đã bị gỡ" });
    expect((await h.portfolios.findById(q.pfId))?.status).toBe("DRAFT");
    const q2 = await queued("Người hai");
    await h.portfolios.delete(q2.pfId);
    expect(await h.c.build.run({ portfolioId: q2.pfId, buildVersion: q2.buildVersion }, first)).toBe("FAILED");
  });

  it("Ngừng công khai/gỡ XEN GIỮA lúc dựng: build bị đóng, markReady thua CAS → dọn object, trang KHÔNG được công khai", async () => {
    const q = await queued();
    h.storage.afterPut = async (key) => {
      if (key.endsWith("index.html")) await h.builds.failInFlight(q.pfId, "Đã ngừng công khai", new Date());
    };
    expect(await h.c.build.run({ portfolioId: q.pfId, buildVersion: q.buildVersion }, first)).toBe("SKIPPED");
    expect(h.storage.keys()).toEqual([]);
    expect((await h.portfolios.findById(q.pfId))?.status).toBe("DRAFT");
    expect(h.outbox.byJob("portfolio.events")).toHaveLength(0);
  });

  it("quá thời gian dựng → lỗi tạm thời (thử lại); ở lượt cuối FAILED 'Quá thời gian tạo trang'", async () => {
    h = buildHarness({ buildTimeoutMs: 30 });
    const q = await queued();
    h.storage.afterPut = () => new Promise((r) => setTimeout(r, 200));
    await expect(h.c.build.run({ portfolioId: q.pfId, buildVersion: q.buildVersion }, last)).rejects.toThrow(/Quá thời gian/);
    expect(await h.builds.find(q.pfId, 1)).toMatchObject({ status: "FAILED", error: "Quá thời gian tạo trang, vui lòng thử lại" });
    await new Promise((r) => setTimeout(r, 300)); // build nền kết thúc muộn: markReady thua → dọn object
    expect(h.storage.keys()).toEqual([]);
  });

  it("job chết giữa chừng (BUILDING quá hạn lease) được lượt sau CHIẾM LẠI", async () => {
    const q = await queued();
    await h.builds.claim((await h.builds.find(q.pfId, 1))?.id ?? "", { now: new Date("2026-09-26T02:00:00.000Z"), staleBefore: new Date("2026-09-26T02:00:00.000Z") });
    expect(await h.c.build.run({ portfolioId: q.pfId, buildVersion: q.buildVersion }, first)).toBe("READY"); // lease cũ 1 giờ > 2×timeout
  });

  it("job khác ĐANG dựng (lease còn mới) → SKIPPED, không chiếm", async () => {
    const q = await queued();
    await h.builds.claim((await h.builds.find(q.pfId, 1))?.id ?? "", { now: new Date("2026-09-26T02:59:50.000Z"), staleBefore: new Date("2026-09-26T02:59:50.000Z") });
    expect(await h.c.build.run({ portfolioId: q.pfId, buildVersion: q.buildVersion }, first)).toBe("SKIPPED");
  });
});

describe("cron portfolio.stale-build-reaper", () => {
  it("BUILDING quá staleBuildMinutes và QUEUED quá hạn → FAILED + thông báo; build mới không bị đụng", async () => {
    const a = await queued("Người một");
    const b = await queued("Người hai");
    const c = await queued("Người ba");
    const buildingA = await h.builds.claim((await h.builds.find(a.pfId, 1))?.id ?? "", { now: new Date("2026-09-26T02:00:00.000Z"), staleBefore: new Date() });
    expect(buildingA?.status).toBe("BUILDING");
    // c: BUILDING mới
    await h.builds.claim((await h.builds.find(c.pfId, 1))?.id ?? "", { now: new Date("2026-09-26T02:59:00.000Z"), staleBefore: new Date() });
    h.notifier.calls.length = 0;
    // b: QUEUED quá hạn (tạo lúc 03:00 → cần > 30 phút)
    h.clock.now = new Date("2026-09-26T03:40:00.000Z");
    const closed = await h.c.build.reapStale();
    expect(closed).toBe(3); // a (BUILDING cũ), b (QUEUED cũ), c (BUILDING 02:59 > 5 phút tại 03:40)
    for (const q of [a, b, c]) expect(await h.builds.find(q.pfId, 1)).toMatchObject({ status: "FAILED", error: "Quá thời gian tạo trang, vui lòng thử lại" });
    expect(h.notifier.calls.map((n) => n.type)).toEqual(["portfolio.build-failed", "portfolio.build-failed", "portfolio.build-failed"]);
    expect(await h.c.build.reapStale()).toBe(0); // idempotent
    expect(LIMITS.portfolio.staleBuildMinutes).toBe(5);
  });

  it("build còn mới không bị đóng", async () => {
    const q = await queued();
    await h.builds.claim((await h.builds.find(q.pfId, 1))?.id ?? "", { now: new Date("2026-09-26T03:00:00.000Z"), staleBefore: new Date() });
    h.clock.now = new Date("2026-09-26T03:03:00.000Z");
    expect(await h.c.build.reapStale()).toBe(0);
  });
});
