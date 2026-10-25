/**
 * Integration — WS-09 (README p1-01 §8): `GET /workspaces/:id/overview` với kênh PRIVATE mà
 * người xem KHÔNG có grant → không tên, không đếm; khối `channels` do `modules/channels`
 * đăng ký qua cổng `shared/ports/workspace-overview.port.ts` (`registerChannelModule()`).
 * Prisma/Mongo thật (memory replset), Redis mock stateful.
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
import express from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { prisma } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
import { startHarness, stopHarness, type Harness } from "../../../../infrastructure/socket/tests/integration/test-helpers";
import channelsRoutes from "../../../channels/channels.routes";
import { registerChannelModule } from "../../../channels";
import { makeRedisStore, wireRedisMocks, tokenFor, seedUser, addMembership } from "../../../conversations/tests/integration/test-utils";
import workspacesRoutes from "../../workspaces.routes";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/workspaces", workspacesRoutes);
  app.use("/api/v1", channelsRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = buildApp();
const store = makeRedisStore();
jest.setTimeout(60_000);

const auth = (id: string): string => `Bearer ${tokenFor(id)}`;
const SECRET_NAME = "Kế hoạch lương 2027 tuyệt mật";

describe("workspace overview — WS-09 (integration — Mongo memory replset)", () => {
  let harness: Harness;
  const workspaceIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    harness = await startHarness();
    bindPermissionPorts();
    registerChannelModule();
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
    wireRedisMocks(redis as unknown as Record<string, jest.Mock>, store);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
  });

  afterEach(async () => {
    await prisma.outboxEvent.deleteMany({ where: { OR: workspaceIds.map((id) => ({ aggregateId: { startsWith: id } })) } });
    await prisma.channelGrant.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.channelMembership.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.channel.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    workspaceIds.length = 0;
    userIds.length = 0;
    store.clear();
    mockAuditRecord.mockClear();
  });

  it("WS-09: kênh private không grant → overview của người thường KHÔNG chứa tên/id kênh; người có grant thì thấy; kênh công khai + mặc định vẫn hiện", async () => {
    const owner = await seedUser({ name: "Chủ nhóm WS-09" });
    const grantee = await seedUser({ name: "Người được mời vào kênh riêng" });
    const outsider = await seedUser({ name: "Thành viên thường" });
    userIds.push(owner.id, grantee.id, outsider.id);

    const ws = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", auth(owner.id))
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ name: "Nhóm WS-09" });
    expect(ws.status).toBe(201);
    const workspaceId = ws.body.data.workspace.id as string;
    const defaultChannelId = ws.body.data.defaultChannel.id as string;
    workspaceIds.push(workspaceId);
    await addMembership(workspaceId, grantee.id, "MEMBER");
    await addMembership(workspaceId, outsider.id, "MEMBER");

    const publicChannel = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/channels`)
      .set("Authorization", auth(owner.id))
      .send({ name: "Thảo luận chung", visibility: "PUBLIC" });
    expect(publicChannel.status).toBe(201);
    const privateChannel = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/channels`)
      .set("Authorization", auth(owner.id))
      .send({ name: SECRET_NAME, visibility: "PRIVATE", initialMemberIds: [grantee.id] });
    expect(privateChannel.status).toBe(201);
    const privateId = privateChannel.body.data.id as string;

    // outsider tham gia kênh công khai (tạo ChannelMembership) — kênh riêng tư thì KHÔNG (404).
    const join = await request(app)
      .post(`/api/v1/channels/${publicChannel.body.data.id}/join`)
      .set("Authorization", auth(outsider.id));
    expect(join.status).toBe(200);
    const joinPrivate = await request(app).post(`/api/v1/channels/${privateId}/join`).set("Authorization", auth(outsider.id));
    expect(joinPrivate.status).toBe(404);

    // ── Người KHÔNG có grant ──
    const asOutsider = await request(app).get(`/api/v1/workspaces/${workspaceId}/overview`).set("Authorization", auth(outsider.id));
    expect(asOutsider.status).toBe(200);
    const channels = asOutsider.body.data.channels as { default: { id: string } | null; joined: Array<{ id: string; name: string }>; pinned: unknown[] };
    expect(channels).not.toBeNull();
    expect(channels.joined.map((c) => c.name)).toContain("Thảo luận chung");
    expect(channels.default?.id).toBe(defaultChannelId);
    const body = JSON.stringify(asOutsider.body);
    expect(body).not.toContain(privateId);
    expect(body).not.toContain("Kế hoạch lương");

    // ── Người CÓ grant ──
    const asGrantee = await request(app).get(`/api/v1/workspaces/${workspaceId}/overview`).set("Authorization", auth(grantee.id));
    expect(asGrantee.status).toBe(200);
    const granteeChannels = asGrantee.body.data.channels as { joined: Array<{ id: string; name: string; visibility: string }> };
    expect(granteeChannels.joined.find((c) => c.id === privateId)).toMatchObject({ name: SECRET_NAME, visibility: "PRIVATE" });

    // ── Người ngoài workspace → 404 trung tính (WS-08), không rò gì ──
    const stranger = await seedUser({ name: "Người lạ" });
    userIds.push(stranger.id);
    const asStranger = await request(app).get(`/api/v1/workspaces/${workspaceId}/overview`).set("Authorization", auth(stranger.id));
    expect(asStranger.status).toBe(404);
    expect(JSON.stringify(asStranger.body)).not.toContain("Kế hoạch lương");
  });
});
