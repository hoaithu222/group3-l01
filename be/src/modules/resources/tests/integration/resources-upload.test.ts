/**
 * Integration — luồng tải lên vào kho tài liệu (p3-01 README §3/§8): `POST /assets` (scope RESOURCE) → PUT (storage giả) →
 * `complete` → `asset.process` (magic bytes THẬT, `file-type`/`sharp`) → `POST /workspaces/:id/resources`.
 *
 *  - ST-01: 3 tệp, 1 sai MIME thật (PNG đổi đuôi `.pdf`) → 2 READY + Resource; 1 REJECTED có lý do; danh sách/cache mới.
 *  - ST-15: vượt hạn mức khi XIN upload → `413 RSC_007` TRƯỚC khi cấp URL (`createUploadUrl` không được gọi).
 * Mongo memory replset + Redis giả có trạng thái; chỉ `storage` (S3) được giả lập — đúng cách `upload-presigned.test.ts` làm.
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

/** Kho object giả: `key → Buffer`. `head`/`readRange` đọc đúng thứ client "đã PUT" — không đoán trước nội dung. */
const mockObjects = new Map<string, Buffer>();
const mockCreateUploadUrl = jest.fn();
jest.mock("../../../../infrastructure/storage", () => ({
  storage: {
    createUploadUrl: (...args: unknown[]) => mockCreateUploadUrl(...args),
    head: (key: string) => Promise.resolve(mockObjects.has(key) ? { size: (mockObjects.get(key) as Buffer).length } : null),
    readRange: (key: string, start: number, end: number) =>
      Promise.resolve((mockObjects.get(key) as Buffer).subarray(start, end + 1)),
    putObject: (key: string, buffer: Buffer) => {
      mockObjects.set(key, buffer);
      return Promise.resolve({ key, size: buffer.length });
    },
    deleteMany: (keys: string[]) => {
      for (const k of keys) mockObjects.delete(k);
      return Promise.resolve();
    },
    getSignedUrl: (key: string) => Promise.resolve(`https://signed.example/${key}`),
  },
  buildKey: (nodeEnv: string, scope: string, assetId: string, variant: string, ext: string) =>
    `${nodeEnv}/${scope.toLowerCase()}/2026/01/${assetId}/${variant.toLowerCase()}.${ext}`,
  LocalStorage: jest.fn(),
}));

import sharp from "sharp";
import request from "supertest";
import { prisma } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { resetPermissionPorts } from "../../../../core/permission";
import { newObjectId } from "../../../../core/utils/object-id";
import { AssetProcessor } from "../../../assets/services/asset-processor";
import { PrismaAssetRepository } from "../../../assets/repositories/asset.repository.prisma";
import { makeRedisStore, wireRedisMocks } from "../support/redis-store";
import {
  addMember,
  buildApp,
  cleanupWorkspaces,
  ensureIndexes,
  registerWorkspaceResolver,
  seedUser,
  seedWorkspace,
  tokenFor,
} from "../support/fixtures";

const app = buildApp();
const store = makeRedisStore();
const GiB = 1024 * 1024 * 1024;

