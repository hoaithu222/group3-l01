/**
 * Integration — `/workspaces/:id/members*` + `/admin/workspaces/:id/members*`
 * trên Prisma thật (Mongo memory replset, `TEST_DB=memory`). Redis mock
 * STATEFUL (giống `workspaces.routes.test.ts`/`system-config.routes.test.ts`)
 * + Socket.IO THẬT (`startHarness`, tái dùng của p0-03 — `test-helpers.ts`)
 * vì `remove/ban/unban/platformRevoke` gọi `permissionService.revokeScope()`
 * → `leaveRooms`/`emitToUsers` → `getIO()` (ném lỗi nếu chưa init server).
 *
 * be.md p1-02 §10 — MB-03, MB-05, MB-07; ma trận WS_010…016; PERM_001 khi
 * MEMBER lọc BANNED. MB-04 (đo độ trễ realtime 2 thiết bị) tách riêng ở
 * `members-realtime.test.ts`.
 */
process.env.FEATURE_FLAGS = "communication=true";
jest.mock("../../../../core/constants/modules", () => {
  const actual = jest.requireActual("../../../../core/constants/modules");
  return { ...actual, AVAILABLE_MODULES: [...actual.AVAILABLE_MODULES, actual.MODULES.COMMUNICATION] };
});

const redisStore = new Map<string, unknown>();
// `getStates()` (member-query.service → presence.service, KHÔNG mock riêng —
// dùng thật) gọi `hgetall`/`exists` (be.md p0-03 §4) — thêm hash-store để
// `computeState()` không văng lỗi "not a function" (500) khi list/getCard.
const redisHashStore = new Map<string, Record<string, string>>();
function redisGetImpl(key: string): Promise<unknown> {
  return Promise.resolve(redisStore.has(key) ? redisStore.get(key) : null);
}
function redisSetImpl(key: string, value: unknown): Promise<void> {
  redisStore.set(key, value);
  return Promise.resolve();
}
function redisDelImpl(key: string): Promise<void> {
  redisStore.delete(key);
  return Promise.resolve();
}
function redisGetdelImpl(key: string): Promise<unknown> {
  const v = redisStore.has(key) ? redisStore.get(key) : null;
  redisStore.delete(key);
  return Promise.resolve(v);
}
function redisIncrImpl(key: string): Promise<number> {
  const next = ((redisStore.get(key) as number) ?? 0) + 1;
  redisStore.set(key, next);
  return Promise.resolve(next);
}
function redisExistsImpl(key: string): Promise<boolean> {
  return Promise.resolve(redisStore.has(key));
}
function redisSetNxImpl(key: string): Promise<boolean> {
  if (redisStore.has(key)) return Promise.resolve(false);
  redisStore.set(key, "1");
  return Promise.resolve(true);
}
function redisHsetImpl(key: string, field: string, value: string): Promise<void> {
  const h = redisHashStore.get(key) ?? {};
  h[field] = value;
  redisHashStore.set(key, h);
  return Promise.resolve();
}
function redisHgetallImpl(key: string): Promise<Record<string, string>> {
  return Promise.resolve({ ...(redisHashStore.get(key) ?? {}) });
}
function redisHdelImpl(key: string, field: string): Promise<void> {
  const h = redisHashStore.get(key);
  if (h) delete h[field];
  return Promise.resolve();
}

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

