import { installMocks, redisStore } from "./portfolio-test-mocks";
import request from "supertest";
import { prisma } from "../../../../infrastructure/database";
import { cleanup, ensurePortfolioIndexes, buildRig, makeApi, seedContribution, seedResources, seedUser, seedWorkspace, setConsent, tokenFor, type Api, type Rig } from "./portfolio-test-kit";

/**
 * Luồng đầu-cuối trên Mongo thật + Express (kho Prisma, nguồn số liệu Prisma đọc `ContributionSnapshot/TaskFact/Resource`, outbox/notify thật):
 * CR-04, CR-05 (qua HTTP `/p/:slug`), CR-31, CR-32, CR-33, CR-34, CR-35 (đua CAS thật), CR-36, gỡ vi phạm.
 */
let rig: Rig;
let api: Api;
const users: string[] = [];
const workspaces: string[] = [];
const buildOnce = (portfolioId: string, buildVersion: number) => rig.c.build.run({ portfolioId, buildVersion }, { retry: false, finalAttempt: false });
const publicGet = (path: string) => request(rig.app).get(path);
const CSP = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

beforeAll(async () => {
  installMocks();
  await ensurePortfolioIndexes();
  rig = buildRig();
  api = makeApi(rig.app);
});

beforeEach(() => {
  installMocks();
  redisStore.clear();
  rig.storage.objects.clear();
  rig.cache.map.clear();
  rig.reports.closed.length = 0;
});

afterAll(async () => {
  await cleanup(users, workspaces);
});

const sections = [
  { kind: "ABOUT", visible: true, order: 0 },
  { kind: "PROJECTS", visible: true, order: 1 },
  { kind: "SKILLS", visible: true, order: 2 },
  { kind: "CONTACT", visible: true, order: 3 },
];

interface Fx {
  userId: string;
  token: string;
  workspaceId: string;
  portfolioId: string;
  projectId: string;
  slug: string;
  mates: { lan: string; minh: string; khoa: string };
}

/** Người dùng + nhóm có số liệu đóng góp + 3 đồng đội (Lan đồng ý hiện tên) → hồ sơ + dự án qua API; CHƯA publish. */
async function setup(name: string, over: { bio?: string; consentLan?: boolean } = {}): Promise<Fx> {
  const userId = await seedUser(name);
  const lan = await seedUser("Lan Anh");
  const minh = await seedUser("Minh Quân");
  const khoa = await seedUser("Khoa Đăng");
  users.push(userId, lan, minh, khoa);
  if (over.consentLan !== false) await setConsent(lan, true);
  const workspaceId = await seedWorkspace(`Nhóm ${name}`, userId);
  workspaces.push(workspaceId);
  await seedContribution(workspaceId, userId, [lan, minh, khoa]);
  await seedResources(workspaceId, userId, 7);
  rig.contribution.scores.set(`${userId}:${workspaceId}`, { scoreX10: 910, shareX10: 310, boards: 1 });
  const token = tokenFor(userId);
  const created = await api("put", "/me/portfolio", token, { displayName: name, headline: "Lập trình viên", bio: over.bio ?? "Tôi thích xây sản phẩm.", avatarAssetId: null, links: [{ label: "GitHub", url: "https://github.com/an-dev" }], theme: { template: "CLASSIC", accent: "GREEN" }, sections, seoIndexable: false, expectedVersion: 0 });
  const project = await api("post", "/me/portfolio/projects", token, { workspaceId });
  return { userId, token, workspaceId, portfolioId: created.body.data.id, projectId: project.body.data.id, slug: created.body.data.slug, mates: { lan, minh, khoa } };
}

async function publish(fx: Fx): Promise<number> {
  const pf = (await api("get", "/me/portfolio", fx.token)).body.data.portfolio;
  const res = await api("post", "/me/portfolio/publish", fx.token, { expectedVersion: pf.version });
  expect(res.status).toBe(202);
  await buildOnce(fx.portfolioId, res.body.data.buildVersion);
  return res.body.data.buildVersion as number;
}

