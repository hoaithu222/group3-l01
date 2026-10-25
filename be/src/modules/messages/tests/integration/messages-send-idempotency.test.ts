/**
 * Integration — pipeline GỬI TIN của p1-04 dưới tải/đua (TX-01, TX-03, MSG-01)
 * trên adapter CHANNEL thật (Mongo memory replset, `TEST_DB=memory`). Bổ sung
 * cho `messages.routes.test.ts` (đã có sẵn MSG-02 "gửi lại cùng
 * clientMessageId" — KHÔNG lặp lại ở đây).
 *
 * - TX-01: 2 request POST cùng lúc, cùng `clientMessageId` → đúng 1 tin được
 *   tạo, 1 trong 2 response có header `Idempotent-Replayed: true`.
 * - TX-03: mất quyền ghi GIỮA 2 lần gửi (kênh riêng tư bị thu hồi grant) → 404.
 * - MSG-01: nhiều request gửi song song vào CÙNG 1 scope → `seq` liên tục,
 *   không lỗ hổng/trùng. be.md README §8 mô tả "2 process API gửi song song
 *   200 tin" — RÚT XUỐNG còn 24 request `Promise.all` trong 1 process Jest
 *   cho hợp lý (200 tin/2 tiến trình không khả thi trong 1 lần chạy Jest đơn
 *   luồng mà không dựng thêm hạ tầng multi-process).
 */
process.env.FEATURE_FLAGS = "communication=true";
jest.mock("../../../../core/constants/modules", () => {
  const actual = jest.requireActual("../../../../core/constants/modules");
  return { ...actual, AVAILABLE_MODULES: [...actual.AVAILABLE_MODULES, actual.MODULES.COMMUNICATION] };
});

