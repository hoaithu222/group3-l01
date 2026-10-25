/**
 * Integration — tính toàn vẹn của workspace trên Mongo THẬT (memory replset):
 *   - WS-06: tạo nhóm mà bước tạo kênh mặc định lỗi (inject) → rollback TOÀN BỘ
 *     (không workspace/membership/outbox mồ côi) — điều unit không chứng minh được.
 *   - WS-07: hai request chuyển owner ĐỒNG THỜI tới 2 người khác nhau → đúng MỘT
 *     thành công, cuối cùng có đúng MỘT OWNER ACTIVE và `Workspace.ownerId` khớp.
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
import type { ChannelBootstrapPort } from "../../../../shared/ports/channel-bootstrap.port";
import type { AssetLinkService } from "../../../assets/public";
import { registerChannelModule } from "../../../channels";
import { makeRedisStore, wireRedisMocks, tokenFor, seedUser, addMembership } from "../../../conversations/tests/integration/test-utils";
import workspacesRoutes from "../../workspaces.routes";
import { PrismaWorkspaceRepository } from "../../repositories";
import { WorkspaceService } from "../../services/workspace.service";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/workspaces", workspacesRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = buildApp();
const store = makeRedisStore();

describe("workspaces consistency (integration — Mongo memory replset)", () => {
  const workspaceIds: string[] = [];
  const userIds: string[] = [];
  let harness: Harness;

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
    await prisma.channelMembership.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.channel.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.workspaceMembership.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await prisma.workspaceMembership.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.workspace.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    workspaceIds.length = 0;
    userIds.length = 0;
    store.clear();
    mockAuditRecord.mockClear();
  });

  it("WS-06: lỗi khi tạo kênh mặc định (inject) → rollback toàn bộ — không Workspace, không membership OWNER, không outbox workspace.created", async () => {
    const user = await seedUser({ name: "Người tạo nhóm WS-06" });
    userIds.push(user.id);
    const outboxBefore = await prisma.outboxEvent.count({ where: { type: "workspace.created" } });

    const boom = new Error("inject: tạo kênh mặc định thất bại");
    const failingBootstrap: ChannelBootstrapPort = {
      createDefault: async () => {
        throw boom;
      },
      joinDefault: async () => undefined,
    };
    const assetLinks = { attach: jest.fn(), detach: jest.fn(), replace: jest.fn() } as unknown as AssetLinkService;
    const service = new WorkspaceService(new PrismaWorkspaceRepository(), failingBootstrap, assetLinks);

    await expect(service.create(user.id, { name: "Nhóm sẽ không tồn tại" })).rejects.toBe(boom);

    expect(await prisma.workspace.count({ where: { ownerId: user.id } })).toBe(0);
    expect(await prisma.workspaceMembership.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.channel.count({ where: { createdBy: user.id } })).toBe(0);
    expect(await prisma.outboxEvent.count({ where: { type: "workspace.created" } })).toBe(outboxBefore);
  }, 20_000);

  it("WS-07: 2 request chuyển owner ĐỒNG THỜI tới 2 người khác nhau → đúng 1 thành công, cuối cùng đúng 1 OWNER ACTIVE khớp Workspace.ownerId", async () => {
    const owner = await seedUser({ name: "Chủ cũ WS-07" });
    const a = await seedUser({ name: "Người nhận A" });
    const b = await seedUser({ name: "Người nhận B" });
    userIds.push(owner.id, a.id, b.id);

    const created = await request(app)
      .post("/api/v1/workspaces")
      .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
      .set("Idempotency-Key", `idem-${randomUUID()}`)
      .send({ name: "Nhóm chuyển owner" });
    expect(created.status).toBe(201);
    const workspaceId = created.body.data.workspace.id as string;
    workspaceIds.push(workspaceId);
    const version = created.body.data.workspace.version as number;
    await addMembership(workspaceId, a.id, "MEMBER");
    await addMembership(workspaceId, b.id, "MEMBER");

    const transfer = (toUserId: string, confirmName: string) =>
      request(app)
        .post(`/api/v1/workspaces/${workspaceId}/transfer-owner`)
        .set("Authorization", `Bearer ${tokenFor(owner.id)}`)
        .send({ toUserId, confirmName, expectedVersion: version });

    const [ra, rb] = await Promise.all([transfer(a.id, "Người nhận A"), transfer(b.id, "Người nhận B")]);

    const statuses = [ra.status, rb.status].sort();
    expect(statuses[0]).toBe(200); // đúng một request thành công…
    expect(statuses[1]).toBe(409); // …request còn lại thua cuộc đua (WS_008/RES_003), KHÔNG phải 500
    expect(["WS_008", "RES_003"]).toContain((ra.status === 409 ? ra : rb).body.error.code);

    const owners = await prisma.workspaceMembership.findMany({ where: { workspaceId, role: "OWNER", status: "ACTIVE" } });
    expect(owners).toHaveLength(1);
    const winner = ra.status === 200 ? a.id : b.id;
    expect(owners[0].userId).toBe(winner);
    expect((await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } })).ownerId).toBe(winner);
    // Chủ cũ chỉ còn ADMIN; người thua cuộc đua vẫn là MEMBER.
    expect((await prisma.workspaceMembership.findFirstOrThrow({ where: { workspaceId, userId: owner.id } })).role).toBe("ADMIN");
    const loser = ra.status === 200 ? b.id : a.id;
    expect((await prisma.workspaceMembership.findFirstOrThrow({ where: { workspaceId, userId: loser } })).role).toBe("MEMBER");
    expect(await prisma.outboxEvent.count({ where: { type: "workspace.owner-transferred", aggregateId: workspaceId } })).toBe(1);
  }, 30_000);
});
