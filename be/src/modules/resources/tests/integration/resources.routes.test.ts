/**
 * Integration — `/workspaces/:id/folders|resources|trash|storage`, `/folders/:id*`, `/resources/:id*` trên Prisma thật
 * (Mongo memory replset, `TEST_DB=memory`) với CÁC UNIQUE INDEX THẬT (`Folder_workspaceId_parentKey_nameKey_key`,
 * `Resource_assetId_key` — `global-setup` không `db push` nên test tự tạo) — nên ST-11 (tạo thư mục trùng tên ĐỒNG THỜI) kiểm
 * bằng chính index chứ không phải mock. Redis mock có trạng thái. Ma trận quyền dùng resolver WORKSPACE thật (D-28).
 *
 * p3-01 README §8: ST-11, ST-12, ST-13, ST-14, ST-17 (+ quyền GUEST/ARCHIVED, cache theo phiên bản, cursor, tìm không dấu).
 * ST-01/ST-15 (luồng upload) ở `resources-upload.test.ts`; ST-16 (purge) ở `resources-purge.test.ts`.
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

describe("Resource Hub — routes (integration, Mongo memory replset + unique index thật)", () => {
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
  });

  afterEach(async () => {
    await cleanupWorkspaces(workspaceIds, userIds);
    workspaceIds.length = 0;
    userIds.length = 0;
    store.clear();
  });

  /** Nhóm có OWNER + ADMIN + MEMBER (+ MEMBER thứ hai, GUEST, người ngoài nhóm). */
  async function setup() {
    const owner = await seedUser("Chủ nhóm");
    const admin = await seedUser("Quản trị");
    const member = await seedUser("Thành viên");
    const other = await seedUser("Thành viên khác");
    const guest = await seedUser("Khách");
    const outsider = await seedUser("Người ngoài");
    userIds.push(owner, admin, member, other, guest, outsider);
    const ws = await seedWorkspace(owner);
    workspaceIds.push(ws);
    await addMember(ws, admin, "ADMIN");
    await addMember(ws, member, "MEMBER");
    await addMember(ws, other, "MEMBER");
    await addMember(ws, guest, "GUEST");
    return { ws, owner, admin, member, other, guest, outsider };
  }

  const as = (userId: string) => ({ Authorization: `Bearer ${tokenFor(userId)}` });
  const post = (path: string, userId: string, body?: object) => request(app).post(`/api/v1${path}`).set(as(userId)).send(body ?? {});
  const patch = (path: string, userId: string, body: object) => request(app).patch(`/api/v1${path}`).set(as(userId)).send(body);
  const get = (path: string, userId: string) => request(app).get(`/api/v1${path}`).set(as(userId));
  const del = (path: string, userId: string) => request(app).delete(`/api/v1${path}`).set(as(userId));

  async function mkFolder(ws: string, userId: string, name: string, parentId?: string): Promise<{ id: string; version: number }> {
    const res = await post(`/workspaces/${ws}/folders`, userId, { name, ...(parentId && { parentId }) });
    expect(res.status).toBe(201);
    return { id: res.body.data.id, version: res.body.data.version };
  }

  async function mkResource(
    ws: string,
    userId: string,
    opts: { name?: string; folderId?: string; mime?: string; size?: number } = {}
  ): Promise<{ id: string; assetId: string; version: number }> {
    const assetId = await seedReadyAsset({ ownerId: userId, workspaceId: ws, name: opts.name, mime: opts.mime, size: opts.size });
    const res = await post(`/workspaces/${ws}/resources`, userId, { assetId, ...(opts.folderId && { folderId: opts.folderId }) });
    expect(res.status).toBe(201);
    return { id: res.body.data.id, assetId, version: res.body.data.version };
  }

  // ── Thư mục ────────────────────────────────────────────────────────────────

  describe("Thư mục — tên duy nhất theo cấp, ST-11", () => {
    it("ST-11: 2 yêu cầu ĐỒNG THỜI tạo thư mục trùng tên (khác hoa/dấu) cùng cấp → 1 thành công, 1 × 409 RSC_002", async () => {
      const { ws, member, other } = await setup();
      for (let round = 0; round < 3; round += 1) {
        const [a, b] = await Promise.all([
          post(`/workspaces/${ws}/folders`, member, { name: `Tài liệu ${round}` }),
          post(`/workspaces/${ws}/folders`, other, { name: `TAI LIEU ${round}` }),
        ]);
        expect([a.status, b.status].sort()).toEqual([201, 409]);
        const loser = a.status === 409 ? a : b;
        expect(loser.body.error.code).toBe("RSC_002");
        expect(await prisma.folder.count({ where: { workspaceId: ws, normalizedName: `tai lieu ${round}` } })).toBe(1);
      }
    });

    it("cùng tên ở CẤP KHÁC được phép; sau khi xoá mềm thì nhường tên cho thư mục mới", async () => {
      const { ws, member } = await setup();
      const a = await mkFolder(ws, member, "Slide");
      await mkFolder(ws, member, "Slide", a.id); // cấp khác
      const dup = await post(`/workspaces/${ws}/folders`, member, { name: " slide " });
      expect(dup.status).toBe(409);
      expect((await del(`/folders/${a.id}`, member)).status).toBe(409); // còn thư mục con → RSC_004
    });

    it("xoá mềm giải phóng tên: xoá thư mục rỗng rồi tạo lại cùng tên → 201", async () => {
      const { ws, member } = await setup();
      const a = await mkFolder(ws, member, "Tạm");
      expect((await del(`/folders/${a.id}`, member)).status).toBe(204);
      const again = await post(`/workspaces/${ws}/folders`, member, { name: "Tạm" });
      expect(again.status).toBe(201);
      const stale = await prisma.folder.findUnique({ where: { id: a.id } });
      expect(stale?.deletedAt).not.toBeNull();
      expect(stale?.nameKey).toBe(`tam#${a.id}`);
    });
  });

  describe("Độ sâu ≤ 8 (ST-13) và di chuyển (ST-12)", () => {
    it("ST-13: cấp thứ 9 → 400 RSC_001", async () => {
      const { ws, member } = await setup();
      let parent: string | undefined;
      for (let depth = 1; depth <= 8; depth += 1) parent = (await mkFolder(ws, member, `cap ${depth}`, parent)).id;
      const ninth = await post(`/workspaces/${ws}/folders`, member, { name: "cap 9", parentId: parent });
      expect(ninth.status).toBe(400);
      expect(ninth.body.error.code).toBe("RSC_001");
    });

    it("ST-12: di chuyển thư mục vào chính nó / vào thư mục con của nó → 400 RSC_006", async () => {
      const { ws, member } = await setup();
      const a = await mkFolder(ws, member, "A");
      const b = await mkFolder(ws, member, "B", a.id);
      const c = await mkFolder(ws, member, "C", b.id);
      for (const target of [a.id, b.id, c.id]) {
        const res = await patch(`/folders/${a.id}`, member, { parentId: target, expectedVersion: a.version });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("RSC_006");
      }
    });

    it("di chuyển cây 3 cấp cập nhật `path`/`depth` của mọi hậu duệ (lệnh ghi thô thật trên Mongo)", async () => {
      const { ws, member } = await setup();
      const a = await mkFolder(ws, member, "A");
      const b = await mkFolder(ws, member, "B", a.id);
      const c = await mkFolder(ws, member, "C", b.id);
      const d = await mkFolder(ws, member, "D");
      const e = await mkFolder(ws, member, "E", d.id);

      const moved = await patch(`/folders/${a.id}`, member, { parentId: e.id, expectedVersion: a.version });
      expect(moved.status).toBe(200);
      expect(moved.body.data.depth).toBe(3);

      const rows = await prisma.folder.findMany({ where: { workspaceId: ws } });
      const byId = new Map(rows.map((r) => [r.id, r]));
      expect(byId.get(a.id)).toMatchObject({ depth: 3, path: [d.id, e.id], parentKey: e.id });
      expect(byId.get(b.id)).toMatchObject({ depth: 4, path: [d.id, e.id, a.id] });
      expect(byId.get(c.id)).toMatchObject({ depth: 5, path: [d.id, e.id, a.id, b.id] });

      // Về gốc: depth/path co lại.
      const back = await patch(`/folders/${a.id}`, member, { parentId: null, expectedVersion: moved.body.data.version });
      expect(back.status).toBe(200);
      const after = new Map((await prisma.folder.findMany({ where: { workspaceId: ws } })).map((r) => [r.id, r]));
      expect(after.get(c.id)).toMatchObject({ depth: 3, path: [a.id, b.id] });
    });

    it("di chuyển làm cây con sâu nhất vượt 8 cấp → 400 RSC_001", async () => {
      const { ws, member } = await setup();
      let deep: string | undefined;
      for (let depth = 1; depth <= 6; depth += 1) deep = (await mkFolder(ws, member, `sau ${depth}`, deep)).id;
      const x = await mkFolder(ws, member, "X");
      const y = await mkFolder(ws, member, "Y", x.id);
      await mkFolder(ws, member, "Z", y.id); // cây 3 cấp
      const res = await patch(`/folders/${x.id}`, member, { parentId: deep, expectedVersion: x.version });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("RSC_001");
    });

    it("2 lần di chuyển đối xứng ĐỒNG THỜI (A→B, B→A) không bao giờ tạo vòng", async () => {
      const { ws, member } = await setup();
      const a = await mkFolder(ws, member, "A");
      const b = await mkFolder(ws, member, "B");
      const [r1, r2] = await Promise.all([
        patch(`/folders/${a.id}`, member, { parentId: b.id, expectedVersion: a.version }),
        patch(`/folders/${b.id}`, member, { parentId: a.id, expectedVersion: b.version }),
      ]);
      const statuses = [r1.status, r2.status].sort();
      expect(statuses[0]).toBe(200);
      expect(statuses[1]).toBe(400); // bên thua thử lại, thấy vòng → RSC_006
      const rows = await prisma.folder.findMany({ where: { workspaceId: ws } });
      for (const row of rows) expect(row.path).not.toContain(row.id);
    });

    it("đổi tên trùng → 409 RSC_002; lệch phiên bản → 409 RES_003 kèm currentVersion", async () => {
      const { ws, member } = await setup();
      const a = await mkFolder(ws, member, "A");
      await mkFolder(ws, member, "B");
      const dup = await patch(`/folders/${a.id}`, member, { name: "b", expectedVersion: a.version });
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe("RSC_002");
      const stale = await patch(`/folders/${a.id}`, member, { name: "A2", expectedVersion: 99 });
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe("RES_003");
      expect(stale.body.error.details.currentVersion).toBe(a.version);
    });
  });

  describe("Xoá / khôi phục thư mục", () => {
    it("RSC_004 khi còn nội dung và không recursive; MEMBER recursive vẫn RSC_004; ADMIN recursive xoá cả lô, khôi phục theo lô", async () => {
      const { ws, member, admin } = await setup();
      const top = await mkFolder(ws, member, "Top");
      const sub = await mkFolder(ws, member, "Sub", top.id);
      const file = await mkResource(ws, member, { folderId: sub.id, name: "a.pdf" });

      expect((await del(`/folders/${top.id}`, admin)).body.error.code).toBe("RSC_004");
      expect((await del(`/folders/${top.id}?recursive=true`, member)).body.error.code).toBe("RSC_004");
      expect((await del(`/folders/${top.id}?recursive=true`, admin)).status).toBe(204);

      const deleted = await prisma.folder.findMany({ where: { workspaceId: ws, deletedAt: { not: null } } });
      expect(deleted).toHaveLength(2);
      expect(new Set(deleted.map((f) => f.deletedAt?.getTime())).size).toBe(1); // cùng lô
      expect((await prisma.resource.findUnique({ where: { id: file.id } }))?.deletedAt).not.toBeNull();

      // Thùng rác chỉ liệt kê GỐC của lô (Top) — không liệt kê lẻ Sub/tệp lồng.
      const trash = await get(`/workspaces/${ws}/trash`, admin);
      expect(trash.status).toBe(200);
      expect(trash.body.data.folders.map((f: { id: string }) => f.id)).toEqual([top.id]);
      expect(trash.body.data.resources).toHaveLength(0);
      expect(trash.body.data.folders[0]).toMatchObject({ canRestore: true, canPurge: true });

      const restored = await post(`/folders/${top.id}/restore`, admin);
      expect(restored.status).toBe(200);
      expect(await prisma.folder.count({ where: { workspaceId: ws, deletedAt: null } })).toBe(2);
      expect((await prisma.resource.findUnique({ where: { id: file.id } }))?.deletedAt).toBeNull();
    });

    it("khôi phục: RSC_002 khi tên đã bị chiếm, RSC_008 khi thư mục cha còn đang bị xoá", async () => {
      const { ws, member, admin } = await setup();
      const a = await mkFolder(ws, member, "Báo cáo");
      expect((await del(`/folders/${a.id}`, member)).status).toBe(204);
      await mkFolder(ws, member, "Báo cáo"); // chiếm tên
      const taken = await post(`/folders/${a.id}/restore`, member);
      expect(taken.status).toBe(409);
      expect(taken.body.error.code).toBe("RSC_002");

      const p = await mkFolder(ws, member, "Cha");
      const c = await mkFolder(ws, member, "Con", p.id);
      expect((await del(`/folders/${c.id}`, member)).status).toBe(204);
      expect((await del(`/folders/${p.id}`, member)).status).toBe(204);
      const gone = await post(`/folders/${c.id}/restore`, admin);
      expect(gone.status).toBe(409);
      expect(gone.body.error.code).toBe("RSC_008");
    });

    it("liệt kê: breadcrumb là tổ tiên (không gồm chính nó), children sắp theo tên không dấu", async () => {
      const { ws, member } = await setup();
      const a = await mkFolder(ws, member, "A");
      const b = await mkFolder(ws, member, "B", a.id);
      await mkFolder(ws, member, "Đề", b.id);
      await mkFolder(ws, member, "Bài", b.id);
      await mkFolder(ws, member, "An", b.id);
      const res = await get(`/workspaces/${ws}/folders?parentId=${b.id}`, member);
      expect(res.status).toBe(200);
      expect(res.body.data.folder.id).toBe(b.id);
      expect(res.body.data.breadcrumb.map((f: { id: string }) => f.id)).toEqual([a.id]);
      expect(res.body.data.children.map((f: { name: string }) => f.name)).toEqual(["An", "Bài", "Đề"]);
      const root = await get(`/workspaces/${ws}/folders`, member);
      expect(root.body.data.folder).toBeUndefined();
      expect(root.body.data.children.map((f: { id: string }) => f.id)).toEqual([a.id]);
    });
  });

  // ── Tệp ────────────────────────────────────────────────────────────────────

  describe("Phân quyền tệp — ST-14 và ma trận README §6", () => {
    it("ST-14: MEMBER xoá tệp của người khác → 403; OWNER xoá được, vào thùng rác; khôi phục chỉ OWNER/ADMIN/người xoá", async () => {
      const { ws, owner, member, other } = await setup();
      const file = await mkResource(ws, other, { name: "cua-other.pdf" });

      const denied = await del(`/resources/${file.id}`, member);
      expect(denied.status).toBe(403);
      expect((await prisma.resource.findUnique({ where: { id: file.id } }))?.deletedAt).toBeNull();

      expect((await del(`/resources/${file.id}`, owner)).status).toBe(204);
      const trash = await get(`/workspaces/${ws}/trash`, owner);
      expect(trash.body.data.resources.map((r: { id: string }) => r.id)).toEqual([file.id]);
      // MEMBER khác không thấy mục do OWNER xoá và không khôi phục được.
      expect((await get(`/workspaces/${ws}/trash`, member)).body.data.resources).toHaveLength(0);
      expect((await post(`/resources/${file.id}/restore`, member)).status).toBe(403);
      expect((await post(`/resources/${file.id}/restore`, owner)).status).toBe(200);
    });

    it("MEMBER sửa/xoá tệp CỦA MÌNH; GUEST → 404 mọi thao tác; người ngoài nhóm → 404", async () => {
      const { ws, member, guest, outsider } = await setup();
      const mine = await mkResource(ws, member, { name: "cua-toi.pdf" });
      const renamed = await patch(`/resources/${mine.id}`, member, { name: "doi-ten.pdf", expectedVersion: mine.version });
      expect(renamed.status).toBe(200);
      expect(renamed.body.data.canModify).toBe(true);

      for (const who of [guest, outsider]) {
        expect((await get(`/workspaces/${ws}/resources`, who)).status).toBe(404);
        expect((await get(`/workspaces/${ws}/folders`, who)).status).toBe(404);
        expect((await get(`/resources/${mine.id}`, who)).status).toBe(404);
        expect((await get(`/resources/${mine.id}/url`, who)).status).toBe(404);
        expect((await post(`/workspaces/${ws}/folders`, who, { name: "x" })).status).toBe(404);
        expect((await del(`/resources/${mine.id}`, who)).status).toBe(404);
      }
      expect((await del(`/resources/${mine.id}`, member)).status).toBe(204);
    });

    it("storage/xoá vĩnh viễn: MEMBER → 403, ADMIN/OWNER → 200", async () => {
      const { ws, member, admin } = await setup();
      expect((await get(`/workspaces/${ws}/storage`, member)).status).toBe(403);
      const res = await get(`/workspaces/${ws}/storage`, admin);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ usedBytes: 0, quotaBytes: 2 * GiB, quotaSource: "DEFAULT", fileCount: 0 });
      const file = await mkResource(ws, member);
      await del(`/resources/${file.id}`, member);
      expect((await del(`/workspaces/${ws}/trash/${file.id}`, member)).status).toBe(403);
    });

    it("workspace ARCHIVED: mọi ghi → 403, đọc vẫn cho", async () => {
      const { ws, member, owner } = await setup();
      const file = await mkResource(ws, member);
      await prisma.workspace.update({ where: { id: ws }, data: { status: "ARCHIVED" } });
      store.clear(); // bỏ cache quyền
      expect((await get(`/workspaces/${ws}/resources`, member)).status).toBe(200);
      expect((await get(`/resources/${file.id}`, member)).status).toBe(200);
      expect((await post(`/workspaces/${ws}/folders`, member, { name: "Mới" })).status).toBe(403);
      expect((await del(`/resources/${file.id}`, owner)).status).toBe(403);
      expect((await patch(`/resources/${file.id}`, member, { name: "x.pdf", expectedVersion: 1 })).status).toBe(403);
    });
  });

  describe("ST-17 — người ngoài đoán resourceId/assetId", () => {
    it("404 cho cả `GET /resources/:id` lẫn `GET /assets/:id/url`; thành viên → 200; rời nhóm → lại 404", async () => {
      const { ws, member, outsider, guest } = await setup();
      const file = await mkResource(ws, member, { name: "mat.pdf" });

      for (const who of [outsider, guest]) {
        expect((await get(`/resources/${file.id}`, who)).status).toBe(404);
        expect((await get(`/assets/${file.assetId}/url`, who)).status).toBe(404);
      }
      expect((await get(`/resources/${file.id}`, member)).status).toBe(200);
      expect((await get(`/resources/${file.id}/url`, member)).status).toBe(200);
      expect((await get(`/assets/${file.assetId}/url`, member)).status).toBe(200);

      await prisma.workspaceMembership.updateMany({ where: { workspaceId: ws, userId: member }, data: { status: "LEFT" } });
      store.clear(); // cache quyền hết hiệu lực (production: bumpVersion khi rời nhóm)
      expect((await get(`/resources/${file.id}/url`, member)).status).toBe(404);
      expect((await get(`/assets/${file.assetId}/url`, member)).status).toBe(404);
    });
  });

  describe("Tạo tệp từ asset (RSC_003 / RSC_007) và idempotency", () => {
    it("asset của người khác / chưa READY / khác nhóm / đã gắn → 400 RSC_003", async () => {
      const { ws, member, other } = await setup();
      const foreign = await seedReadyAsset({ ownerId: other, workspaceId: ws });
      expect((await post(`/workspaces/${ws}/resources`, member, { assetId: foreign })).body.error.code).toBe("RSC_003");

      const pending = await seedReadyAsset({ ownerId: member, workspaceId: ws });
      await prisma.asset.update({ where: { id: pending }, data: { status: "PROCESSING" } });
      expect((await post(`/workspaces/${ws}/resources`, member, { assetId: pending })).body.error.code).toBe("RSC_003");

      const wsOther = await seedWorkspace(member);
      workspaceIds.push(wsOther);
      const wrongWs = await seedReadyAsset({ ownerId: member, workspaceId: wsOther });
      expect((await post(`/workspaces/${ws}/resources`, member, { assetId: wrongWs })).body.error.code).toBe("RSC_003");

      expect((await post(`/workspaces/${ws}/resources`, member, { assetId: newObjectId() })).body.error.code).toBe("RSC_003");

      const ok = await seedReadyAsset({ ownerId: member, workspaceId: ws });
      expect((await post(`/workspaces/${ws}/resources`, member, { assetId: ok })).status).toBe(201);
      const again = await post(`/workspaces/${ws}/resources`, member, { assetId: ok });
      expect(again.status).toBe(400);
      expect(again.body.error.code).toBe("RSC_003");
    });

    it("2 yêu cầu ĐỒNG THỜI cùng assetId → 1 × 201, 1 × 400 RSC_003; dung lượng chỉ cộng MỘT lần", async () => {
      const { ws, member } = await setup();
      const assetId = await seedReadyAsset({ ownerId: member, workspaceId: ws, size: 4000 });
      const [a, b] = await Promise.all([
        post(`/workspaces/${ws}/resources`, member, { assetId }),
        post(`/workspaces/${ws}/resources`, member, { assetId }),
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 400]);
      expect(await prisma.resource.count({ where: { assetId } })).toBe(1);
      expect((await prisma.workspace.findUnique({ where: { id: ws } }))?.storageUsedBytes).toBe(4000);
    });

    it("vượt hạn mức khi tạo tệp → 413 RSC_007; đúng hạn mức thì được", async () => {
      const { ws, member } = await setup();
      await prisma.workspace.update({ where: { id: ws }, data: { storageUsedBytes: 2 * GiB - 1500 } });
      const big = await seedReadyAsset({ ownerId: member, workspaceId: ws, size: 2000 });
      const res = await post(`/workspaces/${ws}/resources`, member, { assetId: big });
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe("RSC_007");
      expect(await prisma.resource.count({ where: { workspaceId: ws } })).toBe(0);
      const fits = await seedReadyAsset({ ownerId: member, workspaceId: ws, size: 1500 });
      expect((await post(`/workspaces/${ws}/resources`, member, { assetId: fits })).status).toBe(201);
    });

    it("Idempotency-Key: gửi lại cùng khoá trả nguyên phản hồi cũ, không lỗi RSC_003", async () => {
      const { ws, member } = await setup();
      const assetId = await seedReadyAsset({ ownerId: member, workspaceId: ws });
      const send = () =>
        request(app).post(`/api/v1/workspaces/${ws}/resources`).set(as(member)).set("Idempotency-Key", "idem-key-12345").send({ assetId });
      const first = await send();
      const second = await send();
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.headers["idempotent-replayed"]).toBe("true");
      expect(second.body.data.id).toBe(first.body.data.id);
    });

    it("suy `type`/`language` ở server: .ts + text/plain → CODE typescript; .txt → TEXT; docx → DOC/NONE; csv → SHEET/NATIVE", async () => {
      const { ws, member } = await setup();
      const ts = await mkResource(ws, member, { name: "main.ts", mime: "text/plain" });
      const txt = await mkResource(ws, member, { name: "ghi-chu.txt", mime: "text/plain" });
      const docx = await mkResource(ws, member, {
        name: "de.docx",
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const csv = await mkResource(ws, member, { name: "diem.csv", mime: "text/csv" });
      const fetched = async (id: string) => (await get(`/resources/${id}`, member)).body.data;
      expect(await fetched(ts.id)).toMatchObject({ type: "CODE", language: "typescript", previewStatus: "NATIVE", extension: "ts" });
      expect(await fetched(txt.id)).toMatchObject({ type: "TEXT", language: null });
      expect(await fetched(docx.id)).toMatchObject({ type: "DOC", previewStatus: "NONE" });
      expect(await fetched(csv.id)).toMatchObject({ type: "SHEET", previewStatus: "NATIVE" });
      // RSC_005: Office chưa có bản xem trước (P1) — nhưng vẫn tải/`original` được.
      const preview = await get(`/resources/${docx.id}/url?variant=preview`, member);
      expect(preview.status).toBe(409);
      expect(preview.body.error).toMatchObject({ code: "RSC_005", details: { convertible: true } });
      expect((await get(`/resources/${docx.id}/url?variant=download`, member)).body.data).toMatchObject({ disposition: "attachment" });
      expect((await get(`/resources/${ts.id}/url?variant=preview`, member)).body.data).toMatchObject({ disposition: "inline", mime: "text/plain" });
    });
  });

  describe("Danh sách: cursor, lọc, tìm không dấu, cache theo phiên bản", () => {
    it("phân trang cursor không lặp/không sót; sort name/size; cursor sai cách sắp → 400", async () => {
      const { ws, member } = await setup();
      const names = ["e.pdf", "b.pdf", "d.pdf", "a.pdf", "c.pdf"];
      for (const [i, name] of names.entries()) await mkResource(ws, member, { name, size: 100 * (i + 1) });

      const seen: string[] = [];
      let cursor: string | undefined;
      let firstCursor: string | undefined;
      for (let page = 0; page < 5; page += 1) {
        const res = await get(`/workspaces/${ws}/resources?limit=2&sort=name&order=asc${cursor ? `&cursor=${cursor}` : ""}`, member);
        expect(res.status).toBe(200);
        seen.push(...res.body.data.map((r: { name: string }) => r.name));
        cursor = res.body.meta.nextCursor ?? undefined;
        firstCursor ??= cursor;
        if (!res.body.meta.hasMore) break;
      }
      expect(seen).toEqual(["a.pdf", "b.pdf", "c.pdf", "d.pdf", "e.pdf"]);

      const bySize = await get(`/workspaces/${ws}/resources?sort=size&order=desc&limit=3`, member);
      expect(bySize.body.data.map((r: { size: number }) => r.size)).toEqual([500, 400, 300]);
      const wrongSort = await get(`/workspaces/${ws}/resources?sort=size&limit=2&cursor=${firstCursor}`, member); // cursor của sort=name dùng cho sort=size
      expect(wrongSort.status).toBe(400);
      expect((await get(`/workspaces/${ws}/resources?cursor=@@@`, member)).status).toBe(400);
    });

    it("lọc `type`; tìm `q` không dấu/hoa-thường trải mọi thư mục; ký tự đặc biệt khớp LITERAL", async () => {
      const { ws, member } = await setup();
      const folder = await mkFolder(ws, member, "Học kỳ");
      await mkResource(ws, member, { name: "Bài Giảng Xác Suất.pdf" });
      await mkResource(ws, member, { name: "bai-tap.png", mime: "image/png", folderId: folder.id });
      await mkResource(ws, member, { name: "a.b.txt", mime: "text/plain" });
      await mkResource(ws, member, { name: "aXb.txt", mime: "text/plain" });

      const byType = await get(`/workspaces/${ws}/resources?type=IMAGE`, member);
      expect(byType.body.data).toHaveLength(0); // ảnh nằm trong thư mục, mặc định liệt kê gốc
      const inFolder = await get(`/workspaces/${ws}/resources?folderId=${folder.id}&type=IMAGE`, member);
      expect(inFolder.body.data.map((r: { name: string }) => r.name)).toEqual(["bai-tap.png"]);

      const search = await get(`/workspaces/${ws}/resources?q=${encodeURIComponent("bai giang xac")}`, member);
      expect(search.body.data.map((r: { name: string }) => r.name)).toEqual(["Bài Giảng Xác Suất.pdf"]);
      const crossFolder = await get(`/workspaces/${ws}/resources?q=bai`, member);
      expect(crossFolder.body.data).toHaveLength(2); // gốc + trong thư mục
      // p3-01 app.md §9: kết quả tìm kèm đường dẫn chữ (gốc kho = ""); liệt kê theo thư mục thì không có.
      const pathByName = Object.fromEntries(crossFolder.body.data.map((r: { name: string; folderPath?: string }) => [r.name, r.folderPath]));
      expect(pathByName).toEqual({ "Bài Giảng Xác Suất.pdf": "", "bai-tap.png": "Học kỳ" });
      expect("folderPath" in inFolder.body.data[0]).toBe(false);
      const literal = await get(`/workspaces/${ws}/resources?q=${encodeURIComponent("a.b")}`, member);
      expect(literal.body.data.map((r: { name: string }) => r.name)).toEqual(["a.b.txt"]);
      expect((await get(`/workspaces/${ws}/resources?q=a`, member)).status).toBe(400); // q ≥ 2 ký tự
      expect((await get(`/workspaces/${ws}/resources?folderId=${newObjectId()}`, member)).status).toBe(404);
    });

    it("cache trang đầu theo phiên bản workspace: ghi → trang đầu phản ánh NGAY; phiên bản tăng", async () => {
      const { ws, member } = await setup();
      await mkResource(ws, member, { name: "cu.pdf" });
      const first = await get(`/workspaces/${ws}/resources`, member);
      expect(first.body.data).toHaveLength(1);
      const versionBefore = store.strings.get(`rsc:ver:${ws}`);
      expect([...store.strings.keys()].some((k) => k.startsWith(`rsc:list:${ws}:`))).toBe(true);

      const fresh = await mkResource(ws, member, { name: "moi.pdf" });
      expect(store.strings.get(`rsc:ver:${ws}`) as number).toBeGreaterThan(versionBefore as number);
      const second = await get(`/workspaces/${ws}/resources`, member);
      expect(second.body.data.map((r: { id: string }) => r.id)).toContain(fresh.id);

      await del(`/resources/${fresh.id}`, member);
      const third = await get(`/workspaces/${ws}/resources`, member);
      expect(third.body.data.map((r: { id: string }) => r.id)).not.toContain(fresh.id);
    });

    it("sửa tệp: đổi tên tính lại type/language, chuyển thư mục, RES_003 khi lệch phiên bản, thư mục đích đã xoá → 404", async () => {
      const { ws, member, admin } = await setup();
      const folder = await mkFolder(ws, member, "Đích");
      const file = await mkResource(ws, member, { name: "x.txt", mime: "text/plain" });
      const res = await patch(`/resources/${file.id}`, member, {
        name: "x.py",
        description: "mô tả",
        tags: ["ôn thi"],
        folderId: folder.id,
        expectedVersion: file.version,
      });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ name: "x.py", type: "CODE", language: "python", folderId: folder.id, version: 2 });
      expect((await patch(`/resources/${file.id}`, member, { name: "y.py", expectedVersion: 1 })).body.error.code).toBe("RES_003");
      // ADMIN sửa tệp của người khác được; đưa về gốc bằng null.
      const toRoot = await patch(`/resources/${file.id}`, admin, { folderId: null, expectedVersion: 2 });
      expect(toRoot.status).toBe(200);
      expect(toRoot.body.data.folderId).toBeNull();

      await del(`/folders/${folder.id}`, member);
      expect((await patch(`/resources/${file.id}`, member, { folderId: folder.id, expectedVersion: 3 })).status).toBe(404);
    });

    it("khôi phục tệp về gốc khi thư mục cũ đã bị xoá", async () => {
      const { ws, member } = await setup();
      const folder = await mkFolder(ws, member, "Tạm");
      const file = await mkResource(ws, member, { folderId: folder.id });
      await del(`/resources/${file.id}`, member);
      await del(`/folders/${folder.id}`, member);
      const restored = await post(`/resources/${file.id}/restore`, member);
      expect(restored.status).toBe(200);
      expect(restored.body.data.folderId).toBeNull();
      expect((await post(`/resources/${file.id}/restore`, member)).status).toBe(404); // không còn trong thùng rác
    });
  });

  describe("outbox `resource.*`", () => {
    it("tạo/sửa/xoá ghi OutboxEvent (queue notifications, jobName resource.events) không chứa tên tệp", async () => {
      const { ws, member } = await setup();
      const file = await mkResource(ws, member, { name: "bi-mat.pdf" });
      await patch(`/resources/${file.id}`, member, { description: "x", expectedVersion: 1 });
      await del(`/resources/${file.id}`, member);
      const events = await prisma.outboxEvent.findMany({ where: { aggregateId: file.id }, orderBy: { createdAt: "asc" } });
      expect(events.map((e) => e.type)).toEqual(["resource.created", "resource.updated", "resource.deleted"]);
      expect(new Set(events.map((e) => e.dedupeKey)).size).toBe(3);
      for (const e of events) {
        expect(e).toMatchObject({ queue: "notifications", jobName: "resource.events" });
        expect(JSON.stringify(e.payload)).not.toContain("bi-mat");
      }
    });
  });
});
