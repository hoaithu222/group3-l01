import { newObjectId } from "../../../core/utils/object-id";
import type { AuthUser } from "../../../core/types/express";
import { buildHarness, publishedFixture, seedUser, seedWorkspace, type Harness } from "./support/harness";

/** Publish (PORT_008/009/010, CAS), Unpublish (PORT_011), link người khác, takedown/restore (PORT_012). */
let h: Harness;
const admin: AuthUser = { id: newObjectId(), email: "admin@e.com", role: "admin" };

beforeEach(() => {
  h = buildHarness();
});

async function draftWithProject(name = "Nguyễn Văn An") {
  const user = seedUser(h, name);
  await h.c.projectService.add(user.id, seedWorkspace(h, user.id, "Nhóm A"));
  const pf = (await h.c.portfolio.overview(user.id)).portfolio;
  if (!pf) throw new Error("no portfolio");
  return { user, pf };
}

describe("publish", () => {
  it("202: xếp MỘT build QUEUED + MỘT dòng outbox reports/portfolio.build (dedupeKey tất định)", async () => {
    const { user, pf } = await draftWithProject();
    const r = await h.c.publish.publish(user.id, pf.version);
    expect(r.buildVersion).toBe(1);
    const rows = h.outbox.byJob("portfolio.build");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ queue: "reports", dedupeKey: `portfolio.build:portfolio:${pf.id}:b1`, payload: { event: "portfolio.build", portfolioId: pf.id, buildVersion: 1 } });
    expect(await h.builds.find(pf.id, 1)).toMatchObject({ status: "QUEUED", trigger: "PUBLISH", createdBy: user.id, portfolioVersion: pf.version });
  });

  it("PORT_009: đang có build QUEUED/BUILDING → 409, không xếp thêm", async () => {
    const { user, pf } = await draftWithProject();
    await h.c.publish.publish(user.id, pf.version);
    await expect(h.c.publish.publish(user.id, pf.version)).rejects.toMatchObject({ errorCode: "PORT_009", statusCode: 409 });
    expect(h.outbox.byJob("portfolio.build")).toHaveLength(1);
  });

  it("PORT_010: chưa có hồ sơ / không mục nào có nội dung → 400 kèm mục trống", async () => {
    const stranger = seedUser(h, "Mới").id;
    await expect(h.c.publish.publish(stranger, 1)).rejects.toMatchObject({ errorCode: "PORT_010", statusCode: 400 });
    const user = seedUser(h, "Trống");
    const empty = await h.c.portfolio.update(user.id, {
      displayName: "Trống",
      headline: null,
      bio: null,
      avatarAssetId: null,
      links: [],
      theme: { template: "CLASSIC", accent: "GREEN" },
      sections: [
        { kind: "ABOUT", visible: true, order: 0 },
        { kind: "PROJECTS", visible: true, order: 1 },
        { kind: "SKILLS", visible: false, order: 2 },
        { kind: "CONTACT", visible: true, order: 3 },
      ],
      seoIndexable: false,
      expectedVersion: 0,
    });
    await expect(h.c.publish.publish(user.id, empty.version)).rejects.toMatchObject({
      errorCode: "PORT_010",
      details: { emptySections: ["ABOUT", "PROJECTS", "CONTACT"], visibleSections: ["ABOUT", "PROJECTS", "CONTACT"] },
    });
  });

  it("chỉ cần MỘT mục có nội dung: giới thiệu (không dự án) là đủ; dự án ẩn hết thì mục PROJECTS không tính", async () => {
    const { user, pf } = await draftWithProject();
    const project = (await h.c.portfolio.overview(user.id)).projects[0];
    await h.c.projectService.update(user.id, project.id, { expectedVersion: 1, visible: false });
    await expect(h.c.publish.publish(user.id, pf.version)).rejects.toMatchObject({ errorCode: "PORT_010" });
    const withBio = await h.c.portfolio.update(user.id, { displayName: pf.displayName, headline: null, bio: "Có giới thiệu", avatarAssetId: null, links: [], theme: pf.theme as never, sections: pf.sections as never, seoIndexable: false, expectedVersion: pf.version });
    await expect(h.c.publish.publish(user.id, withBio.version)).resolves.toMatchObject({ buildVersion: 1 });
  });

  it("huy hiệu (showSkills bật) cũng tính là nội dung; showSkills tắt thì không", async () => {
    const user = seedUser(h, "Chỉ huy hiệu");
    h.career.addBadge(user.id, "ReactJS");
    const pf = await h.c.portfolio.update(user.id, {
      displayName: "Chỉ huy hiệu",
      headline: null,
      bio: null,
      avatarAssetId: null,
      links: [],
      theme: { template: "CLASSIC", accent: "GREEN" },
      sections: [
        { kind: "ABOUT", visible: false, order: 0 },
        { kind: "PROJECTS", visible: false, order: 1 },
        { kind: "SKILLS", visible: true, order: 2 },
        { kind: "CONTACT", visible: false, order: 3 },
      ],
      seoIndexable: false,
      expectedVersion: 0,
    });
    await expect(h.c.publish.publish(user.id, pf.version)).resolves.toBeDefined();
    const other = seedUser(h, "Tắt huy hiệu");
    h.career.addBadge(other.id, "ReactJS");
    h.career.visibilityOf.set(other.id, { showSkills: false, proofTitles: false, showContribution: false, showQuiz: false, appearInOthersPortfolios: false });
    const pf2 = await h.c.portfolio.update(other.id, { displayName: "Tắt huy hiệu", headline: null, bio: null, avatarAssetId: null, links: [], theme: { template: "CLASSIC", accent: "GREEN" }, sections: pf.sections.map((s) => ({ kind: s.kind as "ABOUT", visible: s.kind === "SKILLS", order: s.order })), seoIndexable: false, expectedVersion: 0 });
    await expect(h.c.publish.publish(other.id, pf2.version)).rejects.toMatchObject({ errorCode: "PORT_010" });
  });

  it("version lệch → 409 RES_003", async () => {
    const { user, pf } = await draftWithProject();
    await expect(h.c.publish.publish(user.id, pf.version + 5)).rejects.toMatchObject({ errorCode: "RES_003", details: { currentVersion: pf.version } });
  });

  it("PORT_008 (403): hồ sơ bị gỡ không công khai được", async () => {
    const { user, pf } = await draftWithProject();
    await h.c.publish.takedown(admin, pf.id, { reason: "Vi phạm quy định cộng đồng" });
    await expect(h.c.publish.publish(user.id, pf.version)).rejects.toMatchObject({ errorCode: "PORT_008", statusCode: 403 });
  });
});