describe("Resource Hub — tải lên & hạn mức (integration)", () => {
  const workspaceIds: string[] = [];
  const userIds: string[] = [];
  const processor = new AssetProcessor(new PrismaAssetRepository());

  beforeAll(async () => {
    bindPermissionPorts();
    registerWorkspaceResolver();
    await ensureIndexes();
  });

  afterAll(() => resetPermissionPorts());

  beforeEach(() => {
    wireRedisMocks(redis as unknown as Record<string, jest.Mock>, store);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
    mockObjects.clear();
    mockCreateUploadUrl.mockReset().mockResolvedValue({
      method: "PRESIGNED_PUT",
      url: "https://s3.example/bucket/key",
      headers: {},
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    });
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
    const guest = await seedUser("Khách");
    userIds.push(owner, member, guest);
    const ws = await seedWorkspace(owner);
    workspaceIds.push(ws);
    await addMember(ws, member, "MEMBER");
    await addMember(ws, guest, "GUEST");
    return { ws, owner, member, guest };
  }

  const as = (userId: string) => ({ Authorization: `Bearer ${tokenFor(userId)}` });
  const api = {
    post: (path: string, userId: string, body?: object) =>
      request(app).post(`/api/v1${path}`).set(as(userId)).set("Idempotency-Key", `idem-${newObjectId()}`).send(body ?? {}),
    get: (path: string, userId: string) => request(app).get(`/api/v1${path}`).set(as(userId)),
  };

  /** Xin upload → "PUT" nội dung vào storage giả → complete → (worker) process. Trả `{ assetId, status, rejectReason }`. */
  async function uploadFile(
    ws: string,
    userId: string,
    file: { name: string; mime: string; kind: "FILE" | "IMAGE"; content: Buffer }
  ): Promise<{ assetId: string; status: string; rejectReason: string | null }> {
    const created = await api.post("/assets", userId, {
      scope: "RESOURCE",
      kind: file.kind,
      fileName: file.name,
      mime: file.mime,
      size: file.content.length,
      workspaceId: ws,
    });
    expect(created.status).toBe(201);
    const assetId = created.body.data.asset.id as string;
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: assetId } });
    mockObjects.set(asset.storageKey, file.content); // client PUT thẳng lên storage

    const completed = await api.post(`/assets/${assetId}/complete`, userId, { size: file.content.length });
    expect(completed.status).toBe(200);
    if (completed.body.data.status === "PROCESSING") await processor.process(assetId); // worker `asset.process`
    const done = await prisma.asset.findUniqueOrThrow({ where: { id: assetId } });
    return { assetId, status: done.status, rejectReason: done.rejectReason };
  }

  it("ST-01: 3 tệp, 1 sai MIME thật (PNG đổi đuôi .pdf) → 2 READY + Resource; 1 REJECTED có lý do; danh sách mới ngay", async () => {
    const { ws, member } = await setup();
    const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 10, b: 10 } } }).png().toBuffer();

    // Danh sách rỗng được cache trước — sau khi thêm tệp trang đầu phải phản ánh NGAY (phiên bản workspace tăng).
    expect((await api.get(`/workspaces/${ws}/resources`, member)).body.data).toHaveLength(0);

    const notes = await uploadFile(ws, member, {
      name: "ghi-chu.md",
      mime: "text/markdown",
      kind: "FILE",
      content: Buffer.from("# Xin chào\n\nNội dung **Markdown** tiếng Việt có dấu.\n", "utf8"),
    });
    const image = await uploadFile(ws, member, { name: "so-do.png", mime: "image/png", kind: "IMAGE", content: png });
    const fake = await uploadFile(ws, member, { name: "bai-giang.pdf", mime: "application/pdf", kind: "FILE", content: png });

    expect(notes.status).toBe("READY");
    expect(image.status).toBe("READY");
    expect(fake.status).toBe("REJECTED");
    expect(fake.rejectReason).toBe("Nội dung tệp không khớp loại khai báo");

    const r1 = await api.post(`/workspaces/${ws}/resources`, member, { assetId: notes.assetId });
    const r2 = await api.post(`/workspaces/${ws}/resources`, member, { assetId: image.assetId });
    const r3 = await api.post(`/workspaces/${ws}/resources`, member, { assetId: fake.assetId });
    expect(r1.status).toBe(201);
    expect(r1.body.data).toMatchObject({ name: "ghi-chu.md", type: "CODE", language: "markdown", mime: "text/markdown" });
    expect(r2.status).toBe(201);
    expect(r2.body.data).toMatchObject({ type: "IMAGE", previewStatus: "NATIVE" });
    expect(r2.body.data.thumbnailUrl).toMatch(/variant=THUMB/); // thumbnail do `asset.process` sinh, URL ký lúc trả lời (STORAGE_TYPE=local → gateway HMAC)
    expect(r3.status).toBe(400);
    expect(r3.body.error.code).toBe("RSC_003"); // asset REJECTED không thêm được vào kho

    const list = await api.get(`/workspaces/${ws}/resources?sort=name&order=asc`, member);
    expect(list.body.data.map((r: { name: string }) => r.name)).toEqual(["ghi-chu.md", "so-do.png"]);
    // Dung lượng = tổng size thật của 2 tệp READY.
    expect((await prisma.workspace.findUnique({ where: { id: ws } }))?.storageUsedBytes).toBe(
      Buffer.byteLength("# Xin chào\n\nNội dung **Markdown** tiếng Việt có dấu.\n") + png.length
    );
  });

  it("text giả (nhị phân có byte NUL / PNG khai text/plain) bị từ chối; JSON/CSV hợp lệ được nhận", async () => {
    const { ws, member } = await setup();
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#123456" } }).png().toBuffer();
    const nul = await uploadFile(ws, member, { name: "x.txt", mime: "text/plain", kind: "FILE", content: Buffer.from([0x68, 0x00, 0x69, 0xff, 0x00]) });
    const asText = await uploadFile(ws, member, { name: "anh.txt", mime: "text/plain", kind: "FILE", content: png });
    const json = await uploadFile(ws, member, { name: "cau-hinh.json", mime: "application/json", kind: "FILE", content: Buffer.from('{"a":1,"tên":"Việt"}') });
    const csv = await uploadFile(ws, member, { name: "diem.csv", mime: "text/csv", kind: "FILE", content: Buffer.from("ten,diem\nAn,9\n", "utf8") });
    expect([nul.status, asText.status, json.status, csv.status]).toEqual(["REJECTED", "REJECTED", "READY", "READY"]);
  });

  it("MIME ngoài allowlist scope RESOURCE (HTML, executable) và md/json ở scope khác → 400/415", async () => {
    const { ws, member } = await setup();
    const html = await api.post("/assets", member, { scope: "RESOURCE", kind: "FILE", fileName: "a.html", mime: "text/html", size: 100, workspaceId: ws });
    expect(html.status).toBe(400);
    const exe = await api.post("/assets", member, { scope: "RESOURCE", kind: "FILE", fileName: "a.exe", mime: "application/x-msdownload", size: 100, workspaceId: ws });
    expect(exe.status).toBe(400);
    // md/json chỉ được mở ở scope RESOURCE — scope MESSAGE vẫn theo allowlist chung.
    const otherScope = await api.post("/assets", member, { scope: "MESSAGE", kind: "FILE", fileName: "a.md", mime: "text/markdown", size: 100 });
    expect(otherScope.status).toBe(400);
  });

  describe("ST-15 — hạn mức khi xin upload", () => {
    it("vượt hạn mức → 413 RSC_007 TRƯỚC khi cấp URL upload", async () => {
      const { ws, member } = await setup();
      await prisma.workspace.update({ where: { id: ws }, data: { storageUsedBytes: 2 * GiB - 1000 } });
      const res = await api.post("/assets", member, { scope: "RESOURCE", kind: "FILE", fileName: "lon.pdf", mime: "application/pdf", size: 5000, workspaceId: ws });
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe("RSC_007");
      expect(mockCreateUploadUrl).not.toHaveBeenCalled();
      expect(await prisma.asset.count({ where: { workspaceId: ws } })).toBe(0);
    });

    it("giữ chỗ: 2 lượt xin song song mỗi lượt vừa nhưng cộng lại vượt → lượt sau 413; huỷ (abort) trả chỗ", async () => {
      const { ws, member } = await setup();
      await prisma.workspace.update({ where: { id: ws }, data: { storageUsedBytes: 2 * GiB - 3000 } });
      const ask = (size: number) =>
        api.post("/assets", member, { scope: "RESOURCE", kind: "FILE", fileName: "a.pdf", mime: "application/pdf", size, workspaceId: ws });

      const first = await ask(2000);
      expect(first.status).toBe(201);
      const second = await ask(2000); // 2000 (đang giữ chỗ) + 2000 > 3000 còn trống
      expect(second.status).toBe(413);
      expect(second.body.error.code).toBe("RSC_007");

      const abort = await api.post(`/assets/${first.body.data.asset.id}/abort`, member);
      expect(abort.status).toBe(200);
      expect((await ask(2000)).status).toBe(201); // chỗ đã trả
    });

    it("quyền tải lên: GUEST → 404, thiếu workspaceId → 400, workspace ARCHIVED → 403", async () => {
      const { ws, member, guest } = await setup();
      const body = { scope: "RESOURCE", kind: "FILE", fileName: "a.pdf", mime: "application/pdf", size: 100 };
      expect((await api.post("/assets", guest, { ...body, workspaceId: ws })).status).toBe(404);
      expect((await api.post("/assets", member, body)).status).toBe(400);
      await prisma.workspace.update({ where: { id: ws }, data: { status: "ARCHIVED" } });
      store.clear();
      expect((await api.post("/assets", member, { ...body, workspaceId: ws })).status).toBe(403);
    });
  });
});
