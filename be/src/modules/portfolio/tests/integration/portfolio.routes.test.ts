import { installMocks, redisStore } from "./portfolio-test-mocks";
import { buildRig, ensurePortfolioIndexes, cleanup, makeApi, seedContribution, seedUser, seedWorkspace, tokenFor, type Api, type Rig } from "./portfolio-test-kit";
import { newObjectId } from "../../../../core/utils/object-id";

/**
 * Hợp đồng HTTP phía NGƯỜI DÙNG (Prisma thật + Express): xác thực, validate `.strict()`, CAS phiên bản, PORT_004/005/006, Idempotency-Key,
 * giới hạn "Làm mới" (429 PORT_007), thứ tự dự án, xem trước (header), Publish 202 (PORT_009/010), Ngừng công khai (PORT_011), link người khác.
 */
let rig: Rig;
let api: Api;
const users: string[] = [];
const workspaces: string[] = [];
let me: string;
let other: string;
let third: string;
let ws: string;

beforeAll(async () => {
  installMocks();
  await ensurePortfolioIndexes();
  rig = buildRig();
  api = makeApi(rig.app);
  me = await seedUser("Nguyễn Văn An");
  other = await seedUser("Người khác");
  third = await seedUser("Bạn thứ ba");
  users.push(me, other, third);
  ws = await seedWorkspace("Nhóm Đồ án kho", me);
  workspaces.push(ws);
  await seedContribution(ws, me);
});

beforeEach(() => {
  installMocks();
  redisStore.clear();
});

afterAll(async () => {
  await cleanup(users, workspaces);
});

const profile = (over: Record<string, unknown> = {}) => ({
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
  seoIndexable: false,
  expectedVersion: 0,
  ...over,
});

describe("xác thực và dạng dữ liệu", () => {
  it("không token → 401 cho mọi route người dùng", async () => {
    for (const [method, path] of [["get", "/me/portfolio"], ["put", "/me/portfolio"], ["post", "/me/portfolio/publish"], ["get", "/portfolio/templates"], ["get", `/users/${me}/portfolio-link`]] as const) {
      expect((await api(method, path, null)).status).toBe(401);
    }
  });

  it("GET /me/portfolio khi chưa tạo → data { portfolio: null, projects: [], latestBuild: null, publicUrl: null }", async () => {
    const res = await api("get", "/me/portfolio", tokenFor(other));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ portfolio: null, projects: [], latestBuild: null, publicUrl: null });
  });

  it("PUT /me/portfolio: trường lạ (.strict), liên kết không phải https, mục thiếu/trùng, tên ngắn, mẫu lạ → 400 VAL_001", async () => {
    const bad: Array<Record<string, unknown>> = [
      profile({ evil: 1 }),
      profile({ links: [{ label: "x", url: "javascript:alert(1)" }] }),
      profile({ links: [{ label: "x", url: "http://khong-bao-mat.com" }] }),
      profile({ links: Array.from({ length: 7 }, (_, i) => ({ label: `l${i}`, url: "https://x.com" })) }),
      profile({ sections: [{ kind: "ABOUT", visible: true, order: 0 }] }),
      profile({ sections: Array.from({ length: 4 }, () => ({ kind: "ABOUT", visible: true, order: 0 })) }),
      profile({ displayName: "A" }),
      profile({ theme: { template: "NEON", accent: "BLUE" } }),
      profile({ bio: "x".repeat(601) }),
      profile({ expectedVersion: undefined }),
    ];
    for (const body of bad) {
      const res = await api("put", "/me/portfolio", tokenFor(me), body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VAL_001");
    }
  });

  it("bio đếm GRAPHEME: 600 emoji ghép vẫn hợp lệ (client cũng đếm grapheme)", async () => {
    const family = "👨‍👩‍👧";
    const res = await api("put", "/me/portfolio", tokenFor(third), profile({ bio: family.repeat(600) }));
    expect(res.status).toBe(200);
  });
});

