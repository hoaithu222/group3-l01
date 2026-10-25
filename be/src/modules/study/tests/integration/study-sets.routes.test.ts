/**
 * Integration — `/study-sets*`, `/study-tags/popular`, `/admin/study-sets/*` trên Prisma thật (Mongo memory replset,
 * `TEST_DB=memory`), quyền WORKSPACE qua resolver thật (D-28), `AssetLink`/`Report`/`Outbox` thật; Redis giả có trạng thái.
 *
 * p4-01 README §8: ST-03 (rollback), ST-04 (404 bộ/mục/URL ảnh), ST-18 (bản sao giữ ảnh), ST-19 (admin ẩn), ST-25 (hai phiên soạn
 * cùng expectedVersion) + body 2 MB, báo cáo 2 lần cùng người → 1 báo cáo, `reportedCount` qua consumer `report.events`.
 * ST-20 (chấm điểm) ở `answer-grader.test.ts`; ST-26 (giảm chuyển động) là kịch bản thiết bị của app.
 */
process.env.FEATURE_FLAGS = "study=true";
jest.mock("../../../../core/constants/modules", () => {
  const actual = jest.requireActual("../../../../core/constants/modules");
  return { ...actual, AVAILABLE_MODULES: [...actual.AVAILABLE_MODULES, actual.MODULES.STUDY] };
});

type Processor = (job: { data: unknown }) => Promise<unknown>;
const mockRegistered: Array<[string, string, Processor]> = [];
jest.mock("../../../../infrastructure/queue", () => {
  const actual = jest.requireActual("../../../../infrastructure/queue");
  return {
    ...actual,
    registerJob: (queue: string, jobName: string, fn: Processor) => {
      mockRegistered.push([queue, jobName, fn]);
    },
    enqueue: jest.fn().mockResolvedValue(undefined),
  };
});
jest.mock("../../../../infrastructure/queue/outbox/outbox.writer", () => {
  const actual = jest.requireActual("../../../../infrastructure/queue/outbox/outbox.writer");
  return { ...actual, outboxSignal: jest.fn().mockResolvedValue(undefined) };
});
// Consumer `report.events` phát socket tới `admin:moderation` — Socket.IO không khởi tạo trong Jest.
jest.mock("../../../../infrastructure/socket/socket.emit", () => {
  const actual = jest.requireActual("../../../../infrastructure/socket/socket.emit");
  return { ...actual, emitToRoom: jest.fn() };
});
jest.mock("../../../../infrastructure/redis", () => ({
  redis: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    ping: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    getdel: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    exists: jest.fn(),
    setNx: jest.fn(),
    hset: jest.fn(),
    hgetall: jest.fn(),
    hdel: jest.fn(),
    scanKeys: jest.fn(),
    getClient: jest.fn(),
  },
}));
jest.mock("../../../../core/permission/user-status", () => ({
  getUserStatusCached: jest.fn().mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 }),
  invalidateUserStatusCache: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../../audit-log/audit-log.service", () => ({
  AuditService: jest.fn().mockImplementation(() => ({ record: jest.fn().mockResolvedValue(undefined) })),
}));
jest.mock("../../../../infrastructure/storage", () => ({
  storage: { getSignedUrl: jest.fn().mockResolvedValue("https://signed.example/x"), deleteMany: jest.fn().mockResolvedValue(undefined) },
  buildKey: jest.fn(),
  LocalStorage: jest.fn(),
}));

import request from "supertest";
import { prisma } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
import "../../../moderation/jobs/report-events.consumer"; // side-effect: processor `report.events` qua `registerJob` đã mock
import { PrismaStudyItemRepository } from "../../repositories/study-item.repository.prisma";
import { addMember, buildApp, cleanup, ensureIndexes, registerWorkspaceResolver, seedStudyAsset, seedUser, seedWorkspace, tokenFor } from "../support/fixtures";
import { makeRedisStore, wireRedisMocks } from "../support/redis-store";

const app = buildApp();
const store = makeRedisStore();

