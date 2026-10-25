/**
 * Integration — thùng rác & job `resources.purge` (p3-01 README §3/§8, be.md §7). ST-16: tệp trong thùng rác quá 30 ngày
 * (đồng hồ giả lập bằng cách lùi `deletedAt` trong DB — job đọc đúng cột đó) → job xoá object storage + `AssetLink`,
 * `Asset` → DELETED, giảm `storageUsedBytes`, ghi audit; URL cũ → 404. Mongo memory replset thật; chỉ storage/audit giả.
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
const mockDeleteMany = jest.fn();
jest.mock("../../../../infrastructure/storage", () => ({
  storage: { getSignedUrl: jest.fn().mockResolvedValue("https://signed.example/x"), deleteMany: (...a: unknown[]) => mockDeleteMany(...a) },
  buildKey: jest.fn(),
  LocalStorage: jest.fn(),
}));

import request from "supertest";
import { prisma } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
import { getResourcesContainer } from "../../resources.container";
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
const DAY = 24 * 3600 * 1000;

describe("Resource Hub — thùng rác & purge (integration)", () => {
  const workspaceIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    bindPermissionPorts();
    registerWorkspaceResolver();
    await ensureIndexes();
  });

  afterAll(() => resetPermissionPorts());

  beforeEach(() => {
    wireRedisMocks(redis as unknown as Record<string, jest.Mock>, store);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
    mockDeleteMany.mockReset().mockResolvedValue(undefined);
    mockAuditRecord.mockClear();
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
    userIds.push(owner, member);
    const ws = await seedWorkspace(owner);
    workspaceIds.push(ws);
    await addMember(ws, member, "MEMBER");
    return { ws, owner, member };
  }

  const as = (userId: string) => ({ Authorization: `Bearer ${tokenFor(userId)}` });
  const get = (path: string, userId: string) => request(app).get(`/api/v1${path}`).set(as(userId));
  const post = (path: string, userId: string, body?: object) => request(app).post(`/api/v1${path}`).set(as(userId)).send(body ?? {});
  const del = (path: string, userId: string) => request(app).delete(`/api/v1${path}`).set(as(userId));

  async function mkResource(ws: string, userId: string, size: number, name: string, folderId?: string) {
    const assetId = await seedReadyAsset({ ownerId: userId, workspaceId: ws, size, name });
    const res = await post(`/workspaces/${ws}/resources`, userId, { assetId, ...(folderId && { folderId }) });
    expect(res.status).toBe(201);
    return { id: res.body.data.id as string, assetId };
  }

  const used = async (ws: string) => (await prisma.workspace.findUniqueOrThrow({ where: { id: ws } })).storageUsedBytes;
  const backdate = (id: string, days: number) =>
    prisma.resource.update({ where: { id }, data: { deletedAt: new Date(Date.now() - days * DAY) } });

  it("ST-16: thùng rác quá 30 ngày → job xoá object + giảm storageUsedBytes + audit; URL cũ 404; mục còn hạn giữ nguyên", async () => {
    const { ws, owner, member } = await setup();
    const old = await mkResource(ws, member, 1000, "cu.pdf");
    const recent = await mkResource(ws, member, 2000, "gan-day.pdf");
    expect(await used(ws)).toBe(3000);
    await del(`/resources/${old.id}`, member);
    await del(`/resources/${recent.id}`, member);
    expect(await used(ws)).toBe(3000); // xoá mềm VẪN tính dung lượng

    await backdate(old.id, 31); // "giả lập đồng hồ": quá 30 ngày
    await backdate(recent.id, 10);
    const oldAsset = await prisma.asset.findUniqueOrThrow({ where: { id: old.assetId } });

    const report = await getResourcesContainer().purge.runSweep();
    expect(report).toMatchObject({ resourcesPurged: 1, resourcesFailed: 0, bytesFreed: 1000 });

    // object storage đã xoá đúng khoá của tệp quá hạn
    expect(mockDeleteMany).toHaveBeenCalledWith([oldAsset.storageKey]);
    // Resource + AssetLink biến mất; Asset DELETED; dung lượng giảm
    expect(await prisma.resource.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await prisma.assetLink.count({ where: { assetId: old.assetId } })).toBe(0);
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: old.assetId } })).status).toBe("DELETED");
    expect(await used(ws)).toBe(2000);
    // audit resource.purge (actor hệ thống, KHÔNG có tên tệp) + outbox resource.purged
    expect(mockAuditRecord).toHaveBeenCalledTimes(1);
    expect(mockAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "resource.purge",
        actorRole: "system",
        targetType: "WORKSPACE",
        targetId: ws,
        workspaceId: ws,
        metadata: expect.objectContaining({ resourceId: old.id, size: 1000, mode: "SWEEP" }),
      })
    );
    expect(JSON.stringify(mockAuditRecord.mock.calls[0])).not.toContain("cu.pdf");
    expect(await prisma.outboxEvent.count({ where: { aggregateId: old.id, type: "resource.purged" } })).toBe(1);

    // URL cũ → 404 cho cả resource lẫn asset (kể cả với người đã tải lên)
    expect((await get(`/resources/${old.id}/url`, member)).status).toBe(404);
    expect((await get(`/assets/${old.assetId}/url`, member)).status).toBe(404);
    expect((await get(`/assets/${old.assetId}/url`, owner)).status).toBe(404);

    // Mục còn hạn vẫn khôi phục được
    expect((await post(`/resources/${recent.id}/restore`, member)).status).toBe(200);
    // Chạy lại job = idempotent, không xoá thêm gì
    expect(await getResourcesContainer().purge.runSweep()).toMatchObject({ resourcesPurged: 0 });
    expect(await used(ws)).toBe(2000);
  });

  it("mục quá hạn không còn khôi phục được (404), thư mục quá hạn chỉ bị xoá cứng khi trống", async () => {
    const { ws, member } = await setup();
    const folder = (await post(`/workspaces/${ws}/folders`, member, { name: "Cũ" })).body.data.id as string;
    const file = await mkResource(ws, member, 500, "a.pdf", folder);
    await del(`/resources/${file.id}`, member);
    await del(`/folders/${folder}`, member);
    await backdate(file.id, 40);
    await prisma.folder.update({ where: { id: folder }, data: { deletedAt: new Date(Date.now() - 40 * DAY) } });

    expect((await post(`/resources/${file.id}/restore`, member)).status).toBe(404); // quá hạn giữ
    expect((await post(`/folders/${folder}/restore`, member)).status).toBe(404);

    const report = await getResourcesContainer().purge.runSweep();
    expect(report).toMatchObject({ resourcesPurged: 1, foldersPurged: 1 });
    expect(await prisma.folder.count({ where: { id: folder } })).toBe(0);
  });

  it("lỗi storage: tệp ở lại thùng rác (không rò object), lượt sau thử lại và xong", async () => {
    const { ws, member } = await setup();
    const file = await mkResource(ws, member, 700, "b.pdf");
    await del(`/resources/${file.id}`, member);
    await backdate(file.id, 35);

    mockDeleteMany.mockRejectedValueOnce(new Error("storage down"));
    expect(await getResourcesContainer().purge.runSweep()).toMatchObject({ resourcesPurged: 0, resourcesFailed: 1 });
    expect(await prisma.resource.findUnique({ where: { id: file.id } })).not.toBeNull();
    expect(await used(ws)).toBe(700);
    expect(mockAuditRecord).not.toHaveBeenCalled();

    expect(await getResourcesContainer().purge.runSweep()).toMatchObject({ resourcesPurged: 1, resourcesFailed: 0 });
    expect(await prisma.resource.findUnique({ where: { id: file.id } })).toBeNull();
    expect(await used(ws)).toBe(0);
  });

  it("DELETE /workspaces/:id/trash/:resourceId — OWNER xoá vĩnh viễn ngay (audit `NOW`); MEMBER 403; tệp chưa xoá 404", async () => {
    const { ws, owner, member } = await setup();
    const file = await mkResource(ws, member, 900, "c.pdf");
    expect((await del(`/workspaces/${ws}/trash/${file.id}`, owner)).status).toBe(404); // chưa nằm trong thùng rác
    await del(`/resources/${file.id}`, member);
    expect((await del(`/workspaces/${ws}/trash/${file.id}`, member)).status).toBe(403);

    expect((await del(`/workspaces/${ws}/trash/${file.id}`, owner)).status).toBe(204);
    expect(await prisma.resource.findUnique({ where: { id: file.id } })).toBeNull();
    expect(await used(ws)).toBe(0);
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: file.assetId } })).status).toBe("DELETED");
    expect(mockDeleteMany).toHaveBeenCalledTimes(1);
    expect(mockAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: "resource.purge", actorId: owner, metadata: expect.objectContaining({ mode: "NOW" }) })
    );
    expect((await del(`/workspaces/${ws}/trash/${file.id}`, owner)).status).toBe(404);
  });

  it("thùng rác phân trang: trang ngắn vẫn tiến lên, không lặp, còn N ngày (purgeAt)", async () => {
    const { ws, owner, member } = await setup();
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const r = await mkResource(ws, member, 100, `t${i}.pdf`);
      await del(`/resources/${r.id}`, member);
      ids.push(r.id);
    }
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 6; page += 1) {
      const res = await get(`/workspaces/${ws}/trash?limit=2${cursor ? `&cursor=${cursor}` : ""}`, owner);
      expect(res.status).toBe(200);
      for (const r of res.body.data.resources) {
        seen.push(r.id);
        expect(new Date(r.purgeAt).getTime()).toBeGreaterThan(Date.now() + 29 * DAY);
      }
      cursor = res.body.meta.nextCursor ?? undefined;
      if (!res.body.meta.hasMore) break;
    }
    expect([...seen].sort()).toEqual([...ids].sort());
    expect(new Set(seen).size).toBe(5);
  });
});
