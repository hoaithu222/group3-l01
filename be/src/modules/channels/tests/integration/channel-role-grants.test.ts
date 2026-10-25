/**
 * Integration — cấp quyền kênh riêng tư THEO VAI TRÒ (p3-04 be.md §5.2), Mongo memory replset (`TEST_DB=memory`):
 *   - `POST/DELETE /channels/:id/grants/roles`, `GET /channels/:id/grants` (ROLE + DIRECT), `GET .../members/:userId/access`;
 *   - PR-05: gỡ grant DIRECT khi vẫn được phủ qua vai trò → vẫn đọc được, `effectiveSources: ["ROLE:MEMBER"]`;
 *   - RB-09: hạ ADMIN xuống MEMBER → job `channel.role-access-sync` (outbox của `members.changeRole`) → mất quyền,
 *     `permission:revoked` + `channel:revoked` tới socket THẬT, bị đá khỏi room `ch:`; nâng lên ADMIN → `channel:granted` + vào room;
 *   - thành viên mới vào nhóm (`joinDefault`) nhận `ChannelMembership` kênh riêng tư cấp cho vai trò của họ;
 *   - khoá unique mới `[channelId, subjectKey, source]` (tạo index thật) — 2 role grant khác vai trò trên cùng kênh KHÔNG đụng nhau.
 * Processor job bắt qua `registerJob` (mock) rồi gọi tay — không cần BullMQ/Redis thật.
 */
process.env.FEATURE_FLAGS = "communication=true";
jest.setTimeout(60_000); // mỗi test dựng workspace + nhiều request trên Mongo memory replset
jest.mock("../../../../core/constants/modules", () => {
  const actual = jest.requireActual("../../../../core/constants/modules");
  return { ...actual, AVAILABLE_MODULES: [...actual.AVAILABLE_MODULES, actual.MODULES.COMMUNICATION] };
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

const redisStore = new Map<string, unknown>();
// `resetMocks: true` (jest.config) xoá implementation trước MỖI test → khai báo mock ở đây, gán impl trong beforeEach.
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
  getUserStatusCached: jest.fn().mockResolvedValue({ status: "ACTIVE", sessionVersion: 1, showPresence: true }),
  invalidateUserStatusCache: jest.fn().mockResolvedValue(undefined),
}));

const mockAuditRecord = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../audit-log/audit-log.service", () => ({
  AuditService: jest.fn().mockImplementation(() => ({ record: mockAuditRecord })),
}));

import express from "express";
import request from "supertest";
import type { Socket as ClientSocket } from "socket.io-client";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { JwtUtils } from "../../../../core/utils/jwt";
import { prisma, withTransaction } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { newObjectId } from "../../../../core/utils/object-id";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
import { ROOM } from "../../../../infrastructure/socket";
import {
  startHarness,
  stopHarness,
  connectClient,
  tokenFor as socketTokenFor,
  emitWithAck,
  type Harness,
} from "../../../../infrastructure/socket/tests/integration/test-helpers";
import workspacesRoutes from "../../../workspaces/workspaces.routes";
import membersRoutes from "../../../members/members.routes";
import channelsRoutes from "../../channels.routes";
import channelGrantsRoutes from "../../channel-grants.routes";
import { createChannelBootstrap } from "../../index";
// Side-effect: đăng ký processor vào `mockRegistered`.
import "../../jobs/channel-role-access.consumer";
import "../../jobs/channel-events.consumer";