describe("CR-04 / CR-05 / CR-33 — trang công khai qua HTTP", () => {
  it("publish → build → GET /p/:slug 200 (header an toàn, số liệu, KHÔNG tên đồng đội, script bị thoát) → Ngừng công khai → 404 ngay", async () => {
    const fx = await setup("Nguyễn Văn An", { bio: `<script>alert("xss")</script> Tôi thích xây sản phẩm.` });
    const queuedRows = await prisma.outboxEvent.findMany({ where: { dedupeKey: { startsWith: `portfolio.build:portfolio:${fx.portfolioId}` } } });
    expect(queuedRows).toHaveLength(0);
    const buildVersion = await publish(fx);
    const row = await prisma.outboxEvent.findFirst({ where: { dedupeKey: `portfolio.build:portfolio:${fx.portfolioId}:b${buildVersion}` } });
    expect(row).toMatchObject({ queue: "reports", jobName: "portfolio.build", type: "portfolio.build" });

    const res = await publicGet(`/p/${fx.slug}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(res.headers["content-security-policy"]).toBe(CSP); // ĐÈ CSP mặc định của helmet
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["referrer-policy"]).toBe("no-referrer"); // ĐÈ strict-origin-when-cross-origin
    expect(res.headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(res.headers["cache-control"]).toBe("public, max-age=300");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.text).toContain("Làm cùng 3 đồng đội");
    expect(res.text).toContain("40 task");
    expect(res.text).toContain("62 điểm");
    expect(res.text).toContain("90%");
    expect(res.text).toContain("91/100");
    expect(res.text).toContain("7 tệp");
    for (const name of ["Lan Anh", "Minh Quân", "Khoa Đăng"]) expect(res.text).not.toContain(name);
    expect(res.text).not.toMatch(/<script/i);
    expect(res.text).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    expect((await publicGet(`/p/${fx.slug.toUpperCase()}`)).status).toBe(200);

    const off = await api("post", "/me/portfolio/unpublish", fx.token);
    expect(off.body.data).toEqual({ status: "UNPUBLISHED" });
    const gone = await publicGet(`/p/${fx.slug}`);
    expect(gone.status).toBe(404);
    expect(gone.text).toContain("Không tìm thấy trang");
    expect(gone.headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(gone.headers["cache-control"]).toBe("public, max-age=60");
    expect(gone.headers["content-security-policy"]).toBe(CSP);
    expect((await publicGet("/p/khong-ton-tai-xyz")).text).toBe(gone.text); // cùng một trang 404 trung tính
    expect((await publicGet(`/p/${fx.slug}/assets/img-abcdef12.webp`)).status).toBe(404);
  });

  it("GET /users/:id/portfolio-link: người khác thấy link khi PUBLISHED (kèm portfolioId để báo cáo), 404 sau khi ngừng", async () => {
    const fx = await setup("Trần Bích");
    await publish(fx);
    const viewer = tokenFor(fx.mates.lan);
    const ok = await api("get", `/users/${fx.userId}/portfolio-link`, viewer);
    expect(ok.body.data).toEqual({ url: `https://superapp.test/p/${fx.slug}`, portfolioId: fx.portfolioId });
    await api("post", "/me/portfolio/unpublish", fx.token);
    expect((await api("get", `/users/${fx.userId}/portfolio-link`, viewer)).status).toBe(404);
  });
});

describe("CR-31 — đồng đội theo đồng ý", () => {
  it("showTeammates=true: chỉ tên người đã bật appearInOthersPortfolios; hai người còn lại là 'Đồng đội'", async () => {
    const fx = await setup("Lê Văn Cường");
    const patch = await api("patch", `/me/portfolio/projects/${fx.projectId}`, fx.token, { expectedVersion: 1, showTeammates: true });
    expect(patch.body.data.snapshot).toMatchObject({ teammatesCount: 3, namedTeammates: ["Lan Anh"] });
    await publish(fx);
    const html = (await publicGet(`/p/${fx.slug}`)).text;
    expect(html).toContain("Làm cùng 3 đồng đội: Lan Anh, Đồng đội, Đồng đội");
    expect(html).not.toContain("Minh Quân");
    expect(html).not.toContain("Khoa Đăng");
  });

  it("đồng đội rút đồng ý → lần build kế tiếp không còn tên (snapshot chụp lại lúc Publish)", async () => {
    const fx = await setup("Phạm Thu");
    await api("patch", `/me/portfolio/projects/${fx.projectId}`, fx.token, { expectedVersion: 1, showTeammates: true });
    await publish(fx);
    expect((await publicGet(`/p/${fx.slug}`)).text).toContain("Lan Anh");
    await prisma.userCareer.updateMany({ where: { userId: fx.mates.lan }, data: { visibility: { set: { showSkills: true, proofTitles: false, showContribution: false, showQuiz: false, appearInOthersPortfolios: false } } } });
    await publish(fx);
    expect((await publicGet(`/p/${fx.slug}`)).text).not.toContain("Lan Anh");
  });
});

describe("CR-32 — huy hiệu bị thu hồi sau khi publish", () => {
  it("skill.revoked → build mới tự chạy → trang công khai không còn huy hiệu", async () => {
    const fx = await setup("Vũ Đức");
    rig.career.addBadge(fx.userId, "ReactJS");
    rig.career.addBadge(fx.userId, "NodeJS");
    await publish(fx);
    expect((await publicGet(`/p/${fx.slug}`)).text).toContain("ReactJS");
    rig.career.revokeBadge(fx.userId, "ReactJS");
    expect(await rig.c.events.onSkillRevoked(fx.userId)).toBe("SCHEDULED");
    const b2 = await prisma.portfolioBuild.findFirst({ where: { portfolioId: fx.portfolioId, trigger: "SKILL_REVOKED" } });
    expect(b2).toMatchObject({ buildVersion: 2, status: "QUEUED", createdBy: null });
    await buildOnce(fx.portfolioId, 2);
    const html = (await publicGet(`/p/${fx.slug}`)).text;
    expect(html).not.toContain("ReactJS");
    expect(html).toContain("NodeJS");
  });
});

describe("CR-34 — đổi slug: 301 trong 30 ngày, người khác không lấy được", () => {
  it("slug cũ 301 sang slug mới (Location tuyệt đối), slug mới phục vụ; người khác 409; hết hạn → 404 rồi lấy được", async () => {
    const fx = await setup("Đặng An");
    await publish(fx);
    const pf = (await api("get", "/me/portfolio", fx.token)).body.data.portfolio;
    const change = await api("put", "/me/portfolio/slug", fx.token, { slug: "an-nguyen-cr34", expectedVersion: pf.version });
    expect(change.status).toBe(200);
    const moved = await publicGet(`/p/${fx.slug}`).redirects(0);
    expect(moved.status).toBe(301);
    expect(moved.headers["location"]).toBe("https://superapp.test/p/an-nguyen-cr34");
    expect(moved.headers["cache-control"]).toBe("public, max-age=300");
    expect((await publicGet("/p/an-nguyen-cr34")).status).toBe(200);

    const stranger = await seedUser("Kẻ chiếm");
    users.push(stranger);
    const strangerPf = await api("put", "/me/portfolio", tokenFor(stranger), { displayName: "Kẻ chiếm", headline: null, bio: "x", avatarAssetId: null, links: [], theme: { template: "CLASSIC", accent: "GREEN" }, sections, seoIndexable: false, expectedVersion: 0 });
    const taken = await api("put", "/me/portfolio/slug", tokenFor(stranger), { slug: fx.slug, expectedVersion: strangerPf.body.data.version });
    expect([taken.status, taken.body.error.code]).toEqual([409, "PORT_001"]);

    // hết hạn giữ chỗ (30 ngày) → 404; cron dọn → slug được giải phóng
    await prisma.portfolioSlugReservation.updateMany({ where: { slugKey: fx.slug }, data: { expiresAt: new Date(Date.now() - 1000) } });
    rig.cache.map.clear();
    expect((await publicGet(`/p/${fx.slug}`).redirects(0)).status).toBe(404);
    expect(await rig.c.events.cleanupReservations()).toBeGreaterThanOrEqual(1);
    const ok = await api("put", "/me/portfolio/slug", tokenFor(stranger), { slug: fx.slug, expectedVersion: strangerPf.body.data.version });
    expect(ok.status).toBe(200);
  });
});

describe("CR-35 — build chạy hai lần cùng buildVersion (đua CAS trên Mongo thật)", () => {
  it("chỉ MỘT bản ghi READY, MỘT bộ object, MỘT sự kiện published", async () => {
    const fx = await setup("Hoàng Kiên");
    const pf = (await api("get", "/me/portfolio", fx.token)).body.data.portfolio;
    const res = await api("post", "/me/portfolio/publish", fx.token, { expectedVersion: pf.version });
    const buildVersion = res.body.data.buildVersion as number;
    const outcomes = await Promise.all([buildOnce(fx.portfolioId, buildVersion), buildOnce(fx.portfolioId, buildVersion), buildOnce(fx.portfolioId, buildVersion)]);
    expect(outcomes.filter((o) => o === "READY")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "SKIPPED")).toHaveLength(2);
    const builds = await prisma.portfolioBuild.findMany({ where: { portfolioId: fx.portfolioId } });
    expect(builds).toHaveLength(1);
    expect(builds[0]).toMatchObject({ status: "READY", files: ["index.html"] });
    expect(rig.storage.keys()).toEqual([`portfolio/${fx.portfolioId}/b${buildVersion}/index.html`]);
    const published = await prisma.outboxEvent.findMany({ where: { dedupeKey: `portfolio.published:portfolio:${fx.portfolioId}:b${buildVersion}` } });
    expect(published).toHaveLength(1);
    expect(await buildOnce(fx.portfolioId, buildVersion)).toBe("SKIPPED"); // lần nữa sau khi xong
  });
});

