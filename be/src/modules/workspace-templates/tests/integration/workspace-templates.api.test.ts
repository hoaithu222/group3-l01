/**
 * Integration — mẫu workspace p5-04 trên Prisma + Mongo THẬT (memory replset). Phủ TPL-01 (tạo nhóm từ mẫu, một lần dù bấm hai lần),
 * TPL-02 (áp mẫu bỏ qua kênh trùng tên), TPL-03 (MEMBER áp → 403), `Idempotency-Key`, TPL_001/002/003, admin sửa mẫu (CAS + lý do + audit).
 */
process.env.FEATURE_FLAGS = "communication=true";
jest.mock("../../../../core/constants/modules", () => {
  const actual = jest.requireActual("../../../../core/constants/modules");
  return { ...actual, AVAILABLE_MODULES: [...actual.AVAILABLE_MODULES, actual.MODULES.COMMUNICATION] };
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

const mockAuditRecord = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../audit-log/audit-log.service", () => ({
  AuditService: jest.fn().mockImplementation(() => ({ record: mockAuditRecord })),
}));

import { randomUUID } from "crypto";
import request from "supertest";

import { prisma } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import { LIMITS } from "../../../../core/constants/limits";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
import { resetRuntimeConfig } from "../../../../core/config/runtime-config";
import { startHarness, stopHarness, type Harness } from "../../../../infrastructure/socket/tests/integration/test-helpers";
import { registerChannelModule } from "../../../channels";
import { registerConversationModule } from "../../../conversations";
import { PrismaWorkspaceTemplateRepository } from "../../workspace-templates.repo";
import { TEMPLATE_SEEDS } from "../../seed/templates.seed";
import {
  auth,
  buildP504App,
  cleanupP504,
  createFixtures,
  createP504Indexes,
  makeRedisStore,
  tokenFor,
  wireRedisMocks,
} from "../../../workspace-search/tests/integration/search-fixtures";

jest.setTimeout(90_000);

const app = buildP504App();
const store = makeRedisStore();
const fx = createFixtures(app);
const repo = new PrismaWorkspaceTemplateRepository();

const idem = (): string => `idem-${randomUUID()}`;
const names = async (workspaceId: string): Promise<string[]> =>
  (await prisma.channel.findMany({ where: { workspaceId }, select: { name: true } })).map((c) => c.name).sort();