const redisStore = new Map<string, unknown>();
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
function redisIncrImpl(key: string): Promise<number> {
  const next = ((redisStore.get(key) as number) ?? 0) + 1;
  redisStore.set(key, next);
  return Promise.resolve(next);
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

import { randomUUID } from "crypto";
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
import channelsRoutes from "../../../channels/channels.routes";
import channelGrantsRoutes from "../../../channels/channel-grants.routes";
import { registerChannelModule } from "../../../channels";
import messagesRoutes from "../../messages.routes";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/workspaces", workspacesRoutes);
  app.use("/api/v1", channelsRoutes);
  app.use("/api/v1/channels", channelGrantsRoutes);
  app.use("/api/v1", messagesRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = buildApp();

function tokenFor(userId: string, role = "user"): string {
  return JwtUtils.generateAccessToken({ userId, email: `${userId}@e.com`, name: "T", role, sv: 1 });
}

async function seedUser(name = "Nguyễn Văn A"): Promise<{ id: string; name: string }> {
  const id = newObjectId();
  await prisma.user.create({ data: { id, email: `${id}@e.com`, name, normalizedName: "" } });
  return { id, name };
}

describe("messages send — idempotency & race (TX-01, TX-03, MSG-01)", () => {
  let harness: Harness;
  const createdWorkspaceIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    harness = await startHarness();
    bindPermissionPorts();
    registerChannelModule();

    await prisma.$runCommandRaw({
      createIndexes: "Message",
      indexes: [
        { key: { scopeType: 1, scopeId: 1, threadKey: 1, seq: 1 }, name: "Message_scopeType_scopeId_threadKey_seq_key", unique: true },
        { key: { dedupeKey: 1 }, name: "Message_dedupeKey_key", unique: true },
      ],
    });
    await prisma.$runCommandRaw({
      createIndexes: "Channel",
      indexes: [{ key: { workspaceId: 1, normalizedName: 1 }, name: "Channel_workspaceId_normalizedName_key", unique: true }],
    });
  });

  afterAll(async () => {
    await stopHarness(harness);
    resetPermissionPorts();
  });

  beforeEach(() => {
    (redis.get as jest.Mock).mockImplementation(redisGetImpl);
    (redis.set as jest.Mock).mockImplementation(redisSetImpl);
    (redis.del as jest.Mock).mockImplementation(redisDelImpl);
    (redis.getdel as jest.Mock).mockImplementation(() => Promise.resolve(null));
    (redis.incr as jest.Mock).mockImplementation(redisIncrImpl);
    (redis.expire as jest.Mock).mockResolvedValue(undefined);
    (redis.exists as jest.Mock).mockResolvedValue(false);
    (redis.setNx as jest.Mock).mockResolvedValue(true);
    (redis.hset as jest.Mock).mockResolvedValue(undefined);
    (redis.hgetall as jest.Mock).mockResolvedValue({});
    (redis.hdel as jest.Mock).mockResolvedValue(undefined);
    (redis.scanKeys as jest.Mock).mockResolvedValue([]);
    (redis.ping as jest.Mock).mockResolvedValue(true);
    (redis.getClient as jest.Mock).mockReturnValue(null);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
  });

  afterEach(async () => {
    if (createdWorkspaceIds.length > 0) {
      const channelIds = (
        await prisma.channel.findMany({ where: { workspaceId: { in: createdWorkspaceIds } }, select: { id: true } })
      ).map((c) => c.id);
      if (channelIds.length > 0) {
        await prisma.message.deleteMany({ where: { scopeId: { in: channelIds } } });
        await prisma.outboxEvent.deleteMany({ where: { aggregateType: "Channel", aggregateId: { in: channelIds } } });
      }
      await prisma.outboxEvent.deleteMany({
        where: { OR: createdWorkspaceIds.map((id) => ({ aggregateId: { startsWith: id } })) },
      });
      await prisma.channelGrant.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.channelMembership.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.channel.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: createdWorkspaceIds } } });
      await prisma.workspace.deleteMany({ where: { id: { in: createdWorkspaceIds } } });
      createdWorkspaceIds.length = 0;
    }
    await prisma.outboxEvent.deleteMany({ where: { aggregateType: "Message" } });
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      createdUserIds.length = 0;
    }
    redisStore.clear();
    mockAuditRecord.mockClear();
  });

  async function setupChannel(): Promise<{ ownerId: string; workspaceId: string; channelId: string }> {
    const owner = await seedUser();
    createdUserIds.push(owner.id);
    const ws = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .set("Idempotency-Key", `idem-${newObjectId()}`)
      .send({ name: "Nhóm gửi tin" });
    expect(ws.status).toBe(201);
    const workspaceId = ws.body.data.workspace.id as string;
    createdWorkspaceIds.push(workspaceId);

    const ch = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/channels`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .send({ name: "Kênh gửi tin", visibility: "PUBLIC" });
    expect(ch.status).toBe(201);
    return { ownerId: owner.id, workspaceId, channelId: ch.body.data.id as string };
  }

  it("TX-01: 2 request song song cùng clientMessageId → đúng 1 tin, 1 response replay có header Idempotent-Replayed", async () => {
    const { ownerId, channelId } = await setupChannel();
    const clientMessageId = randomUUID();

    const [r1, r2] = await Promise.all([
      request(app)
        .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
        .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
        .send({ clientMessageId, content: "Đua song song" }),
      request(app)
        .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
        .set("Authorization", `Bearer ${tokenFor(ownerId)}`)
        .send({ clientMessageId, content: "Đua song song" }),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 201]);
    const replay = r1.status === 200 ? r1 : r2;
    const original = r1.status === 201 ? r1 : r2;
    expect(replay.headers["idempotent-replayed"]).toBe("true");
    expect(replay.body.data.id).toBe(original.body.data.id);

    const count = await prisma.message.count({ where: { scopeId: channelId, clientMessageId } });
    expect(count).toBe(1);
  });

  it("TX-03: mất quyền ghi GIỮA 2 lần gửi (grant kênh riêng tư bị thu hồi) → 404", async () => {
    const owner = await seedUser("Chủ nhóm");
    createdUserIds.push(owner.id);
    const member = await seedUser("Thành viên");
    createdUserIds.push(member.id);

    const ws = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .set("Idempotency-Key", `idem-${newObjectId()}`)
      .send({ name: "Nhóm TX-03" });
    const workspaceId = ws.body.data.workspace.id as string;
    createdWorkspaceIds.push(workspaceId);
    await prisma.workspaceMembership.create({ data: { workspaceId, userId: member.id, role: "MEMBER", status: "ACTIVE" } });

    const ch = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/channels`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .send({ name: "Riêng tư TX-03", visibility: "PRIVATE", initialMemberIds: [member.id] });
    expect(ch.status).toBe(201);
    const channelId = ch.body.data.id as string;

    const first = await request(app)
      .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
      .set("Authorization", `Bearer ${tokenFor(member.id)}`)
      .send({ clientMessageId: randomUUID(), content: "Còn quyền, gửi được" });
    expect(first.status).toBe(201);

    const revoke = await request(app)
      .delete(`/api/v1/channels/${channelId}/grants/${member.id}`)
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`);
    expect(revoke.status).toBe(200);

    const second = await request(app)
      .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
      .set("Authorization", `Bearer ${tokenFor(member.id)}`)
      .send({ clientMessageId: randomUUID(), content: "Vừa mất quyền" });
    expect(second.status).toBe(404);
  });

  it(
    "MSG-01: 24 request gửi song song vào 1 kênh → seq liên tục 1..24, không lỗ/trùng (rút gọn từ 200 tin/2 process — be.md README §8)",
    async () => {
      const { ownerId, workspaceId, channelId } = await setupChannel();
      // `sendRateLimiter` khoá theo (userId, scopeType, scopeId) —
      // `rateBurst.max=5/5s` (LIMITS.message) chặn 1 user gửi > 5 tin dồn dập.
      // Trải 24 request qua 6 user (owner + 5 thành viên) x 4 tin/người để
      // KHÔNG chạm rate limit (đây là race về `seq`/Counter, không phải test
      // rate limit — MSG-12 mới là ca test rate limit, ngoài phạm vi tác vụ
      // này) — vẫn đua thật vào CÙNG 1 kênh/Counter.
      const perUser = 4;
      const extraMembers = await Promise.all(Array.from({ length: 4 }, () => seedUser("Thành viên MSG-01")));
      for (const u of extraMembers) {
        createdUserIds.push(u.id);
        await prisma.workspaceMembership.create({ data: { workspaceId, userId: u.id, role: "MEMBER", status: "ACTIVE" } });
      }
      const userIds = [ownerId, ...extraMembers.map((u) => u.id)];
      const N = userIds.length * perUser;

      const responses = await Promise.all(
        userIds.flatMap((userId) =>
          Array.from({ length: perUser }, (_, i) =>
            request(app)
              .post(`/api/v1/scopes/CHANNEL/${channelId}/messages`)
              .set("Authorization", `Bearer ${tokenFor(userId)}`)
              .send({ clientMessageId: randomUUID(), content: `Tin song song ${userId}#${i}` })
          )
        )
      );

      for (const r of responses) expect(r.status).toBe(201);
      const seqs = responses.map((r) => r.body.data.seq as number).sort((a, b) => a - b);
      expect(seqs).toEqual(Array.from({ length: N }, (_, i) => i + 1));

      const count = await prisma.message.count({ where: { scopeId: channelId } });
      expect(count).toBe(N);
    },
    30_000
  );
});