describe("hồ sơ: tạo lười, CAS, slug", () => {
  it("PUT lần đầu (expectedVersion 0) tạo hồ sơ; PUT tiếp với version đúng; lệch → 409 RES_003 kèm currentVersion", async () => {
    const created = await api("put", "/me/portfolio", tokenFor(me), profile());
    expect(created.status).toBe(200);
    expect(created.body.data).toMatchObject({ displayName: "Nguyễn Văn An", version: 1, status: "DRAFT", takenDown: false, hasUnpublishedChanges: false });
    expect(created.body.data.slug).toMatch(/^nguyen-van-an-[0-9a-f]{4}$/);
    const v2 = await api("put", "/me/portfolio", tokenFor(me), profile({ expectedVersion: 1, headline: "Fullstack" }));
    expect(v2.body.data).toMatchObject({ headline: "Fullstack", version: 2 });
    const stale = await api("put", "/me/portfolio", tokenFor(me), profile({ expectedVersion: 1 }));
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatchObject({ code: "RES_003", details: { currentVersion: 2 } });
  });

  it("slug-available + PUT slug: PORT_002 / PORT_003 / PORT_001 (CR-10) và đổi thành công", async () => {
    const t = tokenFor(me);
    expect((await api("get", "/portfolio/slug-available?slug=an-moi", t)).body.data).toEqual({ available: true });
    expect((await api("get", "/portfolio/slug-available?slug=admin", t)).body.data).toEqual({ available: false, reason: "RESERVED" });
    expect((await api("get", "/portfolio/slug-available?slug=A--B", t)).body.data).toEqual({ available: false, reason: "INVALID" });
    const cur = (await api("get", "/me/portfolio", t)).body.data.portfolio;
    for (const [slug, code, status] of [["ab", "PORT_002", 400], ["admin", "PORT_003", 400]] as const) {
      const res = await api("put", "/me/portfolio/slug", t, { slug, expectedVersion: cur.version });
      expect([res.status, res.body.error.code]).toEqual([status, code]);
    }
    const thirdSlug = (await api("get", "/me/portfolio", tokenFor(third))).body.data.portfolio.slug;
    const taken = await api("put", "/me/portfolio/slug", t, { slug: thirdSlug, expectedVersion: cur.version });
    expect([taken.status, taken.body.error.code]).toEqual([409, "PORT_001"]);
    const ok = await api("put", "/me/portfolio/slug", t, { slug: "An-Nguyen", expectedVersion: cur.version });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ slug: "an-nguyen", version: cur.version + 1 });
  });

  it("slug-available bị giới hạn 60 lượt/phút/người dùng", async () => {
    const t = tokenFor(other);
    let last = 200;
    for (let i = 0; i < 61; i += 1) last = (await api("get", "/portfolio/slug-available?slug=an-thu", t)).status;
    expect(last).toBe(429);
  });

  it("GET /portfolio/templates: 4 mẫu × 6 màu", async () => {
    const res = await api("get", "/portfolio/templates", tokenFor(me));
    expect(res.body.data).toHaveLength(4);
    expect(res.body.data[0]).toMatchObject({ template: "CLASSIC", previewImageUrl: null });
    expect(res.body.data[0].accents).toHaveLength(6);
  });
});