describe("workspace-templates (integration)", () => {
  let harness: Harness;
  const createdWorkspaces: string[] = [];

  beforeAll(async () => {
    harness = await startHarness();
    bindPermissionPorts();
    registerChannelModule();
    registerConversationModule();
    await createP504Indexes();
    await prisma.workspaceTemplate.deleteMany({});
    for (const seed of TEMPLATE_SEEDS) await repo.seed(seed, true);
  });

  afterAll(async () => {
    await prisma.workspaceTemplate.deleteMany({});
    await stopHarness(harness);
    resetPermissionPorts();
  });

  beforeEach(() => {
    wireRedisMocks(redis as unknown as Record<string, jest.Mock>, store);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
  });

  afterEach(async () => {
    resetRuntimeConfig();
    const ids = [...fx.workspaceIds, ...createdWorkspaces];
    await cleanupP504(ids, [...fx.userIds]);
    fx.workspaceIds.push(...createdWorkspaces);
    createdWorkspaces.length = 0;
    await fx.cleanup();
    await prisma.workspaceTemplate.deleteMany({});
    for (const seed of TEMPLATE_SEEDS) await repo.seed(seed, true);
    store.clear();
    mockAuditRecord.mockClear();
  });

  function createFromTemplate(userId: string, body: Record<string, unknown>, key = idem()) {
    return request(app).post("/api/v1/workspaces").set("Authorization", auth(userId)).set("Idempotency-Key", key).send({ name: "Nhóm mẫu", ...body });
  }

  it("GET /workspace-templates: chỉ mẫu đang bật, đủ danh sách kênh và defaultSelected", async () => {
    const user = await fx.newUser("Người dùng");
    const res = await request(app).get("/api/v1/workspace-templates").set("Authorization", auth(user));
    expect(res.status).toBe(200);
    const templates = res.body.data as { code: string; channels: { key: string; defaultSelected: boolean }[] }[];
    expect(templates.map((t) => t.code)).toEqual(["course", "capstone", "self-study"]);
    const capstone = templates.find((t) => t.code === "capstone")!;
    expect(capstone.channels.length).toBeGreaterThanOrEqual(5);
    expect(capstone.channels.some((c) => !c.defaultSelected)).toBe(true);
    expect(capstone.channels.map((c) => c.key)).not.toContain("chung");
  });

  it("TPL-01: tạo nhóm mẫu 'Đồ án' bỏ chọn kênh — chỉ tạo kênh được chọn + kênh Chung; một lần dù bấm hai lần", async () => {
    const user = await fx.newUser("Chủ nhóm");
    const key = idem();
    const body = { templateCode: "capstone", channelKeys: ["tien-do", "thiet-ke", "phat-trien"] };
    const first = await createFromTemplate(user, body, key);
    expect(first.status).toBe(201);
    const workspaceId = first.body.data.workspace.id as string;
    createdWorkspaces.push(workspaceId);
    expect(first.body.data.template.createdChannels.map((c: { key: string }) => c.key)).toEqual(["tien-do", "thiet-ke", "phat-trien"]);
    expect(first.body.data.template.skipped).toEqual([]);
    expect(await names(workspaceId)).toEqual(["Chung", "Phát triển", "Thiết kế", "Tiến độ"].sort());

    const second = await createFromTemplate(user, body, key); // bấm lần 2 cùng Idempotency-Key
    expect(second.headers["idempotent-replayed"]).toBe("true");
    expect(second.body.data.workspace.id).toBe(workspaceId);
    expect(await prisma.workspace.count({ where: { ownerId: user } })).toBe(1);
    expect(await prisma.channel.count({ where: { workspaceId } })).toBe(4);
  });

  it("tạo nhóm không chọn kênh cụ thể → dùng kênh defaultSelected; channelKeys rỗng → không kênh nào ngoài Chung", async () => {
    const user = await fx.newUser("Chủ nhóm");
    const defaults = await createFromTemplate(user, { templateCode: "course" });
    expect(defaults.status).toBe(201);
    createdWorkspaces.push(defaults.body.data.workspace.id);
    const course = TEMPLATE_SEEDS.find((t) => t.code === "course")!;
    expect(defaults.body.data.template.createdChannels).toHaveLength(course.channels.filter((c) => c.defaultSelected).length);

    const none = await createFromTemplate(user, { templateCode: "course", channelKeys: [] });
    expect(none.status).toBe(201);
    createdWorkspaces.push(none.body.data.workspace.id);
    expect(await names(none.body.data.workspace.id)).toEqual(["Chung"]);
  });

  it("kênh VOICE khi phân hệ voice chưa bật bị bỏ qua (TYPE_UNAVAILABLE), không làm hỏng cả lô", async () => {
    const user = await fx.newUser("Chủ nhóm");
    const res = await createFromTemplate(user, { templateCode: "capstone", channelKeys: ["tien-do", "hop-nhom"] });
    expect(res.status).toBe(201);
    createdWorkspaces.push(res.body.data.workspace.id);
    expect(res.body.data.template.createdChannels.map((c: { key: string }) => c.key)).toEqual(["tien-do"]);
    expect(res.body.data.template.skipped).toEqual([{ key: "hop-nhom", reason: "TYPE_UNAVAILABLE" }]);
  });

  it("TPL_001: mẫu không tồn tại hoặc đã tắt → 404 và KHÔNG tạo nhóm; khoá kênh lạ → 400", async () => {
    const user = await fx.newUser("Chủ nhóm");
    const missing = await createFromTemplate(user, { templateCode: "khong-co" });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("TPL_001");
    const unknownKey = await createFromTemplate(user, { templateCode: "course", channelKeys: ["khong-thuoc-mau"] });
    expect(unknownKey.status).toBe(400);
    await prisma.workspaceTemplate.update({ where: { code: "course" }, data: { isActive: false } });
    const off = await createFromTemplate(user, { templateCode: "course" });
    expect(off.status).toBe(404);
    expect(off.body.error.code).toBe("TPL_001");
    expect(await prisma.workspace.count({ where: { ownerId: user } })).toBe(0);
  });

  it("TPL-02: áp mẫu cho nhóm đã có kênh cùng tên → bỏ qua kênh trùng và báo lại danh sách bỏ qua", async () => {
    const owner = await fx.newUser("Chủ nhóm");
    const workspaceId = await fx.newWorkspace(owner);
    await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/channels`)
      .set("Authorization", auth(owner))
      .send({ name: "thông báo", visibility: "PUBLIC" })
      .expect(201);

    const res = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/templates/course/apply`)
      .set("Authorization", auth(owner))
      .set("Idempotency-Key", idem())
      .send({ channelKeys: ["thong-bao", "bai-tap", "tai-lieu"] });
    expect(res.status).toBe(200);
    expect(res.body.data.skipped).toEqual([{ key: "thong-bao", reason: "NAME_EXISTS" }]);
    expect(res.body.data.createdChannels.map((c: { key: string }) => c.key)).toEqual(["bai-tap", "tai-lieu"]);
    expect(await names(workspaceId)).toEqual(["Bài tập", "Chung", "Tài liệu", "thông báo"].sort());
    expect(mockAuditRecord).toHaveBeenCalledWith(expect.objectContaining({ action: "workspace.template-apply", targetId: workspaceId }));
  });

  it("apply idempotent: cùng Idempotency-Key trả kết quả cũ, không tạo thêm; khoá mới → tất cả bị bỏ qua", async () => {
    const owner = await fx.newUser("Chủ nhóm");
    const workspaceId = await fx.newWorkspace(owner);
    const key = idem();
    const call = (k: string) =>
      request(app)
        .post(`/api/v1/workspaces/${workspaceId}/templates/self-study/apply`)
        .set("Authorization", auth(owner))
        .set("Idempotency-Key", k)
        .send({ channelKeys: ["muc-tieu", "hoi-dap"] });

    const first = await call(key);
    expect(first.status).toBe(200);
    expect(first.body.data.createdChannels).toHaveLength(2);
    // Xoá bộ đệm Idempotency (Redis) để chứng minh bản ghi DB `WorkspaceTemplateApplication` cũng giữ tính idempotent.
    store.clear();
    const replay = await call(key);
    expect(replay.status).toBe(200);
    expect(replay.body.data.createdChannels.map((c: { id: string }) => c.id)).toEqual(first.body.data.createdChannels.map((c: { id: string }) => c.id));
    expect(await prisma.channel.count({ where: { workspaceId } })).toBe(3);

    const again = await call(idem());
    expect(again.body.data.createdChannels).toEqual([]);
    expect(again.body.data.skipped).toHaveLength(2);
    // thiếu Idempotency-Key → 400
    const missingKey = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/templates/self-study/apply`)
      .set("Authorization", auth(owner))
      .send({ channelKeys: ["muc-tieu"] });
    expect(missingKey.status).toBe(400);
  });

  it("429 của scopeLimiter KHÔNG bị lưu theo Idempotency-Key: hết chặn thì cùng khoá gửi lại thành công (tạo nhóm và áp mẫu)", async () => {
    const owner = await fx.newUser("Chủ nhóm");
    const workspaceId = await fx.newWorkspace(owner);
    // Đẩy bộ đếm của `scopeLimiter` tới đúng trần (cả cửa sổ hiện tại lẫn cửa sổ kế, phòng test chạy sát mốc giờ) rồi xoá để "hết chặn".
    const bucket = Math.floor(Date.now() / 1000 / 3600);
    const exhaust = (name: string, max: number): void => {
      for (const b of [bucket, bucket + 1]) store.redisStore.set(`rl:${name}:${owner}:3600:${b}`, max);
    };
    const clearLimiter = (): void => {
      for (const key of [...store.redisStore.keys()]) if (key.startsWith("rl:")) store.redisStore.delete(key);
    };
    const apply = (k: string) =>
      request(app)
        .post(`/api/v1/workspaces/${workspaceId}/templates/self-study/apply`)
        .set("Authorization", auth(owner))
        .set("Idempotency-Key", k)
        .send({ channelKeys: ["muc-tieu", "hoi-dap"] });

    // Áp mẫu.
    const applyKey = idem();
    exhaust("tpl-apply", LIMITS.workspaceTemplate.applyRatePerHour);
    const blockedApply = await apply(applyKey);
    expect(blockedApply.status).toBe(429);
    expect(blockedApply.body.error.code).toBe("RATE_002");
    expect(store.redisStore.get(`idem:${owner}:tpl-apply:${applyKey}`)).toBe(""); // khoá đã nhả, không giữ phản hồi 429
    clearLimiter();
    const retriedApply = await apply(applyKey);
    expect(retriedApply.status).toBe(200);
    expect(retriedApply.headers["idempotent-replayed"]).toBeUndefined();
    expect(retriedApply.body.data.createdChannels).toHaveLength(2);

    // Tạo nhóm (`POST /workspaces`, hạn mức 10 lượt/giờ).
    const createKey = idem();
    exhaust("ws-create", 10);
    const blockedCreate = await createFromTemplate(owner, { templateCode: "course" }, createKey);
    expect(blockedCreate.status).toBe(429);
    expect(await prisma.workspace.count({ where: { ownerId: owner } })).toBe(1); // chỉ nhóm của fixture
    clearLimiter();
    const retriedCreate = await createFromTemplate(owner, { templateCode: "course" }, createKey);
    expect(retriedCreate.status).toBe(201);
    expect(retriedCreate.headers["idempotent-replayed"]).toBeUndefined();
    createdWorkspaces.push(retriedCreate.body.data.workspace.id);
  });

  it("TPL-03: MEMBER gọi apply → 403", async () => {
    const owner = await fx.newUser("Chủ nhóm");
    const member = await fx.newUser("Thành viên");
    const workspaceId = await fx.newWorkspace(owner, [member]);
    const res = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/templates/course/apply`)
      .set("Authorization", auth(member))
      .set("Idempotency-Key", idem())
      .send({ channelKeys: ["thong-bao"] });
    expect(res.status).toBe(403);
    expect(await prisma.channel.count({ where: { workspaceId } })).toBe(1);
  });

  it("TPL_002: nhóm đã lưu trữ → 409; TPL_003: vượt số kênh tối đa → 409 và không tạo kênh nào", async () => {
    const owner = await fx.newUser("Chủ nhóm");
    const workspaceId = await fx.newWorkspace(owner);
    const apply = (keys: string[]) =>
      request(app)
        .post(`/api/v1/workspaces/${workspaceId}/templates/course/apply`)
        .set("Authorization", auth(owner))
        .set("Idempotency-Key", idem())
        .send({ channelKeys: keys });

    const limits = LIMITS.channel as { perWorkspaceMax: number };
    const original = limits.perWorkspaceMax;
    limits.perWorkspaceMax = 3; // 1 (Chung) + 4 kênh > 3
    try {
      const tooMany = await apply(["thong-bao", "thao-luan", "bai-tap", "tai-lieu"]);
      expect(tooMany.status).toBe(409);
      expect(tooMany.body.error.code).toBe("TPL_003");
      expect(await prisma.channel.count({ where: { workspaceId } })).toBe(1);
    } finally {
      limits.perWorkspaceMax = original;
    }

    await prisma.workspace.update({ where: { id: workspaceId }, data: { status: "ARCHIVED" } });
    const archived = await apply(["thong-bao"]);
    expect(archived.status).toBe(409);
    expect(archived.body.error.code).toBe("TPL_002");
  });

  it("cờ phụ workspaceTemplates tắt → danh sách 404 CFG_005 và tạo nhóm với templateCode bị chặn, tạo nhóm thường vẫn được", async () => {
    const user = await fx.newUser("Chủ nhóm");
    store.redisStore.set("cfg:features", { value: { workspaceTemplates: false }, version: 1 });
    resetRuntimeConfig();
    const list = await request(app).get("/api/v1/workspace-templates").set("Authorization", auth(user));
    expect(list.status).toBe(404);
    expect(list.body.error.code).toBe("CFG_005");
    const withTemplate = await createFromTemplate(user, { templateCode: "course" });
    expect(withTemplate.status).toBe(404);
    const plain = await createFromTemplate(user, {});
    expect(plain.status).toBe(201);
    createdWorkspaces.push(plain.body.data.workspace.id);
  });

  describe("admin", () => {
    const adminAuth = (userId: string): string => `Bearer ${tokenFor(userId, "admin")}`;

    it("danh sách gồm cả mẫu đã tắt; user thường không truy cập được", async () => {
      const admin = await fx.newUser("Quản trị");
      const user = await fx.newUser("Người dùng");
      await prisma.workspaceTemplate.update({ where: { code: "course" }, data: { isActive: false } });
      const res = await request(app).get("/api/v1/admin/workspace-templates").set("Authorization", adminAuth(admin));
      expect(res.status).toBe(200);
      expect((res.body.data as { code: string; isActive: boolean }[]).find((t) => t.code === "course")?.isActive).toBe(false);
      const denied = await request(app).get("/api/v1/admin/workspace-templates").set("Authorization", auth(user));
      expect(denied.status).toBe(403);
    });

    it("PUT: sửa mẫu tăng version + audit kèm lý do; sai expectedVersion → 409 RES_003; tắt mẫu → biến khỏi danh sách người dùng", async () => {
      const admin = await fx.newUser("Quản trị");
      const user = await fx.newUser("Người dùng");
      const current = (await request(app).get("/api/v1/admin/workspace-templates/course").set("Authorization", adminAuth(admin))).body.data;

      const ok = await request(app)
        .put("/api/v1/admin/workspace-templates/course")
        .set("Authorization", adminAuth(admin))
        .send({ name: "Lớp học phần", isActive: false, expectedVersion: current.version, reason: "Tạm dừng mẫu để rà soát nội dung" });
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({ name: "Lớp học phần", isActive: false, version: current.version + 1 });
      expect(mockAuditRecord).toHaveBeenCalledWith(
        expect.objectContaining({ action: "workspace-template.update", targetType: "WorkspaceTemplate", targetId: "course", reason: "Tạm dừng mẫu để rà soát nội dung" })
      );

      const stale = await request(app)
        .put("/api/v1/admin/workspace-templates/course")
        .set("Authorization", adminAuth(admin))
        .send({ name: "Lại sửa", expectedVersion: current.version, reason: "Sửa với phiên bản cũ của mẫu" });
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe("RES_003");

      const list = await request(app).get("/api/v1/workspace-templates").set("Authorization", auth(user));
      expect((list.body.data as { code: string }[]).map((t) => t.code)).not.toContain("course");
    });

    it("PUT: kiểm dữ liệu kênh — khoá trùng, tên trùng sau chuẩn hoá, tên 'Chung', thiếu lý do đều bị từ chối", async () => {
      const admin = await fx.newUser("Quản trị");
      const current = (await request(app).get("/api/v1/admin/workspace-templates/self-study").set("Authorization", adminAuth(admin))).body.data;
      const put = (body: Record<string, unknown>) =>
        request(app)
          .put("/api/v1/admin/workspace-templates/self-study")
          .set("Authorization", adminAuth(admin))
          .send({ expectedVersion: current.version, reason: "Kiểm tra ràng buộc dữ liệu mẫu", ...body });
      const ch = (key: string, name: string) => ({ key, name, description: "", type: "TEXT", visibility: "PUBLIC", postingPolicy: "MEMBERS", defaultSelected: true });

      expect((await put({ channels: [ch("a", "Frontend"), ch("b", "frontend ")] })).status).toBe(400); // tên trùng sau chuẩn hoá
      expect((await put({ channels: [ch("a", "Một"), ch("a", "Hai")] })).status).toBe(400); // khoá trùng
      expect((await put({ channels: [ch("a", "Chung")] })).status).toBe(400); // kênh mặc định tự tạo
      expect((await put({ channels: [] })).status).toBe(400);
      const noReason = await request(app)
        .put("/api/v1/admin/workspace-templates/self-study")
        .set("Authorization", adminAuth(admin))
        .send({ name: "Không lý do", expectedVersion: current.version });
      expect(noReason.status).toBe(400);

      const fine = await put({ channels: [ch("a", "Frontend"), ch("b", "Backend")], order: 5 });
      expect(fine.status).toBe(200);
      expect(fine.body.data.channels.map((c: { key: string }) => c.key)).toEqual(["a", "b"]);
      expect(fine.body.data.order).toBe(5);
    });
  });
});