describe("CR-36 — tài khoản bị ẩn danh hoá", () => {
  it("trang 404, object xoá, hồ sơ/dự án/build xoá, slug giữ 30 ngày (redirectTo null), sự kiện ANONYMIZED", async () => {
    const fx = await setup("Bùi Hà");
    await publish(fx);
    expect((await publicGet(`/p/${fx.slug}`)).status).toBe(200);
    expect(await rig.c.events.onUserAnonymized(fx.userId)).toBe("DELETED");
    expect((await publicGet(`/p/${fx.slug}`)).status).toBe(404);
    expect(rig.storage.keys()).toEqual([]);
    expect(await prisma.portfolio.count({ where: { id: fx.portfolioId } })).toBe(0);
    expect(await prisma.portfolioProject.count({ where: { portfolioId: fx.portfolioId } })).toBe(0);
    expect(await prisma.portfolioBuild.count({ where: { portfolioId: fx.portfolioId } })).toBe(0);
    const held = await prisma.portfolioSlugReservation.findUnique({ where: { slugKey: fx.slug } });
    expect(held?.redirectTo).toBeNull();
    expect(held!.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 86_400_000);
    const evt = await prisma.outboxEvent.findFirst({ where: { type: "portfolio.unpublished", aggregateId: fx.portfolioId } });
    expect(evt?.payload).toMatchObject({ reason: "ANONYMIZED", userId: fx.userId });
    expect(await rig.c.events.onUserAnonymized(fx.userId)).toBe("NONE");
  });
});