describe("dự án", () => {
  let projectId: string;

  it("eligible-workspaces: nhóm có thẻ Done của tôi (cursor)", async () => {
    const res = await api("get", "/me/portfolio/eligible-workspaces", tokenFor(me));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ workspaceId: ws, name: "Nhóm Đồ án kho", archived: false, left: false, myTasksDone: 40, alreadyAdded: false }]);
    expect(res.body.meta).toMatchObject({ hasMore: false, nextCursor: null });
    expect((await api("get", "/me/portfolio/eligible-workspaces", tokenFor(other))).body.data).toEqual([]);
  });

  it("POST projects: 201 + snapshot đúng; Idempotency-Key trả lại đúng phản hồi cũ; trùng nhóm 409 PORT_006; nhóm lạ 404 PORT_004", async () => {
    const t = tokenFor(me);
    const key = { "Idempotency-Key": "add-project-key-0001" };
    const res = await api("post", "/me/portfolio/projects", t, { workspaceId: ws }, key);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ workspaceId: ws, title: "Nhóm Đồ án kho", visible: true, order: 0, version: 1 });
    expect(res.body.data.snapshot).toMatchObject({ tasksDone: 40, storyPoints: 62, onTimeRatePct: 90, peerReviewAvg: 8.5, filesUploaded: 0, teammatesCount: 0 });
    projectId = res.body.data.id;
    const replay = await api("post", "/me/portfolio/projects", t, { workspaceId: ws }, key);
    expect(replay.status).toBe(201);
    expect(replay.headers["idempotent-replayed"]).toBe("true");
    expect(replay.body.data.id).toBe(projectId);
    const dup = await api("post", "/me/portfolio/projects", t, { workspaceId: ws });
    expect([dup.status, dup.body.error.code]).toEqual([409, "PORT_006"]);
    const none = await api("post", "/me/portfolio/projects", t, { workspaceId: newObjectId() });
    expect([none.status, none.body.error.code]).toEqual([404, "PORT_004"]);
    expect((await api("post", "/me/portfolio/projects", t, { workspaceId: "khong-phai-id" })).status).toBe(400);
  });

  it("PATCH: sửa + CAS; dự án của người khác 404; trường lạ/ngày đảo 400; DELETE của người khác 404", async () => {
    const t = tokenFor(me);
    const ok = await api("patch", `/me/portfolio/projects/${projectId}`, t, { expectedVersion: 1, title: "Hệ thống kho", summary: "Tóm tắt\nDòng 2", highlights: ["Điểm nổi bật"], visible: true, periodFrom: "2025-09-01", periodTo: "2025-12-01" });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ title: "Hệ thống kho", version: 2, periodFrom: "2025-09-01T00:00:00.000Z" });
    expect((await api("patch", `/me/portfolio/projects/${projectId}`, t, { expectedVersion: 1, title: "Cũ" })).body.error.code).toBe("RES_003");
    expect((await api("patch", `/me/portfolio/projects/${projectId}`, t, { expectedVersion: 2, hack: true })).status).toBe(400);
    expect((await api("patch", `/me/portfolio/projects/${projectId}`, t, { expectedVersion: 2, periodFrom: "2026-01-01", periodTo: "2025-01-01" })).status).toBe(400);
    expect((await api("patch", `/me/portfolio/projects/${projectId}`, t, { title: "Thiếu version" })).status).toBe(400);
    expect((await api("patch", `/me/portfolio/projects/${projectId}`, tokenFor(other), { expectedVersion: 2, title: "Chiếm" })).status).toBe(404);
    expect((await api("delete", `/me/portfolio/projects/${projectId}`, tokenFor(other))).status).toBe(404);
  });

  it("refresh: 10 lượt/giờ, lượt 11 → 429 PORT_007 kèm retryAfterSeconds", async () => {
    const t = tokenFor(me);
    for (let i = 0; i < 10; i += 1) expect((await api("post", `/me/portfolio/projects/${projectId}/refresh`, t)).status).toBe(200);
    const limited = await api("post", `/me/portfolio/projects/${projectId}/refresh`, t);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("PORT_007");
    expect(limited.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("order: đúng tập id → 200; thiếu/thừa → 400 VAL_001", async () => {
    const t = tokenFor(me);
    expect((await api("put", "/me/portfolio/projects/order", t, { projectIds: [projectId] })).status).toBe(200);
    const missing = await api("put", "/me/portfolio/projects/order", t, { projectIds: [] });
    expect([missing.status, missing.body.error.code]).toEqual([400, "VAL_001"]);
    expect((await api("put", "/me/portfolio/projects/order", t, { projectIds: [projectId, newObjectId()] })).status).toBe(400);
  });
});

describe("xem trước, Publish, Ngừng công khai", () => {
  it("preview: text/html, no-store, noindex, CSP chỉ cho ảnh data:, không script; 404 khi chưa có hồ sơ", async () => {
    const res = await api("get", "/me/portfolio/preview?template=MINIMAL&accent=ROSE", tokenFor(me));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(res.headers["content-security-policy"]).toBe("default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.text).toContain("Bản xem trước");
    expect(res.text).toContain("tpl-minimal");
    expect(res.text).not.toMatch(/<script/i);
    const noPf = await api("get", "/me/portfolio/preview", tokenFor(await seedUserTracked("Chưa hồ sơ")));
    expect(noPf.status).toBe(404);
    expect((await api("get", "/me/portfolio/preview?template=NEON", tokenFor(me))).status).toBe(400);
  });

  it("publish: 202 { buildId, buildVersion } → PORT_009 khi đang dựng; version lệch 409; chưa có nội dung 400 PORT_010 kèm mục trống", async () => {
    const t = tokenFor(me);
    const pf = (await api("get", "/me/portfolio", t)).body.data.portfolio;
    const stale = await api("post", "/me/portfolio/publish", t, { expectedVersion: pf.version + 3 });
    expect([stale.status, stale.body.error.code]).toEqual([409, "RES_003"]);
    const res = await api("post", "/me/portfolio/publish", t, { expectedVersion: pf.version });
    expect(res.status).toBe(202);
    expect(res.body.data).toMatchObject({ buildVersion: 1 });
    expect(typeof res.body.data.buildId).toBe("string");
    const busy = await api("post", "/me/portfolio/publish", t, { expectedVersion: pf.version });
    expect([busy.status, busy.body.error.code]).toEqual([409, "PORT_009"]);
    const latest = await api("get", "/me/portfolio/builds/latest", t);
    expect(latest.body.data).toMatchObject({ id: res.body.data.buildId, buildVersion: 1, status: "QUEUED", trigger: "PUBLISH" });
    expect((await api("get", "/me/portfolio/builds/latest", tokenFor(third))).body.data).toBeNull(); // có hồ sơ nhưng chưa từng build
    const empty = await seedUserTracked("Trống");
    await api("put", "/me/portfolio", tokenFor(empty), profile({ bio: null, links: [], displayName: "Trống" }));
    const none = await api("post", "/me/portfolio/publish", tokenFor(empty), { expectedVersion: 1 });
    expect([none.status, none.body.error.code]).toEqual([400, "PORT_010"]);
    expect(none.body.error.details.emptySections).toEqual(expect.arrayContaining(["ABOUT", "PROJECTS", "CONTACT"]));
  });

  it("unpublish khi chưa công khai → 409 PORT_011; portfolio-link của tôi chưa công khai → 404", async () => {
    const res = await api("post", "/me/portfolio/unpublish", tokenFor(me));
    expect([res.status, res.body.error.code]).toEqual([409, "PORT_011"]);
    expect((await api("get", `/users/${me}/portfolio-link`, tokenFor(other))).status).toBe(404);
    expect((await api("get", "/users/khong-hop-le/portfolio-link", tokenFor(other))).status).toBe(400);
  });
});

async function seedUserTracked(name: string): Promise<string> {
  const id = await seedUser(name);
  users.push(id);
  return id;
}