const flash = (key: string, extra: Record<string, unknown> = {}) => ({ type: "FLASHCARD", clientItemKey: key, prompt: `Trước ${key}`, answerText: `Sau ${key}`, ...extra });
const mc = (key: string, extra: Record<string, unknown> = {}) => ({
  type: "MULTIPLE_CHOICE",
  clientItemKey: key,
  prompt: `Hỏi ${key}`,
  options: [{ text: "A" }, { text: "B" }],
  correctOptionIndex: 0,
  ...extra,
});

describe("Study set & Flashcard — routes (integration, Mongo memory replset)", () => {
  const userIds: string[] = [];
  const workspaceIds: string[] = [];

  beforeAll(async () => {
    bindPermissionPorts();
    registerWorkspaceResolver();
    await ensureIndexes();
  });
  afterAll(() => resetPermissionPorts());
  beforeEach(() => {
    wireRedisMocks(redis as unknown as Record<string, jest.Mock>, store);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
  });
  afterEach(async () => {
    await cleanup(userIds, workspaceIds);
    userIds.length = 0;
    workspaceIds.length = 0;
    store.clear();
  });

  const as = (userId: string, role?: string) => ({ Authorization: `Bearer ${tokenFor(userId, role)}` });
  const get = (path: string, u: string, role?: string) => request(app).get(`/api/v1${path}`).set(as(u, role));
  const post = (path: string, u: string, body?: object, role?: string) => request(app).post(`/api/v1${path}`).set(as(u, role)).send(body ?? {});
  const patch = (path: string, u: string, body: object) => request(app).patch(`/api/v1${path}`).set(as(u)).send(body);
  const put = (path: string, u: string, body: object) => request(app).put(`/api/v1${path}`).set(as(u)).send(body);
  const del = (path: string, u: string) => request(app).delete(`/api/v1${path}`).set(as(u));

  async function users(...names: string[]): Promise<string[]> {
    const ids = await Promise.all(names.map((n) => seedUser(n)));
    userIds.push(...ids);
    return ids;
  }

  async function mkSet(owner: string, body: Record<string, unknown> = {}): Promise<{ id: string; version: number }> {
    const res = await post("/study-sets", owner, { title: "Từ vựng", ...body });
    expect(res.status).toBe(201);
    return { id: res.body.data.id, version: res.body.data.version };
  }

  const putItems = (owner: string, setId: string, expectedVersion: number, upsert: unknown[], remove: string[] = []) =>
    put(`/study-sets/${setId}/items`, owner, { expectedVersion, upsert, delete: remove });

  describe("ST-03 — lưu hàng loạt trong MỘT transaction", () => {
    it("100 mục, mục 99 (index 98) có đáp án ngoài lựa chọn → 400 STUDY_001 details[0].index=98; DB không đổi", async () => {
      const [author] = await users("Tác giả");
      const { id, version } = await mkSet(author!);
      const rows: unknown[] = Array.from({ length: 100 }, (_, i) => flash(`k${i}`));
      rows[98] = mc("k98", { correctOptionIndex: 9 });
      const res = await putItems(author!, id, version, rows);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("STUDY_001");
      expect(res.body.error.details[0]).toEqual({ index: 98, clientItemKey: "k98", field: "correctOptionIndex", code: "STUDY_005" });
      expect(await prisma.studyItem.count({ where: { setId: id } })).toBe(0);
      expect((await prisma.studySet.findUniqueOrThrow({ where: { id } })).version).toBe(version);
    });

    it("lỗi GIỮA transaction (ghi mục mới thất bại) → ROLLBACK toàn bộ: phiên bản + mục đã sửa trở về như cũ", async () => {
      const [author] = await users("Tác giả");
      const { id, version } = await mkSet(author!);
      const first = await putItems(author!, id, version, [flash("a")]);
      const itemId = first.body.data.idMap[0].id as string;
      jest.spyOn(PrismaStudyItemRepository.prototype, "createMany").mockRejectedValueOnce(new Error("mất kết nối giữa chừng"));
      const res = await putItems(author!, id, first.body.data.version, [flash("a", { id: itemId, prompt: "ĐÃ ĐỔI" }), flash("b")]);
      expect(res.status).toBe(500);
      const set = await prisma.studySet.findUniqueOrThrow({ where: { id } });
      expect(set.version).toBe(first.body.data.version);
      expect(set.itemCount).toBe(1);
      expect((await prisma.studyItem.findUniqueOrThrow({ where: { id: itemId } })).prompt).toBe("Trước a");
      expect(await prisma.studyItem.count({ where: { setId: id } })).toBe(1);
    });

    it("500 mục lưu một lần (≤ 2 MB); mục thứ 501 → 409 STUDY_002; GET items trả đủ theo thứ tự + setVersion", async () => {
      const [author] = await users("Tác giả");
      const { id, version } = await mkSet(author!);
      const rows = Array.from({ length: 500 }, (_, i) => flash(`k${i}`, { prompt: `Thẻ ${i} ${"x".repeat(1500)}` }));
      const res = await putItems(author!, id, version, rows);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ itemCount: 500, version: version + 1 });
      expect(res.body.data.idMap).toHaveLength(500);

      const list = await get(`/study-sets/${id}/items`, author!);
      expect(list.status).toBe(200);
      expect(list.body.data).toHaveLength(500);
      expect(list.body.data[0].prompt.startsWith("Thẻ 0 ")).toBe(true);
      expect(list.body.data[499].prompt.startsWith("Thẻ 499 ")).toBe(true);
      expect(list.body.meta).toMatchObject({ hasMore: false, setVersion: version + 1 });

      const over = await putItems(author!, id, version + 1, [flash("extra")]);
      expect(over.status).toBe(409);
      expect(over.body.error.code).toBe("STUDY_002");
    });

    it("thân yêu cầu > 2 MB → 413 (trước cả validate)", async () => {
      const [author] = await users("Tác giả");
      const { id, version } = await mkSet(author!);
      const res = await putItems(author!, id, version, [flash("a", { prompt: "y".repeat(2.5 * 1024 * 1024) })]);
      expect(res.status).toBe(413);
      expect(res.body.error.details).toEqual({ maxBytes: 2 * 1024 * 1024 });
    });
  });

  describe("ST-25 — hai phiên soạn cùng expectedVersion", () => {
    it("một 200, một 409 RES_003 (details.currentVersion); mục của phiên thua KHÔNG được ghi — lặp 3 vòng", async () => {
      const [author] = await users("Tác giả");
      const { id, version } = await mkSet(author!);
      let current = version;
      for (let round = 0; round < 3; round += 1) {
        const [a, b] = await Promise.all([putItems(author!, id, current, [flash(`a${round}`)]), putItems(author!, id, current, [flash(`b${round}`)])]);
        expect([a.status, b.status].sort()).toEqual([200, 409]);
        const loser = a.status === 409 ? a : b;
        expect(loser.body.error.code).toBe("RES_003");
        expect(loser.body.error.details.currentVersion).toBe(current + 1);
        current += 1;
        expect(await prisma.studyItem.count({ where: { setId: id } })).toBe(round + 1);
      }
    });
  });

  describe("ST-04 — người khác 404 với bộ PRIVATE, mục và URL ảnh", () => {
    it("GET bộ / GET items / GET url ảnh mục → 404 cho người khác (kể cả OWNER nhóm), 200 cho tác giả", async () => {
      const [author, stranger, owner] = await users("Tác giả", "Người lạ", "Chủ nhóm");
      const ws = await seedWorkspace(owner!);
      workspaceIds.push(ws);
      await addMember(ws, author!, "MEMBER");
      const img = await seedStudyAsset(author!);
      const { id, version } = await mkSet(author!);
      expect((await putItems(author!, id, version, [flash("a", { frontMediaAssetId: img })])).status).toBe(200);

      for (const other of [stranger!, owner!]) {
        expect((await get(`/study-sets/${id}`, other)).status).toBe(404);
        expect((await get(`/study-sets/${id}/items`, other)).status).toBe(404);
        expect((await get(`/assets/${img}/url`, other)).status).toBe(404);
      }
      expect((await get(`/study-sets/${id}`, author!)).status).toBe(200);
      expect((await get(`/study-sets/${id}/items`, author!)).status).toBe(200);
      expect((await get(`/assets/${img}/url`, author!)).status).toBe(200);
    });
  });

  describe("ST-18 — bản sao giữ ảnh khi bộ gốc đổi phạm vi", () => {
    it("nhân bản bộ PUBLIC có ảnh; tác giả gốc đổi sang PRIVATE → bản sao VẪN xem được ảnh (AssetLink riêng); người thứ ba thì không", async () => {
      const [author, copier, third] = await users("Tác giả", "Người sao chép", "Người thứ ba");
      const cover = await seedStudyAsset(author!);
      const img = await seedStudyAsset(author!);
      const { id, version } = await mkSet(author!, { visibility: "PUBLIC", confirmPublic: true, coverAssetId: cover });
      expect((await putItems(author!, id, version, [flash("a", { frontMediaAssetId: img }), mc("b")])).status).toBe(200);
      expect((await get(`/assets/${img}/url`, copier!)).status).toBe(200); // PUBLIC → ai cũng đọc

      const dup = await post(`/study-sets/${id}/duplicate`, copier!, {});
      expect(dup.status).toBe(201);
      expect(dup.body.data).toMatchObject({ ownerId: copier, copiedFromId: id, itemCount: 2, title: "Từ vựng (bản sao)", visibility: "PRIVATE" });
      const copyId = dup.body.data.id as string;
      // không sinh asset mới; link mới trỏ CÙNG asset
      expect(await prisma.asset.count({ where: { ownerId: { in: [author!, copier!] } } })).toBe(2);
      const copyItems = await prisma.studyItem.findMany({ where: { setId: copyId }, orderBy: { order: "asc" } });
      expect(copyItems[0]!.frontMediaAssetId).toBe(img);
      expect(await prisma.assetLink.count({ where: { assetId: img } })).toBe(2);
      expect((await prisma.studySet.findUniqueOrThrow({ where: { id } })).copyCount).toBe(1);

      const pat = await patch(`/study-sets/${id}`, author!, { expectedVersion: version + 1, visibility: "PRIVATE" });
      expect(pat.status).toBe(200);
      expect((await get(`/study-sets/${id}`, copier!)).status).toBe(404); // bản gốc đã riêng tư
      expect((await get(`/assets/${img}/url`, copier!)).status).toBe(200); // ảnh vẫn xem được qua bản sao
      expect((await get(`/assets/${cover}/url`, copier!)).status).toBe(200);
      expect((await get(`/assets/${img}/url`, third!)).status).toBe(404);
      expect((await get(`/study-sets/${copyId}/items`, copier!)).body.data).toHaveLength(2);
    });
  });

  describe("ST-19 — admin ẩn bộ PUBLIC", () => {
    it("người khác 404, tác giả thấy status HIDDEN + lý do, biến mất khỏi khám phá, ảnh 404; khôi phục thì trở lại", async () => {
      const [author, stranger, admin] = await users("Tác giả", "Người lạ", "Quản trị");
      const img = await seedStudyAsset(author!);
      const { id, version } = await mkSet(author!, { visibility: "PUBLIC", confirmPublic: true, title: "Bộ công khai" });
      await putItems(author!, id, version, [flash("a", { frontMediaAssetId: img })]);
      expect((await get("/study-sets?scope=public", stranger!)).body.data.map((s: { id: string }) => s.id)).toContain(id);

      const forbidden = await post(`/admin/study-sets/${id}/hide`, author!, { reason: "Vi phạm bản quyền giáo trình" });
      expect(forbidden.status).toBe(403); // thiếu moderation:update
      const noReason = await post(`/admin/study-sets/${id}/hide`, admin!, { reason: "ngắn" }, "admin");
      expect(noReason.status).toBe(400);
      const hidden = await post(`/admin/study-sets/${id}/hide`, admin!, { reason: "Vi phạm bản quyền giáo trình" }, "admin");
      expect(hidden.status).toBe(200);
      expect(hidden.body.data).toMatchObject({ status: "HIDDEN", canViewContent: true });

      expect((await get(`/study-sets/${id}`, stranger!)).status).toBe(404);
      expect((await get(`/study-sets/${id}/items`, stranger!)).status).toBe(404);
      expect((await get(`/assets/${img}/url`, stranger!)).status).toBe(404);
      expect((await get("/study-sets?scope=public", stranger!)).body.data.map((s: { id: string }) => s.id)).not.toContain(id);
      const mine = await get(`/study-sets/${id}`, author!);
      expect(mine.body.data).toMatchObject({ status: "HIDDEN", hiddenReason: "Vi phạm bản quyền giáo trình" });
      expect(mine.body.data.myPermissions).toMatchObject({ edit: false, delete: true });
      expect((await putItems(author!, id, version + 1, [flash("b")])).body.error.code).toBe("STUDY_004");
      expect((await get(`/admin/study-sets/${id}/items?page=1&limit=50`, admin!, "admin")).body.data).toHaveLength(1); // admin xem được nội dung PUBLIC đã ẩn

      const restored = await post(`/admin/study-sets/${id}/restore`, admin!, { reason: "Đã xác minh bản quyền" }, "admin");
      expect(restored.body.data.status).toBe("ACTIVE");
      expect((await get(`/study-sets/${id}`, stranger!)).status).toBe(200);
    });

    it("admin không xem nội dung bộ WORKSPACE (403) và bộ PRIVATE (404)", async () => {
      const [author, owner, admin] = await users("Tác giả", "Chủ nhóm", "Quản trị");
      const ws = await seedWorkspace(owner!);
      workspaceIds.push(ws);
      await addMember(ws, author!, "MEMBER");
      const shared = await mkSet(author!, { visibility: "WORKSPACE", workspaceId: ws });
      const priv = await mkSet(author!);
      expect((await get(`/admin/study-sets/${shared.id}`, admin!, "admin")).body.data).toMatchObject({ canViewContent: false, visibility: "WORKSPACE" });
      expect((await get(`/admin/study-sets/${shared.id}/items`, admin!, "admin")).status).toBe(403);
      expect((await get(`/admin/study-sets/${priv.id}`, admin!, "admin")).status).toBe(404);
    });

    it("GET /admin/study-sets (tab content): chỉ bộ PUBLIC ≥ ngưỡng báo cáo, sắp reportedCount giảm dần; manager xem được, người thường 403", async () => {
      const [author, admin] = await users("Tác giả", "Quản trị");
      const many = await mkSet(author!, { visibility: "PUBLIC", confirmPublic: true, title: "Bị báo cáo nhiều" });
      const some = await mkSet(author!, { visibility: "PUBLIC", confirmPublic: true, title: "Bị báo cáo vừa" });
      const few = await mkSet(author!, { visibility: "PUBLIC", confirmPublic: true, title: "Ít báo cáo" });
      const priv = await mkSet(author!, { title: "Riêng tư" });
      for (const [id, n] of [[many.id, 12], [some.id, 5], [few.id, 2], [priv.id, 40]] as const) await prisma.studySet.update({ where: { id }, data: { reportedCount: n } });

      const res = await get("/admin/study-sets", admin!, "admin");
      expect(res.status).toBe(200);
      expect((res.body.data as Array<{ id: string; reportedCount: number }>).filter((s) => [many.id, some.id, few.id, priv.id].includes(s.id)).map((s) => [s.id, s.reportedCount])).toEqual([
        [many.id, 12],
        [some.id, 5],
      ]);
      expect(res.body.meta).toMatchObject({ page: 1, limit: 20, hasPrev: false });
      const lowered = await get("/admin/study-sets?minReports=2&limit=50", admin!, "manager");
      expect((lowered.body.data as Array<{ id: string }>).map((s) => s.id).filter((id) => [many.id, some.id, few.id, priv.id].includes(id))).toEqual([many.id, some.id, few.id]);
      expect((await get("/admin/study-sets?status=DELETED", admin!, "admin")).status).toBe(400);
      expect((await get("/admin/study-sets", author!)).status).toBe(403);
    });

    it("GET /admin/users/:id/study-summary: chỉ số bộ học (không tiêu đề), người dùng không tồn tại 404, người thường 403", async () => {
      const [author, admin] = await users("Tác giả", "Quản trị");
      await mkSet(author!, { visibility: "PUBLIC", confirmPublic: true });
      await mkSet(author!);
      await mkSet(author!);
      const removed = await mkSet(author!);
      expect((await del(`/study-sets/${removed.id}`, author!)).status).toBe(204);

      const res = await get(`/admin/users/${author}/study-summary`, admin!, "admin");
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ userId: author, total: 3, public: 1, workspace: 0, private: 2, hidden: 0 });
      expect(JSON.stringify(res.body.data)).not.toContain("Từ vựng");
      expect((await get("/admin/users/ffffffffffffffffffffffff/study-summary", admin!, "admin")).status).toBe(404);
      expect((await get(`/admin/users/${author}/study-summary`, author!)).status).toBe(403);
    });
  });

  describe("nhóm (WORKSPACE) — quyền thật", () => {
    it("MEMBER xem/nhân bản/báo cáo; GUEST và người ngoài 404; OWNER ẩn (audit) → MEMBER 404, danh sách nhóm chỉ OWNER/ADMIN còn thấy", async () => {
      const [owner, author, member, guest, outsider] = await users("Chủ nhóm", "Tác giả", "Thành viên", "Khách", "Người ngoài");
      const ws = await seedWorkspace(owner!);
      workspaceIds.push(ws);
      await addMember(ws, author!, "MEMBER");
      await addMember(ws, member!, "MEMBER");
      await addMember(ws, guest!, "GUEST");
      const own = await post("/study-sets", author!, { title: "Bộ nhóm", visibility: "WORKSPACE" });
      expect(own.status).toBe(400);
      expect(own.body.error.code).toBe("STUDY_003"); // thiếu workspaceId
      expect((await post("/study-sets", outsider!, { title: "x", visibility: "WORKSPACE", workspaceId: ws })).status).toBe(404);
      const { id } = await mkSet(author!, { title: "Bộ nhóm", visibility: "WORKSPACE", workspaceId: ws });

      expect((await get(`/study-sets/${id}`, member!)).body.data.myPermissions).toMatchObject({ duplicate: true, report: true, hide: false, edit: false });
      expect((await get(`/study-sets/${id}`, owner!)).body.data.myPermissions.hide).toBe(true);
      for (const u of [guest!, outsider!]) expect((await get(`/study-sets/${id}`, u)).status).toBe(404);
      expect((await get(`/study-sets?scope=workspace&workspaceId=${ws}`, member!)).body.data).toHaveLength(1);
      expect((await get(`/study-sets?scope=workspace&workspaceId=${ws}`, guest!)).status).toBe(404);
      expect((await post(`/study-sets/${id}/duplicate`, member!, {})).status).toBe(201);
      expect((await post(`/study-sets/${id}/hide`, member!, { reason: "Nội dung không phù hợp" })).status).toBe(403);

      expect((await post(`/study-sets/${id}/hide`, owner!, { reason: "Nội dung không phù hợp với nhóm" })).body.data.status).toBe("HIDDEN");
      expect((await get(`/study-sets/${id}`, member!)).status).toBe(404);
      expect((await get(`/study-sets?scope=workspace&workspaceId=${ws}`, member!)).body.data).toHaveLength(0);
      expect((await get(`/study-sets?scope=workspace&workspaceId=${ws}`, owner!)).body.data).toHaveLength(1);
      expect((await post(`/study-sets/${id}/unhide`, owner!, { reason: "Đã chỉnh sửa lại nội dung" })).body.data.status).toBe("ACTIVE");
      expect((await get(`/study-sets/${id}`, member!)).status).toBe(200);
    });
  });

  describe("báo cáo (p1-08)", () => {
    const runReportEvents = async () => {
      const processor = mockRegistered.find((c) => c[1] === "report.events")?.[2];
      if (!processor) throw new Error("chưa đăng ký processor report.events");
      const rows = await prisma.outboxEvent.findMany({ where: { aggregateType: "Report", jobName: "report.events" }, orderBy: { createdAt: "asc" } });
      for (const row of rows) await processor({ data: row.payload });
    };

    it("báo cáo 2 lần cùng người → 1 Report (lần 2 trả 200 alreadyReported); reportedCount đặt theo số báo cáo mở qua consumer; tác giả không tự báo cáo", async () => {
      const [author, r1, r2] = await users("Tác giả", "Người báo cáo 1", "Người báo cáo 2");
      const { id } = await mkSet(author!, { visibility: "PUBLIC", confirmPublic: true });
      const first = await post(`/study-sets/${id}/report`, r1!, { reason: "COPYRIGHT", description: "Sao chép giáo trình" });
      expect(first.status).toBe(201);
      expect(first.body.data.alreadyReported).toBe(false);
      const again = await post(`/study-sets/${id}/report`, r1!, { reason: "SPAM" });
      expect(again.status).toBe(200);
      expect(again.body.data).toMatchObject({ alreadyReported: true, id: first.body.data.id });
      expect(await prisma.report.count({ where: { targetType: "STUDY_SET", targetId: id } })).toBe(1);
      expect(await prisma.outboxEvent.count({ where: { aggregateType: "Report", type: "report.created" } })).toBe(1);

      expect((await post(`/study-sets/${id}/report`, r2!, { reason: "WRONG_CONTENT" })).status).toBe(201);
      await runReportEvents();
      await runReportEvents(); // consumer chạy lại (retry) — đặt tuyệt đối nên không cộng dồn
      expect((await prisma.studySet.findUniqueOrThrow({ where: { id } })).reportedCount).toBe(2);
      expect((await post(`/study-sets/${id}/report`, author!, { reason: "SPAM" })).status).toBe(403);
      expect((await post(`/study-sets/${id}/report`, r1!, { reason: "OTHER", description: "ngắn" })).status).toBe(400); // OTHER cần mô tả ≥ 10 ký tự
    });

    it("bộ PRIVATE không báo cáo được (404); admin ẩn bộ → ĐÓNG báo cáo mở (RESOLVED/CONTENT_REMOVED)", async () => {
      const [author, reporter, admin] = await users("Tác giả", "Người báo cáo", "Quản trị");
      const priv = await mkSet(author!);
      expect((await post(`/study-sets/${priv.id}/report`, reporter!, { reason: "SPAM" })).status).toBe(404);

      const { id } = await mkSet(author!, { visibility: "PUBLIC", confirmPublic: true });
      await post(`/study-sets/${id}/report`, reporter!, { reason: "INAPPROPRIATE" });
      expect((await post(`/admin/study-sets/${id}/hide`, admin!, { reason: "Nội dung không phù hợp" }, "admin")).status).toBe(200);
      const report = await prisma.report.findFirstOrThrow({ where: { targetId: id } });
      expect(report).toMatchObject({ status: "RESOLVED", resolution: "CONTENT_REMOVED", resolvedBy: admin });
    });
  });

  describe("danh sách, tìm kiếm, thẻ", () => {
    it("tìm không dấu AND từng từ; ký tự regex chỉ khớp LITERAL (a.b ≠ aXb); lọc thẻ; hasQuiz; cursor không trùng/sót", async () => {
      const [author, viewer] = await users("Tác giả", "Người xem");
      const pub = { visibility: "PUBLIC", confirmPublic: true };
      await mkSet(author!, { ...pub, title: "Hà Nội và Thăng Long", tags: ["Lịch sử", "Việt Nam"] });
      await mkSet(author!, { ...pub, title: "a.b" });
      await mkSet(author!, { ...pub, title: "aXb" });
      const quiz = await mkSet(author!, { ...pub, title: "Trắc nghiệm", tags: ["Lịch sử"] });
      await putItems(author!, quiz.id, quiz.version, [mc("q")]);

      const titles = async (qs: string) => (await get(`/study-sets?scope=public&${qs}`, viewer!)).body.data.map((s: { title: string }) => s.title);
      expect(await titles("q=ha%20noi")).toEqual(["Hà Nội và Thăng Long"]);
      expect(await titles("q=thang%20ha")).toEqual(["Hà Nội và Thăng Long"]);
      expect(await titles("q=a.b")).toEqual(["a.b"]);
      expect(await titles("q=.*")).toEqual([]);
      expect((await titles(`tag=${encodeURIComponent("Lịch sử")}`)).sort()).toEqual(["Hà Nội và Thăng Long", "Trắc nghiệm"]);
      expect(await titles("hasQuiz=true")).toEqual(["Trắc nghiệm"]);
      expect((await titles("hasQuiz=false")).length).toBe(4); // false không lọc

      const seen: string[] = [];
      let cursor = "";
      for (let page = 0; page < 4; page += 1) {
        const res = await get(`/study-sets?scope=public&limit=2${cursor ? `&cursor=${cursor}` : ""}`, viewer!);
        seen.push(...res.body.data.map((s: { id: string }) => s.id));
        if (!res.body.meta.hasMore) break;
        cursor = res.body.meta.nextCursor;
      }
      expect(seen).toHaveLength(4);
      expect(new Set(seen).size).toBe(4);
      expect((await get("/study-sets?scope=public&cursor=%23%23%23", viewer!)).status).toBe(400);
    });

    it("thẻ phổ biến (aggregate Mongo thật) đếm bộ PUBLIC ACTIVE, ẩn/riêng tư không tính", async () => {
      const [author, viewer] = await users("Tác giả", "Người xem");
      const pub = { visibility: "PUBLIC", confirmPublic: true };
      await mkSet(author!, { ...pub, tags: ["Toán", "Lý"] });
      await mkSet(author!, { ...pub, tags: ["Toán"] });
      await mkSet(author!, { tags: ["Riêng tư"] });
      const res = await get("/study-tags/popular", viewer!);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([{ tag: "toan", count: 2 }, { tag: "ly", count: 1 }]);
    });
  });

  describe("tạo / sửa / xoá", () => {
    it("Idempotency-Key: gửi lại cùng khoá → cùng bộ, chỉ 1 bản ghi", async () => {
      const [author] = await users("Tác giả");
      const send = () => request(app).post("/api/v1/study-sets").set(as(author!)).set("Idempotency-Key", "khoa-tao-bo-hoc-1").send({ title: "Một lần thôi" });
      const a = await send();
      const b = await send();
      expect([a.status, b.status]).toEqual([201, 201]);
      expect(b.headers["idempotent-replayed"]).toBe("true");
      expect(b.body.data.id).toBe(a.body.data.id);
      expect(await prisma.studySet.count({ where: { ownerId: author } })).toBe(1);
    });

    it("PATCH: lệch phiên bản → 409 RES_003; đổi PUBLIC cần confirmPublic; xoá mềm → 404 và biến mất khỏi danh sách", async () => {
      const [author, stranger] = await users("Tác giả", "Người lạ");
      const { id, version } = await mkSet(author!);
      expect((await patch(`/study-sets/${id}`, author!, { expectedVersion: version, visibility: "PUBLIC" })).body.error.code).toBe("STUDY_008");
      const ok = await patch(`/study-sets/${id}`, author!, { expectedVersion: version, visibility: "PUBLIC", confirmPublic: true, title: "Tên mới" });
      expect(ok.status).toBe(200);
      const stale = await patch(`/study-sets/${id}`, author!, { expectedVersion: version, title: "Cũ" });
      expect(stale.status).toBe(409);
      expect(stale.body.error).toMatchObject({ code: "RES_003", details: { currentVersion: version + 1 } });
      expect((await patch(`/study-sets/${id}`, stranger!, { expectedVersion: version + 1, title: "x" })).status).toBe(403); // PUBLIC: thấy được nhưng không sửa được

      expect((await del(`/study-sets/${id}`, stranger!)).status).toBe(403);
      expect((await del(`/study-sets/${id}`, author!)).status).toBe(204);
      expect((await get(`/study-sets/${id}`, author!)).status).toBe(404);
      expect((await get("/study-sets?scope=mine", author!)).body.data).toHaveLength(0);
      expect((await del(`/study-sets/${id}`, author!)).status).toBe(404);
    });

    it("validate DTO: tiêu đề rỗng, thiếu expectedVersion, id không hợp lệ → 400", async () => {
      const [author] = await users("Tác giả");
      expect((await post("/study-sets", author!, { title: "  " })).status).toBe(400);
      const { id } = await mkSet(author!);
      expect((await put(`/study-sets/${id}/items`, author!, { upsert: [] })).status).toBe(400);
      expect((await get("/study-sets/khong-phai-objectid", author!)).status).toBe(400);
    });
  });
});