describe("gỡ vi phạm (moderation)", () => {
  it("takedown: trang 404 NGAY, chủ publish → 403 PORT_008, thông báo + audit + đóng báo cáo; restore → công khai lại được; quyền/validate", async () => {
    const fx = await setup("Ngô Mai");
    await publish(fx);
    const admin = tokenFor(await seedUserTracked("Quản trị"), "admin");
    const path = `/admin/portfolios/${fx.portfolioId}`;

    expect((await api("get", path, fx.token)).status).toBe(403); // người dùng thường
    expect((await api("post", `${path}/takedown`, fx.token, { reason: "Vi phạm quy định" })).status).toBe(403);
    expect((await api("post", `${path}/takedown`, admin, { reason: "ngắn" })).status).toBe(400);
    expect((await api("get", path, admin)).body.data).toMatchObject({ id: fx.portfolioId, status: "PUBLISHED", publicUrl: `https://superapp.test/p/${fx.slug}` });

    const res = await api("post", `${path}/takedown`, admin, { reason: "Giả mạo tổ chức, nhiều báo cáo", reportGroupKey: `PORTFOLIO:${fx.portfolioId}` });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "UNPUBLISHED", publicUrl: null, takedownReason: "Giả mạo tổ chức, nhiều báo cáo" });
    expect((await publicGet(`/p/${fx.slug}`)).status).toBe(404);
    const blocked = await api("post", "/me/portfolio/publish", fx.token, { expectedVersion: (await api("get", "/me/portfolio", fx.token)).body.data.portfolio.version });
    expect([blocked.status, blocked.body.error.code]).toEqual([403, "PORT_008"]);
    const me = (await api("get", "/me/portfolio", fx.token)).body.data.portfolio;
    expect(me).toMatchObject({ takenDown: true, status: "UNPUBLISHED" });
    expect(me).not.toHaveProperty("takedownReason"); // chủ hồ sơ không thấy ghi chú xử lý nội bộ
    const note = await prisma.notification.findFirst({ where: { type: "portfolio.taken-down", dedupeKey: { startsWith: `portfolio-taken-down:${fx.portfolioId}:` } } });
    expect(note).not.toBeNull();
    expect(await prisma.notificationRecipient.count({ where: { recipientId: fx.userId, notificationId: note?.id } })).toBe(1);
    expect(rig.audit.records.at(-1)).toMatchObject({ action: "portfolio.takedown", targetId: fx.portfolioId, reason: "Giả mạo tổ chức, nhiều báo cáo" });
    expect(rig.reports.closed).toHaveLength(1);

    expect((await api("post", `${path}/takedown`, admin, { reason: "Gỡ lần hai vẫn hợp lệ" })).status).toBe(200); // idempotent
    const restored = await api("post", `${path}/restore`, admin, { reason: "Đã xác minh chính chủ, mở lại" });
    expect(restored.body.data).toMatchObject({ takenDownAt: null, status: "UNPUBLISHED" });
    expect((await api("post", `${path}/restore`, admin, { reason: "Mở lại lần hai" })).body.error.code).toBe("PORT_012");
    const again = await api("post", "/me/portfolio/publish", fx.token, { expectedVersion: (await api("get", "/me/portfolio", fx.token)).body.data.portfolio.version });
    expect(again.status).toBe(202);
    expect((await api("get", `/admin/portfolios/${"0".repeat(24)}`, admin)).status).toBe(404);
  });
});

async function seedUserTracked(name: string): Promise<string> {
  const id = await seedUser(name);
  users.push(id);
  return id;
}