const app = express();
app.use(express.json());
app.use("/api/v1/workspaces", workspacesRoutes);
app.use("/api/v1/workspaces", membersRoutes);
app.use("/api/v1", channelsRoutes);
app.use("/api/v1/channels", channelGrantsRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

const tokenFor = (userId: string): string =>
  JwtUtils.generateAccessToken({ userId, email: `${userId}@e.com`, name: "T", role: "user", sv: 1 });

function processor(jobName: string): Processor {
  const call = mockRegistered.find((c) => c[1] === jobName);
  if (!call) throw new Error(`Chưa đăng ký processor ${jobName}`);
  return call[2];
}

type WsRole = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";

describe("Role grant kênh riêng tư (p3-04) — integration", () => {
  let harness: Harness;
  const workspaceIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    harness = await startHarness();
    bindPermissionPorts();
    // Index unique thật (memory DB không chạy `db push`): tên kênh + KHOÁ MỚI của p3-04.
    await prisma.$runCommandRaw({
      createIndexes: "ChannelGrant",
      indexes: [
        {
          key: { channelId: 1, subjectKey: 1, source: 1 },
          name: "ChannelGrant_channelId_subjectKey_source_key",
          unique: true,
        },
      ],
    });
  });

  afterAll(async () => {
    await stopHarness(harness);
    resetPermissionPorts();
  });

  beforeEach(() => {
    redisStore.clear();
    (redis.get as jest.Mock).mockImplementation(async (key: string) => (redisStore.has(key) ? redisStore.get(key) : null));
    (redis.set as jest.Mock).mockImplementation(async (key: string, value: unknown) => {
      redisStore.set(key, value);
    });
    (redis.del as jest.Mock).mockImplementation(async (key: string) => {
      redisStore.delete(key);
    });
    (redis.incr as jest.Mock).mockImplementation(async (key: string) => {
      const next = ((redisStore.get(key) as number) ?? 0) + 1;
      redisStore.set(key, next);
      return next;
    });
    (redis.expire as jest.Mock).mockResolvedValue(undefined);
    (redis.exists as jest.Mock).mockImplementation(async (key: string) => redisStore.has(key));
    (redis.getdel as jest.Mock).mockImplementation(async (key: string) => {
      const v = redisStore.has(key) ? redisStore.get(key) : null;
      redisStore.delete(key);
      return v;
    });
    (redis.setNx as jest.Mock).mockImplementation(async (key: string) => {
      if (redisStore.has(key)) return false;
      redisStore.set(key, "1");
      return true;
    });
    (redis.hset as jest.Mock).mockImplementation(async (key: string, field: string, value: string) => {
      const h = (redisStore.get(key) as Record<string, string> | undefined) ?? {};
      h[field] = value;
      redisStore.set(key, h);
    });
    (redis.hgetall as jest.Mock).mockImplementation(async (key: string) => ({ ...((redisStore.get(key) as Record<string, string> | undefined) ?? {}) }));
    (redis.hdel as jest.Mock).mockImplementation(async (key: string, field: string) => {
      const h = redisStore.get(key) as Record<string, string> | undefined;
      if (h) delete h[field];
    });
    (redis.scanKeys as jest.Mock).mockResolvedValue([]);
    (redis.ping as jest.Mock).mockResolvedValue(true);
    (redis.getClient as jest.Mock).mockReturnValue(null);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1, showPresence: true });
  });

  afterEach(async () => {
    if (workspaceIds.length > 0) {
      await prisma.notificationRecipient.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await prisma.notification.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      const channelIds = (await prisma.channel.findMany({ where: { workspaceId: { in: workspaceIds } }, select: { id: true } })).map((c) => c.id);
      await prisma.outboxEvent.deleteMany({
        where: { OR: [{ aggregateType: "Channel", aggregateId: { in: channelIds } }, ...workspaceIds.map((id) => ({ aggregateId: { startsWith: id } }))] },
      });
      await prisma.channelGrant.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await prisma.channelMembership.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await prisma.channel.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
      workspaceIds.length = 0;
    }
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      userIds.length = 0;
    }
  });

  async function seedUser(name = "Nguyễn Văn A"): Promise<string> {
    const id = newObjectId();
    await prisma.user.create({ data: { id, email: `${id}@e.com`, name, normalizedName: name.toLowerCase() } });
    userIds.push(id);
    return id;
  }

  /** Workspace do OWNER tạo qua HTTP + thêm thành viên với vai trò cho trước + 1 kênh riêng tư (OWNER là MANAGER). */
  async function scenario(roles: Partial<Record<"admin" | "member" | "guest", WsRole>> = { admin: "ADMIN", member: "MEMBER" }) {
    const owner = await seedUser("Chủ nhóm");
    const created = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${tokenFor(owner)}`)
      .set("Idempotency-Key", `idem-${newObjectId()}`)
      .send({ name: "Nhóm role grant" });
    expect(created.status).toBe(201);
    const workspaceId = created.body.data.workspace.id as string;
    const defaultChannelId = created.body.data.workspace.defaultChannelId as string;
    workspaceIds.push(workspaceId);

    const people: { owner: string; admin?: string; member?: string; guest?: string } = { owner };
    for (const key of ["admin", "member", "guest"] as const) {
      const role = roles[key];
      if (!role) continue;
      const id = await seedUser(`Thành viên ${key}`);
      await prisma.workspaceMembership.create({ data: { workspaceId, userId: id, role, status: "ACTIVE" } });
      people[key] = id;
    }
    const channelRes = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/channels`)
      .set("Authorization", `Bearer ${tokenFor(owner)}`)
      .send({ name: "Riêng tư role", visibility: "PRIVATE" });
    expect(channelRes.status).toBe(201);
    return { workspaceId, defaultChannelId, channelId: channelRes.body.data.id as string, ...people };
  }

  const auth = (userId: string) => ({ Authorization: `Bearer ${tokenFor(userId)}` });
  const addRole = (userId: string, channelId: string, roleRef: string) =>
    request(app).post(`/api/v1/channels/${channelId}/grants/roles`).set(auth(userId)).send({ roleRef });
  const getChannel = (userId: string, channelId: string) => request(app).get(`/api/v1/channels/${channelId}`).set(auth(userId));

  describe("POST /channels/:id/grants/roles", () => {
    it("ADMIN → OWNER+ADMIN đọc được (membership hiện thực hoá, memberCount cập nhật), MEMBER vẫn 404; myGrant.source=ROLE, không manage", async () => {
      const s = await scenario();
      const res = await addRole(s.owner, s.channelId, "ADMIN");
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        subject: { type: "ROLE", roleRef: "ADMIN", label: "Quản trị viên" },
        level: "MEMBER",
        source: "ROLE",
        userId: null,
      });

      const adminView = await getChannel(s.admin!, s.channelId);
      expect(adminView.status).toBe(200);
      expect(adminView.body.data.myGrant).toEqual({ level: "MEMBER", source: "ROLE" });
      expect(adminView.body.data.myPermissions).toMatchObject({ canWrite: true, canManage: false, canManageGrants: false });
      expect((await getChannel(s.member!, s.channelId)).status).toBe(404); // MEMBER không được phủ bởi ADMIN

      expect(await prisma.channelMembership.count({ where: { channelId: s.channelId } })).toBe(2); // owner + admin
      expect((await prisma.channel.findUniqueOrThrow({ where: { id: s.channelId } })).memberCount).toBe(2);
      const ownerRow = await prisma.channelGrant.findFirst({ where: { channelId: s.channelId, source: "ROLE" } });
      expect(ownerRow).toMatchObject({ userId: null, subjectKey: "role:ADMIN", roleRef: "ADMIN", level: "MEMBER" });
    });

    it("MEMBER → cả OWNER/ADMIN/MEMBER đọc được; GUEST KHÔNG BAO GIỜ nhận qua vai trò (404)", async () => {
      const s = await scenario({ admin: "ADMIN", member: "MEMBER", guest: "GUEST" });
      expect((await addRole(s.owner, s.channelId, "MEMBER")).status).toBe(201);

      expect((await getChannel(s.member!, s.channelId)).status).toBe(200);
      expect((await getChannel(s.admin!, s.channelId)).status).toBe(200);
      expect((await getChannel(s.guest!, s.channelId)).status).toBe(404);
      expect(await prisma.channelMembership.count({ where: { channelId: s.channelId, userId: s.guest } })).toBe(0);
    });

    it("idempotent: gọi lần 2 → cùng dòng, không tạo thêm; ADMIN + MEMBER cùng kênh không đụng khoá unique (subjectKey khác nhau)", async () => {
      const s = await scenario();
      expect((await addRole(s.owner, s.channelId, "MEMBER")).status).toBe(201);
      expect((await addRole(s.owner, s.channelId, "MEMBER")).status).toBe(201);
      expect((await addRole(s.owner, s.channelId, "ADMIN")).status).toBe(201);
      const rows = await prisma.channelGrant.findMany({ where: { channelId: s.channelId, source: "ROLE" } });
      expect(rows.map((r) => r.subjectKey).sort()).toEqual(["role:ADMIN", "role:MEMBER"]);
    });

    it("kênh PUBLIC → 409 CH_008; người không quản lý kênh → 403; roleRef lạ → 400", async () => {
      const s = await scenario();
      const pub = await request(app).post(`/api/v1/channels/${s.defaultChannelId}/grants/roles`).set(auth(s.owner)).send({ roleRef: "ADMIN" });
      expect(pub.status).toBe(409);
      expect(pub.body.error.code).toBe("CH_008");

      await addRole(s.owner, s.channelId, "MEMBER");
      expect((await addRole(s.member!, s.channelId, "ADMIN")).status).toBe(403); // đọc được nhưng không phải MANAGER
      expect((await addRole(s.owner, s.channelId, "OWNER")).status).toBe(400);
    });

    it("GET /channels/:id/grants trả cả ROLE (subject.type=ROLE) lẫn DIRECT (giữ userId/name Phase 1)", async () => {
      const s = await scenario();
      await addRole(s.owner, s.channelId, "MEMBER");
      const res = await request(app).get(`/api/v1/channels/${s.channelId}/grants`).set(auth(s.owner));
      expect(res.status).toBe(200);
      const rows = res.body.data as Array<Record<string, unknown>>;
      expect(rows[0]).toMatchObject({ subject: { type: "ROLE", roleRef: "MEMBER" }, userId: null, source: "ROLE" });
      expect(rows[1]).toMatchObject({ subject: { type: "USER", user: { id: s.owner } }, userId: s.owner, level: "MANAGER" });
    });
  });

  describe("PR-05 — gỡ grant DIRECT khi vẫn được cấp qua vai trò", () => {
    it("vẫn đọc được; access.effectiveSources chỉ còn ROLE:MEMBER; membership giữ nguyên", async () => {
      const s = await scenario();
      await request(app).post(`/api/v1/channels/${s.channelId}/grants`).set(auth(s.owner)).send({ userIds: [s.member], level: "MEMBER" });
      await addRole(s.owner, s.channelId, "MEMBER");

      const before = await request(app).get(`/api/v1/channels/${s.channelId}/members/${s.member}/access`).set(auth(s.owner));
      expect(before.status).toBe(200);
      expect(before.body.data).toEqual({ read: true, write: true, manage: false, effectiveSources: ["DIRECT", "ROLE:MEMBER"] });

      const revoke = await request(app).delete(`/api/v1/channels/${s.channelId}/grants/${s.member}`).set(auth(s.owner));
      expect(revoke.status).toBe(200);

      expect((await getChannel(s.member!, s.channelId)).status).toBe(200);
      const after = await request(app).get(`/api/v1/channels/${s.channelId}/members/${s.member}/access`).set(auth(s.owner));
      expect(after.body.data).toEqual({ read: true, write: true, manage: false, effectiveSources: ["ROLE:MEMBER"] });
      expect(await prisma.channelMembership.count({ where: { channelId: s.channelId, userId: s.member } })).toBe(1);
      expect(await prisma.channelGrant.count({ where: { channelId: s.channelId, userId: s.member } })).toBe(0);
    });

    it("gỡ grant DIRECT khi KHÔNG có vai trò phủ → mất quyền như Phase 1 (effectiveSources rỗng)", async () => {
      const s = await scenario();
      await request(app).post(`/api/v1/channels/${s.channelId}/grants`).set(auth(s.owner)).send({ userIds: [s.member], level: "MEMBER" });
      await request(app).delete(`/api/v1/channels/${s.channelId}/grants/${s.member}`).set(auth(s.owner));

      expect((await getChannel(s.member!, s.channelId)).status).toBe(404);
      const access = await request(app).get(`/api/v1/channels/${s.channelId}/members/${s.member}/access`).set(auth(s.owner));
      expect(access.body.data).toEqual({ read: false, write: false, manage: false, effectiveSources: [] });
    });
  });

  describe("DELETE /channels/:id/grants/roles/:roleRef", () => {
    it("người chỉ đọc nhờ vai trò mất quyền (membership xoá, memberCount đúng); người có DIRECT giữ nguyên; idempotent", async () => {
      const s = await scenario();
      await request(app).post(`/api/v1/channels/${s.channelId}/grants`).set(auth(s.owner)).send({ userIds: [s.admin], level: "MEMBER" });
      await addRole(s.owner, s.channelId, "MEMBER");
      expect((await getChannel(s.member!, s.channelId)).status).toBe(200);

      const del = await request(app).delete(`/api/v1/channels/${s.channelId}/grants/roles/MEMBER`).set(auth(s.owner));
      expect(del.status).toBe(200);
      expect((await getChannel(s.member!, s.channelId)).status).toBe(404); // chỉ đọc qua vai trò
      expect((await getChannel(s.admin!, s.channelId)).status).toBe(200); // còn DIRECT
      expect(await prisma.channelMembership.count({ where: { channelId: s.channelId, userId: s.member } })).toBe(0);
      expect((await prisma.channel.findUniqueOrThrow({ where: { id: s.channelId } })).memberCount).toBe(2); // owner + admin

      expect((await request(app).delete(`/api/v1/channels/${s.channelId}/grants/roles/MEMBER`).set(auth(s.owner))).status).toBe(200);
    });
  });

  describe("RB-09 — đổi vai trò người dùng (socket thật)", () => {
    const patchRole = (ownerId: string, workspaceId: string, userId: string, role: "ADMIN" | "MEMBER") =>
      request(app).patch(`/api/v1/workspaces/${workspaceId}/members/${userId}`).set(auth(ownerId)).send({ role });

    async function runRoleSync(workspaceId: string, userId: string): Promise<void> {
      const rows = await prisma.outboxEvent.findMany({ where: { jobName: "channel.role-access-sync" } });
      const row = rows.find((r) => (r.payload as { workspaceId?: string; userId?: string }).userId === userId);
      expect(row).toBeDefined();
      expect((row!.payload as { workspaceId: string }).workspaceId).toBe(workspaceId);
      await processor("channel.role-access-sync")({ data: row!.payload });
    }

    function once<T>(client: ClientSocket, event: string): Promise<T> {
      return new Promise((resolve) => client.once(event, resolve));
    }

    /** Kết nối socket rồi chờ handler `connection` (presence/registry) gắn xong — emit ngay sau `connect` có thể bị rơi. */
    async function connect(userId: string, deviceId: string): Promise<ClientSocket> {
      const socket = await connectClient(harness.port, { token: socketTokenFor(userId, `${userId}@e.com`), deviceId });
      await new Promise((resolve) => setTimeout(resolve, 300));
      return socket;
    }

    it("hạ ADMIN → MEMBER: mất quyền kênh cấp cho ADMIN, nhận channel:revoked (via ROLE) + permission:revoked, rời room ch:", async () => {
      const s = await scenario();
      await addRole(s.owner, s.channelId, "ADMIN");
      const socket = await connect(s.admin!, "dev-rb09");
      expect(await emitWithAck<{ ok: boolean }>(socket, "room:join", { kind: "ch", id: s.channelId })).toEqual({ ok: true });

      const revoked = once<Record<string, unknown>>(socket, "channel:revoked");
      const permRevoked = once<Record<string, unknown>>(socket, "permission:revoked");
      expect((await patchRole(s.owner, s.workspaceId, s.admin!, "MEMBER")).status).toBe(200);
      await runRoleSync(s.workspaceId, s.admin!);

      expect(await revoked).toMatchObject({ channelId: s.channelId, workspaceId: s.workspaceId, via: "ROLE" });
      expect(await permRevoked).toMatchObject({ scopeType: "CHANNEL", scopeId: s.channelId, reason: "ROLE_CHANGED" });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(await harness.io.in(ROOM.channel(s.channelId)).fetchSockets()).toHaveLength(0);
      expect((await getChannel(s.admin!, s.channelId)).status).toBe(404);
      expect(await prisma.channelMembership.count({ where: { channelId: s.channelId, userId: s.admin } })).toBe(0);

      // Chạy lại job (retry) không đổi gì.
      await runRoleSync(s.workspaceId, s.admin!);
      expect((await prisma.channel.findUniqueOrThrow({ where: { id: s.channelId } })).memberCount).toBe(1);
      socket.disconnect();
    }, 40_000);

    it("hạ ADMIN → MEMBER khi kênh cũng cấp cho MEMBER → vẫn đọc được (không revoke)", async () => {
      const s = await scenario();
      await addRole(s.owner, s.channelId, "ADMIN");
      await addRole(s.owner, s.channelId, "MEMBER");
      await patchRole(s.owner, s.workspaceId, s.admin!, "MEMBER");
      await runRoleSync(s.workspaceId, s.admin!);
      expect((await getChannel(s.admin!, s.channelId)).status).toBe(200);
      expect(await prisma.channelMembership.count({ where: { channelId: s.channelId, userId: s.admin } })).toBe(1);
    });

    it("nâng MEMBER → ADMIN (kênh cấp cho ADMIN): có quyền mới, vào room ch:, nhận channel:granted (via ROLE)", async () => {
      const s = await scenario();
      await addRole(s.owner, s.channelId, "ADMIN");
      const socket = await connect(s.member!, "dev-up");
      const granted = once<Record<string, unknown>>(socket, "channel:granted");

      expect((await patchRole(s.owner, s.workspaceId, s.member!, "ADMIN")).status).toBe(200);
      await runRoleSync(s.workspaceId, s.member!);

      expect(await granted).toMatchObject({ channelId: s.channelId, workspaceId: s.workspaceId, via: "ROLE" });
      expect((await getChannel(s.member!, s.channelId)).status).toBe(200);
      const inRoom = await harness.io.in(ROOM.channel(s.channelId)).fetchSockets();
      expect(inRoom).toHaveLength(1);
      socket.disconnect();
    }, 20_000);
  });

  describe("thành viên mới vào nhóm (ChannelBootstrapPort.joinDefault)", () => {
    it("nhận ChannelMembership của kênh riêng tư đã cấp cho vai trò MEMBER; không nhận kênh chỉ cấp cho ADMIN", async () => {
      const s = await scenario();
      const other = await request(app)
        .post(`/api/v1/workspaces/${s.workspaceId}/channels`)
        .set(auth(s.owner))
        .send({ name: "Chỉ admin", visibility: "PRIVATE" });
      await addRole(s.owner, s.channelId, "MEMBER");
      await addRole(s.owner, other.body.data.id as string, "ADMIN");

      const newcomer = await seedUser("Người mới");
      await withTransaction(async (tx) => {
        await tx.workspaceMembership.create({ data: { workspaceId: s.workspaceId, userId: newcomer, role: "MEMBER", status: "ACTIVE" } });
        await createChannelBootstrap().joinDefault(tx, s.defaultChannelId, newcomer);
      });

      expect(await prisma.channelMembership.count({ where: { channelId: s.channelId, userId: newcomer } })).toBe(1);
      expect(await prisma.channelMembership.count({ where: { channelId: other.body.data.id, userId: newcomer } })).toBe(0);
      expect((await getChannel(newcomer, s.channelId)).status).toBe(200);
      expect((await prisma.channel.findUniqueOrThrow({ where: { id: s.channelId } })).memberCount).toBe(4); // owner + admin + member + người mới
    });
  });
});