describe("unpublish", () => {
  it("PUBLISHED → UNPUBLISHED: xoá cache, đóng build đang chạy, outbox unpublished + purge trễ 10 phút", async () => {
    const fx = await publishedFixture(h);
    const pf = (await h.c.portfolio.overview(fx.user.id)).portfolio;
    await h.c.publish.publish(fx.user.id, pf?.version ?? 1); // build 2 đang QUEUED
    h.cache.deleted.length = 0;
    expect(await h.c.publish.unpublish(fx.user.id)).toEqual({ status: "UNPUBLISHED" });
    expect((await h.portfolios.findById(fx.portfolioId))?.status).toBe("UNPUBLISHED");
    expect(h.cache.deleted).toContain(fx.slug);
    expect(await h.builds.find(fx.portfolioId, 2)).toMatchObject({ status: "FAILED", error: "Đã ngừng công khai" });
    const unpublished = h.outbox.byJob("portfolio.events").filter((r) => r.type === "portfolio.unpublished");
    expect(unpublished[0].payload).toMatchObject({ event: "portfolio.unpublished", portfolioId: fx.portfolioId, userId: fx.user.id, reason: "UNPUBLISH" });
    const purge = h.outbox.byJob("portfolio.purge-build");
    expect(purge[0]).toMatchObject({ queue: "reports", delayMs: 10 * 60_000, payload: { portfolioId: fx.portfolioId, buildVersion: 1 } });
  });

  it("PORT_011 (409): chưa công khai / đã ngừng; chưa có hồ sơ → 404", async () => {
    const { user } = await draftWithProject();
    await expect(h.c.publish.unpublish(user.id)).rejects.toMatchObject({ errorCode: "PORT_011", statusCode: 409 });
    const fx = await publishedFixture(h, { name: "Người khác" });
    await h.c.publish.unpublish(fx.user.id);
    await expect(h.c.publish.unpublish(fx.user.id)).rejects.toMatchObject({ errorCode: "PORT_011" });
    await expect(h.c.publish.unpublish(seedUser(h, "Chưa có").id)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("build đang dựng bị đóng khi Ngừng công khai → build về muộn KHÔNG 'sống lại' trang (xem test build)", async () => {
    const fx = await publishedFixture(h);
    const pf = (await h.c.portfolio.overview(fx.user.id)).portfolio;
    const { buildVersion } = await h.c.publish.publish(fx.user.id, pf?.version ?? 1);
    await h.c.publish.unpublish(fx.user.id);
    const outcome = await h.c.build.run({ portfolioId: fx.portfolioId, buildVersion }, { retry: false, finalAttempt: false });
    expect(outcome).toBe("SKIPPED");
    expect((await h.portfolios.findById(fx.portfolioId))?.status).toBe("UNPUBLISHED");
  });
});

describe("linkOf (portfolio của người khác)", () => {
  it("PUBLISHED → { url, portfolioId }; nháp/đã ngừng/bị gỡ/không có → 404", async () => {
    const fx = await publishedFixture(h);
    expect(await h.c.publish.linkOf(fx.user.id)).toEqual({ url: `https://superapp.test/p/${fx.slug}`, portfolioId: fx.portfolioId });
    await h.c.publish.unpublish(fx.user.id);
    await expect(h.c.publish.linkOf(fx.user.id)).rejects.toMatchObject({ statusCode: 404 });
    const { user } = await draftWithProject("Nháp");
    await expect(h.c.publish.linkOf(user.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(h.c.publish.linkOf(newObjectId())).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("takedown / restore (vận hành)", () => {
  it("takedown: PUBLISHED → UNPUBLISHED + takenDownAt/By/Reason, xoá cache, đóng build, outbox TAKEDOWN + purge, thông báo chủ, audit, đóng báo cáo mở", async () => {
    const fx = await publishedFixture(h);
    h.cache.deleted.length = 0;
    const r = await h.c.publish.takedown(admin, fx.portfolioId, { reason: "Nội dung giả mạo", reportGroupKey: `PORTFOLIO:${fx.portfolioId}` });
    expect(r).toMatchObject({ status: "UNPUBLISHED", publicUrl: null, takenDownBy: admin.id, takedownReason: "Nội dung giả mạo" });
    expect(r.takenDownAt).not.toBeNull();
    expect(h.cache.deleted).toContain(fx.slug);
    expect(h.outbox.byJob("portfolio.events").some((row) => row.payload["reason"] === "TAKEDOWN")).toBe(true);
    expect(h.outbox.byJob("portfolio.purge-build")).toHaveLength(1);
    expect(h.notifier.calls.at(-1)).toMatchObject({ type: "portfolio.taken-down", recipients: [{ userId: fx.user.id }], refs: { portfolioId: fx.portfolioId } });
    expect(JSON.stringify(h.notifier.calls.at(-1))).not.toContain("Nội dung giả mạo"); // thông báo không lộ lý do nội bộ
    expect(h.audit.records.at(-1)).toMatchObject({ actorId: admin.id, action: "portfolio.takedown", targetType: "Portfolio", targetId: fx.portfolioId, reason: "Nội dung giả mạo" });
    expect(h.reports.closed).toEqual([{ targetType: "PORTFOLIO", targetId: fx.portfolioId, actor: { id: admin.id, role: "admin" }, resolution: "CONTENT_REMOVED", level: "PLATFORM", reason: "Nội dung giả mạo" }]);
  });

  it("idempotent: gỡ lần 2 trả nguyên trạng, không ghi thêm audit/thông báo", async () => {
    const fx = await publishedFixture(h);
    await h.c.publish.takedown(admin, fx.portfolioId, { reason: "Vi phạm lần một" });
    const audits = h.audit.records.length;
    const notes = h.notifier.calls.length;
    const again = await h.c.publish.takedown(admin, fx.portfolioId, { reason: "Vi phạm lần hai" });
    expect(again.takedownReason).toBe("Vi phạm lần một");
    expect(h.audit.records).toHaveLength(audits);
    expect(h.notifier.calls).toHaveLength(notes);
  });

  it("restore: xoá cờ gỡ, KHÔNG tự công khai; PORT_012 khi không bị gỡ; audit", async () => {
    const fx = await publishedFixture(h);
    await expect(h.c.publish.restore(admin, fx.portfolioId, "Nhầm lẫn khi kiểm duyệt")).rejects.toMatchObject({ errorCode: "PORT_012", statusCode: 409 });
    await h.c.publish.takedown(admin, fx.portfolioId, { reason: "Vi phạm quy định" });
    const r = await h.c.publish.restore(admin, fx.portfolioId, "Đã xác minh chủ hồ sơ chính chủ");
    expect(r).toMatchObject({ status: "UNPUBLISHED", takenDownAt: null, takedownReason: null, publicUrl: null });
    expect(h.audit.records.at(-1)).toMatchObject({ action: "portfolio.restore" });
    const pf = (await h.c.portfolio.overview(fx.user.id)).portfolio;
    await expect(h.c.publish.publish(fx.user.id, pf?.version ?? 1)).resolves.toBeDefined(); // chủ tự công khai lại
  });

  it("hồ sơ không tồn tại → 404 (RES_001)", async () => {
    await expect(h.c.publish.takedown(admin, newObjectId(), { reason: "Vi phạm quy định" })).rejects.toMatchObject({ errorCode: "RES_001" });
    await expect(h.c.publish.restore(admin, newObjectId(), "Không có hồ sơ này")).rejects.toMatchObject({ statusCode: 404 });
    await expect(h.c.publish.adminGet(newObjectId())).rejects.toMatchObject({ statusCode: 404 });
  });

  it("adminGet: metadata cho drawer báo cáo, không có nội dung hồ sơ", async () => {
    const fx = await publishedFixture(h);
    const dto = await h.c.publish.adminGet(fx.portfolioId);
    expect(dto).toMatchObject({ id: fx.portfolioId, userId: fx.user.id, slug: fx.slug, status: "PUBLISHED", publicUrl: `https://superapp.test/p/${fx.slug}` });
    expect(Object.keys(dto)).not.toEqual(expect.arrayContaining(["bio", "projects", "links"]));
  });

  it("lỗi khi đóng báo cáo không làm hỏng việc gỡ (best-effort)", async () => {
    const fx = await publishedFixture(h);
    jest.spyOn(h.reports, "closeOpenByTarget").mockRejectedValue(new Error("moderation down"));
    await expect(h.c.publish.takedown(admin, fx.portfolioId, { reason: "Vi phạm quy định" })).resolves.toMatchObject({ status: "UNPUBLISHED" });
  });
});