import express from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { JwtUtils } from "../../../../core/utils/jwt";
import { prisma } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { newObjectId } from "../../../../core/utils/object-id";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
import { startHarness, stopHarness, type Harness } from "../../../../infrastructure/socket/tests/integration/test-helpers";
import workspacesRoutes from "../../../workspaces/workspaces.routes";
import membersRoutes from "../../members.routes";
import adminMembersRoutes from "../../admin-members.routes";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/workspaces", workspacesRoutes);
  app.use("/api/v1/workspaces", membersRoutes);
  app.use("/api/v1/admin/workspaces", adminMembersRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = buildApp();

function tokenFor(userId: string, role = "user"): string {
  return JwtUtils.generateAccessToken({ userId, email: `${userId}@e.com`, name: "T", role, sv: 1 });
}

async function seedUser(overrides: { id?: string; name?: string } = {}): Promise<{ id: string; name: string }> {
  const id = overrides.id ?? newObjectId();
  const name = overrides.name ?? "Nguyễn Văn A";
  await prisma.user.create({ data: { id, email: `${id}@e.com`, name } });
  return { id, name };
}

async function addMembership(
  workspaceId: string,
  userId: string,
  role: "OWNER" | "ADMIN" | "MEMBER",
  status: "ACTIVE" | "BANNED" | "LEFT" | "REMOVED" = "ACTIVE"
): Promise<void> {
  await prisma.workspaceMembership.create({ data: { workspaceId, userId, role, status } });
}

describe("/workspaces/:id/members, /admin/workspaces/:id/members (integration — Mongo memory replset)", () => {
  let harness: Harness;
  const createdWorkspaceIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    harness = await startHarness();
    bindPermissionPorts();
  });

  afterAll(async () => {
    await stopHarness(harness);
    resetPermissionPorts();
  });

  beforeEach(() => {
    (redis.get as jest.Mock).mockImplementation(redisGetImpl);
    (redis.set as jest.Mock).mockImplementation(redisSetImpl);
    (redis.del as jest.Mock).mockImplementation(redisDelImpl);
    (redis.getdel as jest.Mock).mockImplementation(redisGetdelImpl);
    (redis.incr as jest.Mock).mockImplementation(redisIncrImpl);
    (redis.expire as jest.Mock).mockResolvedValue(undefined);
    (redis.exists as jest.Mock).mockImplementation(redisExistsImpl);
    (redis.setNx as jest.Mock).mockImplementation(redisSetNxImpl);
    (redis.hset as jest.Mock).mockImplementation(redisHsetImpl);
    (redis.hgetall as jest.Mock).mockImplementation(redisHgetallImpl);
    (redis.hdel as jest.Mock).mockImplementation(redisHdelImpl);
    (redis.scanKeys as jest.Mock).mockResolvedValue([]);
    (redis.ping as jest.Mock).mockResolvedValue(true);
    (redis.getClient as jest.Mock).mockReturnValue(null);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
  });

  afterEach(async () => {
    if (createdWorkspaceIds.length > 0) {
      await prisma.notificationRecipient.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.notification.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.outboxEvent.deleteMany({
        where: { OR: createdWorkspaceIds.map((id) => ({ aggregateId: { startsWith: id } })) },
      });
      await prisma.channelMembership.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.channel.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.workspace.deleteMany({ where: { id: { in: createdWorkspaceIds } } });
      createdWorkspaceIds.length = 0;
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      createdUserIds.length = 0;
    }
    redisStore.clear();
    redisHashStore.clear();
    mockAuditRecord.mockClear();
  });

  async function createWorkspace(ownerId: string, name: string): Promise<string> {
    const res = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
      .set("Idempotency-Key", `idem-${newObjectId()}`)
      .send({ name });
    expect(res.status).toBe(201);
    const workspaceId = res.body.data.workspace.id as string;
    createdWorkspaceIds.push(workspaceId);
    return workspaceId;
  }

  describe("GET /workspaces/:id/members", () => {
    it("MB-07: MEMBER xem danh sách → không có field email trong MemberRow", async () => {
      const owner = await seedUser();
      const member = await seedUser({ name: "Trần B" });
      createdUserIds.push(owner.id, member.id);
      const workspaceId = await createWorkspace(owner.id, "Nhóm MB-07");
      await addMembership(workspaceId, member.id, "MEMBER");

      const res = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/members`)
        .set("Authorization", `Bearer ${tokenFor(member.id)}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      for (const row of res.body.data) {
        expect(row).not.toHaveProperty("email");
      }
    });

    it("PERM_001 khi MEMBER lọc status=BANNED", async () => {
      const owner = await seedUser();
      const member = await seedUser();
      createdUserIds.push(owner.id, member.id);
      const workspaceId = await createWorkspace(owner.id, "Nhóm PERM_001");
      await addMembership(workspaceId, member.id, "MEMBER");

      const res = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/members?status=BANNED`)
        .set("Authorization", `Bearer ${tokenFor(member.id)}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("PERM_001");
    });

    it("OWNER lọc status=BANNED → 200, thấy người bị chặn", async () => {
      const owner = await seedUser();
      const banned = await seedUser();
      createdUserIds.push(owner.id, banned.id);
      const workspaceId = await createWorkspace(owner.id, "Nhóm xem banned");
      await addMembership(workspaceId, banned.id, "MEMBER", "BANNED");

      const res = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/members?status=BANNED`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].userId).toBe(banned.id);
      expect(res.body.data[0].status).toBe("BANNED");
    });
  });

  describe("GET /workspaces/:id/members/:userId", () => {
    it("OWNER xem thẻ ADMIN → actions.canChangeRole/canRemove/canBan = true", async () => {
      const owner = await seedUser();
      const admin = await seedUser();
      createdUserIds.push(owner.id, admin.id);
      const workspaceId = await createWorkspace(owner.id, "Nhóm card");
      await addMembership(workspaceId, admin.id, "ADMIN");

      const res = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/members/${admin.id}`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`);
      expect(res.status).toBe(200);
      expect(res.body.data.actions).toMatchObject({ canChangeRole: true, canRemove: true, canBan: true });
    });

    it("canMessage do SERVER tính (D-16): thành viên ACTIVE khác → true; chính mình → false; bị chặn (một trong hai chiều) → false, cả hai chiều xem thẻ", async () => {
      const owner = await seedUser();
      const member = await seedUser();
      createdUserIds.push(owner.id, member.id);
      const workspaceId = await createWorkspace(owner.id, "Nhóm card liên hệ");
      await addMembership(workspaceId, member.id, "MEMBER");
      const card = async (viewer: string, target: string) =>
        (await request(app).get(`/api/v1/workspaces/${workspaceId}/members/${target}`).set("Authorization", `Bearer ${tokenFor(viewer)}`)).body.data.actions;

      // Môi trường test: phân hệ `voice` chưa bật/LiveKit chưa cấu hình ⇒ canCall luôn false dù nhắn được.
      expect(await card(owner.id, member.id)).toMatchObject({ canMessage: true, canCall: false });
      expect(await card(member.id, owner.id)).toMatchObject({ canMessage: true, canCall: false });
      expect(await card(owner.id, owner.id)).toMatchObject({ canMessage: false, canCall: false });

      await prisma.userBlock.create({ data: { blockerId: member.id, blockedId: owner.id } });
      try {
        expect(await card(owner.id, member.id)).toMatchObject({ canMessage: false, canCall: false });
        expect(await card(member.id, owner.id)).toMatchObject({ canMessage: false, canCall: false });
      } finally {
        await prisma.userBlock.deleteMany({ where: { blockerId: member.id } });
      }
    });

    it("404 khi userId không phải thành viên", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const workspaceId = await createWorkspace(owner.id, "Nhóm 404 card");

      const res = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/members/${newObjectId()}`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`);
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /workspaces/:id/members/:userId — đổi vai trò", () => {
    it("OWNER nâng MEMBER lên ADMIN → 200, audit member.role-change", async () => {
      const owner = await seedUser();
      const member = await seedUser();
      createdUserIds.push(owner.id, member.id);
      const workspaceId = await createWorkspace(owner.id, "Nhóm nâng role");
      await addMembership(workspaceId, member.id, "MEMBER");

      const res = await request(app)
        .patch(`/api/v1/workspaces/${workspaceId}/members/${member.id}`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ role: "ADMIN" });
      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe("ADMIN");

      const membership = await prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: member.id } },
      });
      expect(membership?.role).toBe("ADMIN");
      expect(mockAuditRecord).toHaveBeenCalledWith(expect.objectContaining({ action: "member.role-change" }));
    });

    it("ADMIN (không phải OWNER) đổi role → 403 WS_011", async () => {
      const owner = await seedUser();
      const admin = await seedUser();
      const member = await seedUser();
      createdUserIds.push(owner.id, admin.id, member.id);
      const workspaceId = await createWorkspace(owner.id, "Nhóm ADMIN không đổi role");
      await addMembership(workspaceId, admin.id, "ADMIN");
      await addMembership(workspaceId, member.id, "MEMBER");

      const res = await request(app)
        .patch(`/api/v1/workspaces/${workspaceId}/members/${member.id}`)
        .set("Authorization", `Bearer ${tokenFor(admin.id)}`)
        .send({ role: "ADMIN" });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("WS_011");
    });

    it("OWNER tự đổi role chính mình (target là OWNER) → 403 WS_010", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const workspaceId = await createWorkspace(owner.id, "Nhóm WS_010");

      const res = await request(app)
        .patch(`/api/v1/workspaces/${workspaceId}/members/${owner.id}`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ role: "ADMIN" });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("WS_010");
    });

    it("đổi role trên workspace đã ARCHIVED → 409 WS_002", async () => {
      const owner = await seedUser();
      const member = await seedUser();
      createdUserIds.push(owner.id, member.id);
      const workspaceId = await createWorkspace(owner.id, "Nhóm archived role");
      await addMembership(workspaceId, member.id, "MEMBER");

      const archived = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/archive`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ expectedVersion: 1 });
      expect(archived.status).toBe(200);

      const res = await request(app)
        .patch(`/api/v1/workspaces/${workspaceId}/members/${member.id}`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ role: "ADMIN" });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("WS_002");
    });
  });

  describe("PATCH /workspaces/:id/members/:userId — đổi displayName", () => {
    it("chính mình đổi displayName → 200", async () => {
      const owner = await seedUser();
      const member = await seedUser();
      createdUserIds.push(owner.id, member.id);
      const workspaceId = await createWorkspace(owner.id, "Nhóm tự đổi tên");
      await addMembership(workspaceId, member.id, "MEMBER");

      const res = await request(app)
        .patch(`/api/v1/workspaces/${workspaceId}/members/${member.id}`)
        .set("Authorization", `Bearer ${tokenFor(member.id)}`)
        .send({ displayName: "Biệt danh" });
      expect(res.status).toBe(200);
      expect(res.body.data.displayName).toBe("Biệt danh");
    });

    it("MEMBER đổi displayName của MEMBER khác (không outrank) → 403 WS_011", async () => {
      const owner = await seedUser();
      const memberA = await seedUser();
      const memberB = await seedUser();
      createdUserIds.push(owner.id, memberA.id, memberB.id);
      const workspaceId = await createWorkspace(owner.id, "Nhóm đổi tên người khác");
      await addMembership(workspaceId, memberA.id, "MEMBER");
      await addMembership(workspaceId, memberB.id, "MEMBER");

      const res = await request(app)
        .patch(`/api/v1/workspaces/${workspaceId}/members/${memberB.id}`)
        .set("Authorization", `Bearer ${tokenFor(memberA.id)}`)
        .send({ displayName: "Tên áp đặt" });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("WS_011");
    });

    it("ADMIN đổi displayName của MEMBER (outrank) → 200", async () => {
      const owner = await seedUser();
      const admin = await seedUser();
      const member = await seedUser();
      createdUserIds.push(owner.id, admin.id, member.id);
      const workspaceId = await createWorkspace(owner.id, "Nhóm admin đổi tên member");
      await addMembership(workspaceId, admin.id, "ADMIN");
      await addMembership(workspaceId, member.id, "MEMBER");

      const res = await request(app)
        .patch(`/api/v1/workspaces/${workspaceId}/members/${member.id}`)
        .set("Authorization", `Bearer ${tokenFor(admin.id)}`)
        .send({ displayName: "Đặt bởi admin" });
      expect(res.status).toBe(200);
      expect(res.body.data.displayName).toBe("Đặt bởi admin");
    });
  });

  describe("POST /workspaces/:id/members/:userId/remove", () => {
    it("MB-05: ADMIN loại ADMIN khác → 403 WS_011", async () => {
      const owner = await seedUser();
      const admin1 = await seedUser();
      const admin2 = await seedUser();
      createdUserIds.push(owner.id, admin1.id, admin2.id);
      const workspaceId = await createWorkspace(owner.id, "Nhóm MB-05");
      await addMembership(workspaceId, admin1.id, "ADMIN");
      await addMembership(workspaceId, admin2.id, "ADMIN");

      const res = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/members/${admin2.id}/remove`)
        .set("Authorization", `Bearer ${tokenFor(admin1.id)}`)
        .send({ reason: "Lý do đủ dài mười ký tự" });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("WS_011");
    });

    it("tự loại chính mình → 400 WS_012", async () => {
      const owner = await seedUser();
      const admin = await seedUser();
      createdUserIds.push(owner.id, admin.id);
      const workspaceId = await createWorkspace(owner.id, "Nhóm tự loại");
      await addMembership(workspaceId, admin.id, "ADMIN");

      const res = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/members/${admin.id}/remove`)
        .set("Authorization", `Bearer ${tokenFor(admin.id)}`)
        .send({ reason: "Lý do đủ dài mười ký tự" });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("WS_012");
    });

    it("ADMIN loại MEMBER hợp lệ → 200, status REMOVED, memberCount -1, audit member.remove", async () => {
      const owner = await seedUser();
      const admin = await seedUser();
      const member = await seedUser();
      createdUserIds.push(owner.id, admin.id, member.id);
      const workspaceId = await createWorkspace(owner.id, "Nhóm loại hợp lệ");
      await addMembership(workspaceId, admin.id, "ADMIN");
      await addMembership(workspaceId, member.id, "MEMBER");
      const before = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });

      const res = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/members/${member.id}/remove`)
        .set("Authorization", `Bearer ${tokenFor(admin.id)}`)
        .send({ reason: "Lý do đủ dài mười ký tự" });
      expect(res.status).toBe(200);

      const membership = await prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: member.id } },
      });
      expect(membership?.status).toBe("REMOVED");
      expect(membership?.removedBy).toBe(admin.id);
      const after = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
      expect(after.memberCount).toBe(before.memberCount - 1);
      expect(mockAuditRecord).toHaveBeenCalledWith(expect.objectContaining({ action: "member.remove" }));
    });

    it("loại người không ACTIVE (đã LEFT) → 409 WS_013", async () => {
      const owner = await seedUser();
      const left = await seedUser();
      createdUserIds.push(owner.id, left.id);
      const workspaceId = await createWorkspace(owner.id, "Nhóm WS_013");
      await addMembership(workspaceId, left.id, "MEMBER", "LEFT");

      const res = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/members/${left.id}/remove`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ reason: "Lý do đủ dài mười ký tự" });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("WS_013");
    });

    it("lý do quá ngắn → 400 VAL_001", async () => {
      const owner = await seedUser();
      const member = await seedUser();
      createdUserIds.push(owner.id, member.id);
      const workspaceId = await createWorkspace(owner.id, "Nhóm lý do ngắn");
      await addMembership(workspaceId, member.id, "MEMBER");

      const res = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/members/${member.id}/remove`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ reason: "ngắn" });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VAL_001");
    });

    it("MEMBER gọi remove → 403 PERM_001 (chặn ở requireWorkspaceRole ADMIN, không tới service)", async () => {
      const owner = await seedUser();
      const memberA = await seedUser();
      const memberB = await seedUser();
      createdUserIds.push(owner.id, memberA.id, memberB.id);
      const workspaceId = await createWorkspace(owner.id, "Nhóm member remove");
      await addMembership(workspaceId, memberA.id, "MEMBER");
      await addMembership(workspaceId, memberB.id, "MEMBER");

      const res = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/members/${memberB.id}/remove`)
        .set("Authorization", `Bearer ${tokenFor(memberA.id)}`)
        .send({ reason: "Lý do đủ dài mười ký tự" });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("PERM_001");
    });

    it("MB-03: ADMIN ở nhóm A chỉ là MEMBER ở nhóm B → không quản trị được B", async () => {
      const ownerA = await seedUser();
      const ownerB = await seedUser();
      const actor = await seedUser();
      const targetInB = await seedUser();
      createdUserIds.push(ownerA.id, ownerB.id, actor.id, targetInB.id);
      const workspaceA = await createWorkspace(ownerA.id, "Nhóm A (actor là ADMIN)");
      const workspaceB = await createWorkspace(ownerB.id, "Nhóm B (actor chỉ là MEMBER)");
      await addMembership(workspaceA, actor.id, "ADMIN");
      await addMembership(workspaceB, actor.id, "MEMBER");
      await addMembership(workspaceB, targetInB.id, "MEMBER");

      const res = await request(app)
        .post(`/api/v1/workspaces/${workspaceB}/members/${targetInB.id}/remove`)
        .set("Authorization", `Bearer ${tokenFor(actor.id)}`)
        .send({ reason: "Lý do đủ dài mười ký tự" });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("PERM_001");
    });
  });

  describe("POST .../ban, POST .../unban", () => {
    it("ADMIN chặn MEMBER hợp lệ → 200, status BANNED, banReason lưu lại", async () => {
      const owner = await seedUser();
      const admin = await seedUser();
      const member = await seedUser();
      createdUserIds.push(owner.id, admin.id, member.id);
      const workspaceId = await createWorkspace(owner.id, "Nhóm ban hợp lệ");
      await addMembership(workspaceId, admin.id, "ADMIN");
      await addMembership(workspaceId, member.id, "MEMBER");

      const res = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/members/${member.id}/ban`)
        .set("Authorization", `Bearer ${tokenFor(admin.id)}`)
        .send({ reason: "Vi phạm nội quy nhóm" });
      expect(res.status).toBe(200);

      const membership = await prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: member.id } },
      });
      expect(membership?.status).toBe("BANNED");
      expect(membership?.banReason).toBe("Vi phạm nội quy nhóm");
    });

    it("gỡ chặn người đang BANNED → 200, status REMOVED, banReason=null", async () => {
      const owner = await seedUser();
      const banned = await seedUser();
      createdUserIds.push(owner.id, banned.id);
      const workspaceId = await createWorkspace(owner.id, "Nhóm unban");
      await addMembership(workspaceId, banned.id, "MEMBER", "BANNED");

      const res = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/members/${banned.id}/unban`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ reason: "Xem xét lại, gỡ chặn" });
      expect(res.status).toBe(200);

      const membership = await prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: banned.id } },
      });
      expect(membership?.status).toBe("REMOVED");
      expect(membership?.banReason).toBeNull();
    });

    it("gỡ chặn người KHÔNG bị chặn → 409 WS_014", async () => {
      const owner = await seedUser();
      const member = await seedUser();
      createdUserIds.push(owner.id, member.id);
      const workspaceId = await createWorkspace(owner.id, "Nhóm WS_014");
      await addMembership(workspaceId, member.id, "MEMBER");

      const res = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/members/${member.id}/unban`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ reason: "Không có lý do hợp lệ" });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("WS_014");
    });
  });

  describe("Admin — /admin/workspaces/:id/members*", () => {
    it("role 'user' (không có workspace:view) → 403", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const workspaceId = await createWorkspace(owner.id, "Nhóm admin 403");

      const res = await request(app)
        .get(`/api/v1/admin/workspaces/${workspaceId}/members`)
        .set("Authorization", `Bearer ${tokenFor(newObjectId(), "user")}`);
      expect(res.status).toBe(403);
    });

    it("role 'manager' → 200, AdminMemberRow có email (manager có user:view)", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const workspaceId = await createWorkspace(owner.id, "Nhóm admin 200");

      const res = await request(app)
        .get(`/api/v1/admin/workspaces/${workspaceId}/members`)
        .set("Authorization", `Bearer ${tokenFor(newObjectId(), "manager")}`);
      expect(res.status).toBe(200);
      expect(res.body.data[0].user).toHaveProperty("email");
    });

    it("POST revoke (ban=false) → 200, status REMOVED, audit member.platform-revoke", async () => {
      const owner = await seedUser();
      const member = await seedUser();
      createdUserIds.push(owner.id, member.id);
      const workspaceId = await createWorkspace(owner.id, "Nhóm platform revoke");
      await addMembership(workspaceId, member.id, "MEMBER");

      const res = await request(app)
        .post(`/api/v1/admin/workspaces/${workspaceId}/members/${member.id}/revoke`)
        .set("Authorization", `Bearer ${tokenFor(newObjectId(), "admin")}`)
        .send({ reason: "Vi phạm điều khoản nền tảng", ban: false });
      expect(res.status).toBe(200);

      const membership = await prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: member.id } },
      });
      expect(membership?.status).toBe("REMOVED");
      expect(mockAuditRecord).toHaveBeenCalledWith(expect.objectContaining({ action: "member.platform-revoke" }));
    });

    it("POST revoke (ban=true) → 200, status BANNED", async () => {
      const owner = await seedUser();
      const member = await seedUser();
      createdUserIds.push(owner.id, member.id);
      const workspaceId = await createWorkspace(owner.id, "Nhóm platform ban");
      await addMembership(workspaceId, member.id, "MEMBER");

      const res = await request(app)
        .post(`/api/v1/admin/workspaces/${workspaceId}/members/${member.id}/revoke`)
        .set("Authorization", `Bearer ${tokenFor(newObjectId(), "admin")}`)
        .send({ reason: "Vi phạm điều khoản nền tảng", ban: true });
      expect(res.status).toBe(200);

      const membership = await prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: member.id } },
      });
      expect(membership?.status).toBe("BANNED");
    });

    it("thu hồi OWNER → 409 WS_015", async () => {
      const owner = await seedUser();
      createdUserIds.push(owner.id);
      const workspaceId = await createWorkspace(owner.id, "Nhóm WS_015");

      const res = await request(app)
        .post(`/api/v1/admin/workspaces/${workspaceId}/members/${owner.id}/revoke`)
        .set("Authorization", `Bearer ${tokenFor(newObjectId(), "admin")}`)
        .send({ reason: "Vi phạm điều khoản nền tảng", ban: false });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("WS_015");
    });

    it("thu hồi người không ACTIVE → 409 WS_013", async () => {
      const owner = await seedUser();
      const left = await seedUser();
      createdUserIds.push(owner.id, left.id);
      const workspaceId = await createWorkspace(owner.id, "Nhóm WS_013 admin");
      await addMembership(workspaceId, left.id, "MEMBER", "LEFT");

      const res = await request(app)
        .post(`/api/v1/admin/workspaces/${workspaceId}/members/${left.id}/revoke`)
        .set("Authorization", `Bearer ${tokenFor(newObjectId(), "admin")}`)
        .send({ reason: "Vi phạm điều khoản nền tảng", ban: false });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("WS_013");
    });
  });
});
