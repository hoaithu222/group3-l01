/**
 * Integration — endpoint admin của kho tài liệu (admin.md p3-01 §3): `GET /admin/workspaces/:id/resource-stats`,
 * `PUT /admin/workspaces/:id/resource-quota`, `POST /admin/workspaces/:id/resource-quota/reset`. Mongo memory replset;
 * `SystemConfig` thật (khoá `resource`), audit giả để quan sát. Quyền theo role hệ thống (`requirePermission`).
 */
process.env.FEATURE_FLAGS = "project=true";
jest.mock("../../../../core/constants/modules", () => {
  const actual = jest.requireActual("../../../../core/constants/modules");
  return { ...actual, AVAILABLE_MODULES: [...actual.AVAILABLE_MODULES, actual.MODULES.PROJECT] };
});
jest.mock("../../../../infrastructure/queue/outbox/outbox.writer", () => {
  const actual = jest.requireActual("../../../../infrastructure/queue/outbox/outbox.writer");
  return { ...actual, outboxSignal: jest.fn().mockResolvedValue(undefined) };
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
import { newObjectId } from "../../../../core/utils/object-id";
import { makeRedisStore, wireRedisMocks } from "../support/redis-store";
import {
  addMember,
  buildApp,
  cleanupWorkspaces,
  ensureIndexes,
  registerWorkspaceResolver,
  seedReadyAsset,
  seedUser,
  seedWorkspace,
  tokenFor,
} from "../support/fixtures";

const app = buildApp();
const store = makeRedisStore();
const GiB = 1024 * 1024 * 1024;

describe("Resource Hub — admin (integration)", () => {
  const workspaceIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    bindPermissionPorts();
    registerWorkspaceResolver();
    await ensureIndexes();
  });

  afterAll(async () => {
    await prisma.systemConfig.deleteMany({ where: { key: "resource" } });
    resetPermissionPorts();
  });

  beforeEach(async () => {
    wireRedisMocks(redis as unknown as Record<string, jest.Mock>, store);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
    mockAuditRecord.mockClear();
    await prisma.systemConfig.deleteMany({ where: { key: "resource" } });
  });

  afterEach(async () => {
    await cleanupWorkspaces(workspaceIds, userIds);
    workspaceIds.length = 0;
    userIds.length = 0;
    store.clear();
  });

  async function setup() {
    const owner = await seedUser("Chủ nhóm");
    const member = await seedUser("Thành viên");
    const admin = await seedUser("Quản trị nền tảng");
    userIds.push(owner, member, admin);
    const ws = await seedWorkspace(owner);
    workspaceIds.push(ws);
    await addMember(ws, member, "MEMBER");
    return { ws, owner, member, admin };
  }

  const authed = (userId: string, role: string) => ({ Authorization: `Bearer ${tokenFor(userId, role)}` });
  const adminGet = (path: string, userId: string, role = "admin") =>
    request(app).get(`/api/v1/admin/workspaces${path}`).set(authed(userId, role));
  const adminPut = (path: string, userId: string, body: object, role = "admin") =>
    request(app).put(`/api/v1/admin/workspaces${path}`).set(authed(userId, role)).send(body);
  const adminPost = (path: string, userId: string, body: object, role = "admin") =>
    request(app).post(`/api/v1/admin/workspaces${path}`).set(authed(userId, role)).send(body);

  const reason = "Nhóm cần thêm dung lượng cho học kỳ mới";

  it("stats: số liệu dung lượng/tệp/thư mục/thùng rác theo loại — KHÔNG có tên tệp", async () => {
    const { ws, member, admin } = await setup();
    const asMember = { Authorization: `Bearer ${tokenFor(member)}` };
    const a1 = await seedReadyAsset({ ownerId: member, workspaceId: ws, size: 1000, name: "tuyet-mat.pdf" });
    const a2 = await seedReadyAsset({ ownerId: member, workspaceId: ws, size: 500, name: "ma-nguon.ts", mime: "text/plain" });
    const a3 = await seedReadyAsset({ ownerId: member, workspaceId: ws, size: 300, name: "bo-di.pdf" });
    const ids: string[] = [];
    for (const assetId of [a1, a2, a3]) {
      const res = await request(app).post(`/api/v1/workspaces/${ws}/resources`).set(asMember).send({ assetId });
      expect(res.status).toBe(201);
      ids.push(res.body.data.id);
    }
    await request(app).delete(`/api/v1/resources/${ids[2]}`).set(asMember);
    await request(app).post(`/api/v1/workspaces/${ws}/folders`).set(asMember).send({ name: "Bí mật của nhóm" });

    const res = await adminGet(`/${ws}/resource-stats`, admin);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      usedBytes: 1800,
      quotaBytes: 2 * GiB,
      quotaSource: "DEFAULT",
      fileCount: 2,
      folderCount: 1,
      trashBytes: 300,
    });
    expect(res.body.data.byType).toEqual(
      expect.arrayContaining([
        { type: "PDF", count: 1, bytes: 1000 },
        { type: "CODE", count: 1, bytes: 500 },
      ])
    );
    const raw = JSON.stringify(res.body);
    for (const secret of ["tuyet-mat", "ma-nguon", "bo-di", "Bí mật"]) expect(raw).not.toContain(secret);
    expect((await adminGet(`/${newObjectId()}/resource-stats`, admin)).status).toBe(404);
  });

  it("quyền: người dùng thường 403; MANAGER xem được (workspace:view) nhưng KHÔNG đặt/xoá hạn mức (system-config:update)", async () => {
    const { ws, member, admin } = await setup();
    expect((await adminGet(`/${ws}/resource-stats`, member, "user")).status).toBe(403);
    expect((await adminGet(`/${ws}/resource-stats`, admin, "manager")).status).toBe(200);
    expect((await adminPut(`/${ws}/resource-quota`, admin, { bytes: GiB, reason }, "manager")).status).toBe(403);
    expect((await adminPost(`/${ws}/resource-quota/reset`, admin, { reason }, "manager")).status).toBe(403);
    expect(await prisma.systemConfig.count({ where: { key: "resource" } })).toBe(0);
  });

  it("PUT đặt hạn mức riêng → stats OVERRIDE, audit `resource.quota-override`, và `POST /assets` theo hạn mức mới (RSC_007)", async () => {
    const { ws, member, admin } = await setup();
    const res = await adminPut(`/${ws}/resource-quota`, admin, { bytes: GiB, reason });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ quotaBytes: GiB, quotaSource: "OVERRIDE" });

    const doc = await prisma.systemConfig.findUniqueOrThrow({ where: { key: "resource" } });
    expect(doc.value).toEqual({ quotaOverrides: [{ workspaceId: ws, bytes: GiB }] });
    expect(doc.version).toBe(1);
    expect(mockAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "resource.quota-override",
        actorId: admin,
        targetType: "WORKSPACE",
        targetId: ws,
        workspaceId: ws,
        reason,
        metadata: expect.objectContaining({ mode: "SET", bytes: GiB, previousBytes: 2 * GiB, previousSource: "DEFAULT" }),
      })
    );
    expect((await adminGet(`/${ws}/resource-stats`, admin)).body.data).toMatchObject({ quotaBytes: GiB, quotaSource: "OVERRIDE" });

    // Hạn mức mới có hiệu lực ngay ở cổng upload: đã dùng gần đủ 1 GiB → xin thêm 200 byte bị chặn.
    await prisma.workspace.update({ where: { id: ws }, data: { storageUsedBytes: GiB - 100 } });
    const ask = await request(app)
      .post("/api/v1/assets")
      .set({ Authorization: `Bearer ${tokenFor(member)}`, "Idempotency-Key": `idem-${newObjectId()}` })
      .send({ scope: "RESOURCE", kind: "FILE", fileName: "a.pdf", mime: "application/pdf", size: 200, workspaceId: ws });
    expect(ask.status).toBe(413);
    expect(ask.body.error).toMatchObject({ code: "RSC_007", details: { quotaBytes: GiB } });
  });

  it("đặt lại cho cùng nhóm ghi đè (không nhân đôi); nhóm khác thêm dòng mới; reset xoá đúng dòng của nhóm", async () => {
    const { ws, admin, owner } = await setup();
    const ws2 = await seedWorkspace(owner);
    workspaceIds.push(ws2);
    await adminPut(`/${ws}/resource-quota`, admin, { bytes: GiB, reason });
    await adminPut(`/${ws}/resource-quota`, admin, { bytes: 3 * GiB, reason });
    await adminPut(`/${ws2}/resource-quota`, admin, { bytes: 5 * GiB, reason });
    const stored = await prisma.systemConfig.findUniqueOrThrow({ where: { key: "resource" } });
    expect((stored.value as { quotaOverrides: unknown[] }).quotaOverrides).toEqual(
      expect.arrayContaining([
        { workspaceId: ws, bytes: 3 * GiB },
        { workspaceId: ws2, bytes: 5 * GiB },
      ])
    );
    expect((stored.value as { quotaOverrides: unknown[] }).quotaOverrides).toHaveLength(2);
    expect(stored.version).toBe(3);

    const reset = await adminPost(`/${ws}/resource-quota/reset`, admin, { reason });
    expect(reset.status).toBe(200);
    expect(reset.body.data).toEqual({ quotaBytes: 2 * GiB, quotaSource: "DEFAULT" });
    expect(mockAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: "resource.quota-override", metadata: expect.objectContaining({ mode: "RESET", previousBytes: 3 * GiB }) })
    );
    expect((await adminGet(`/${ws2}/resource-stats`, admin)).body.data).toMatchObject({ quotaBytes: 5 * GiB, quotaSource: "OVERRIDE" });
  });

  it("kiểm dữ liệu: bytes ngoài 0,5–100 GiB / lý do < 10 ký tự → 400; nhóm không tồn tại → 404; quá 500 dòng → 400", async () => {
    const { ws, admin } = await setup();
    expect((await adminPut(`/${ws}/resource-quota`, admin, { bytes: 100 * 1024 * 1024, reason })).status).toBe(400);
    expect((await adminPut(`/${ws}/resource-quota`, admin, { bytes: 101 * GiB, reason })).status).toBe(400);
    expect((await adminPut(`/${ws}/resource-quota`, admin, { bytes: GiB, reason: "ngắn" })).status).toBe(400);
    expect((await adminPost(`/${ws}/resource-quota/reset`, admin, { reason: "ngắn" })).status).toBe(400);
    expect((await adminPut(`/${newObjectId()}/resource-quota`, admin, { bytes: GiB, reason })).status).toBe(404);

    const full = Array.from({ length: 500 }, () => ({ workspaceId: newObjectId(), bytes: GiB }));
    await prisma.systemConfig.create({ data: { key: "resource", value: { quotaOverrides: full }, version: 1 } });
    const over = await adminPut(`/${ws}/resource-quota`, admin, { bytes: GiB, reason });
    expect(over.status).toBe(400);
    expect(mockAuditRecord).not.toHaveBeenCalled();
  });

  it("2 admin đặt hạn mức cho 2 nhóm KHÁC NHAU cùng lúc: cả hai dòng đều được lưu (CAS có thử lại)", async () => {
    const { ws, admin, owner } = await setup();
    const ws2 = await seedWorkspace(owner);
    const ws3 = await seedWorkspace(owner);
    workspaceIds.push(ws2, ws3);
    const results = await Promise.all([
      adminPut(`/${ws}/resource-quota`, admin, { bytes: GiB, reason }),
      adminPut(`/${ws2}/resource-quota`, admin, { bytes: 2 * GiB, reason }),
      adminPut(`/${ws3}/resource-quota`, admin, { bytes: 3 * GiB, reason }),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    const stored = await prisma.systemConfig.findUniqueOrThrow({ where: { key: "resource" } });
    expect((stored.value as { quotaOverrides: unknown[] }).quotaOverrides).toHaveLength(3);
  });
});
