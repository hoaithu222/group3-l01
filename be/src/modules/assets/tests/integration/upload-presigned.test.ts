/**
 * Integration — dùng `MongoMemoryReplSet` thật (qua `TEST_DB=memory`,
 * `src/tests/global-setup.ts`) để kiểm `AssetService.complete()` (đường
 * ĐI QUA `finalize()` — bypass `IAssetRepository`, ghi thẳng
 * `prisma`/`withTransaction`/`outbox`, xem comment ở `asset.service.ts`).
 *
 * `storage` được MOCK (S3 giả) — be.md §10 cho phép "S3 giả bằng
 * aws-sdk-client-mock hoặc MinIO container CI"; ở đây mock trực tiếp
 * `IStorage` vì môi trường không có MinIO/Docker. Mục tiêu integration test
 * này là DB transaction + outbox + `asset.process` fast-path, không phải
 * re-test I/O storage (đã có ở `asset-processor.test.ts`/`local.storage`).
 *
 * `outboxSignal()` mock giống `anonymizer.test.ts` — publish qua ioredis
 * riêng, không phải hạ tầng của lượt này, tránh 1s chờ timeout mỗi test.
 */
jest.mock("../../../../infrastructure/queue/outbox/outbox.writer", () => {
  const actual = jest.requireActual("../../../../infrastructure/queue/outbox/outbox.writer");
  return { ...actual, outboxSignal: jest.fn().mockResolvedValue(undefined) };
});

const mockCreateUploadUrl = jest.fn();
const mockHead = jest.fn();
const mockReadRange = jest.fn();
const mockPutObject = jest.fn().mockResolvedValue({ key: "thumb-key", size: 10 });
const mockDeleteMany = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../../infrastructure/storage", () => ({
  storage: {
    createUploadUrl: (...args: unknown[]) => mockCreateUploadUrl(...args),
    head: (...args: unknown[]) => mockHead(...args),
    readRange: (...args: unknown[]) => mockReadRange(...args),
    putObject: (...args: unknown[]) => mockPutObject(...args),
    deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    getSignedUrl: jest.fn().mockResolvedValue("https://signed.example/x"),
  },
  buildKey: (nodeEnv: string, scope: string, assetId: string, variant: string, ext: string) =>
    `${nodeEnv}/${scope.toLowerCase()}/2026/01/${assetId}/${variant.toLowerCase()}.${ext}`,
  LocalStorage: jest.fn(),
}));

import sharp from "sharp";
import { prisma } from "../../../../infrastructure/database";
import { AssetService } from "../../services/asset.service";
import { AssetAccessService } from "../../services/asset-access.service";
import { AssetProcessor } from "../../services/asset-processor";
import { PrismaAssetRepository } from "../../repositories/asset.repository.prisma";
import { PrismaAssetLinkRepository } from "../../repositories/asset-link.repository.prisma";
import { newObjectId } from "../../../../core/utils/object-id";

describe("upload-presigned (integration — Mongo memory replset)", () => {
  const repo = new PrismaAssetRepository();
  const linkRepo = new PrismaAssetLinkRepository();
  const access = new AssetAccessService(linkRepo);
  const processor = new AssetProcessor(repo);
  const service = new AssetService(repo, linkRepo, access, processor);
  const ownerId = newObjectId();

  beforeEach(() => {
    // `resetMocks: true` (jest.config.ts) xoá implementation mặc định của
    // mọi `jest.fn()` TRƯỚC MỖI test, kể cả `.mockResolvedValue` gán lúc khai
    // báo ở module scope — phải gán lại đây, không chỉ trong `it()` cần custom.
    mockDeleteMany.mockResolvedValue(undefined);
    mockPutObject.mockResolvedValue({ key: "thumb-key", size: 10 });
  });

  afterEach(async () => {
    await prisma.asset.deleteMany({ where: { ownerId } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateType: "Asset" } });
  });

  it("AST-01: ảnh JPEG qua presigned PUT → complete → PROCESSING với outbox ghi bền + fast path → READY + thumbnail", async () => {
    mockCreateUploadUrl.mockResolvedValue({
      method: "PRESIGNED_PUT",
      url: "https://s3.example/bucket/key",
      headers: { "Content-Type": "image/jpeg" },
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    });
    const jpegBuffer = await sharp({
      create: { width: 60, height: 45, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toBuffer();
    mockHead.mockResolvedValue({ size: jpegBuffer.length });
    mockReadRange.mockResolvedValue(jpegBuffer);

    const { asset, upload } = await service.create(ownerId, {
      scope: "RESOURCE",
      kind: "IMAGE",
      fileName: "a.jpg",
      size: jpegBuffer.length,
      mime: "image/jpeg",
    });
    expect(asset.status).toBe("UPLOADING");
    expect(upload.method).toBe("PRESIGNED_PUT");

    const completed = await service.complete(asset.id, ownerId, { size: jpegBuffer.length });

    const events = await prisma.outboxEvent.findMany({
      where: { aggregateId: asset.id, type: "asset.process" },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.dedupeKey).toBe(`asset.process:asset:${asset.id}`);
    expect(events[0]?.queue).toBe("media");
    expect(events[0]?.jobName).toBe("asset.process");

    // Ảnh ≤ fastPathMaxBytes (2 MiB) — xử lý đồng bộ trong `complete()`, không cần chờ worker.
    expect(completed.status).toBe("READY");
    expect(completed.hasThumb).toBe(true);
    expect(completed.width).toBe(60);
    expect(completed.height).toBe(45);
  });

  it("AST-03: head() thật trả size vượt declaredSize → REJECTED + ASSET_002, xoá object gốc", async () => {
    mockCreateUploadUrl.mockResolvedValue({
      method: "PRESIGNED_PUT",
      url: "https://s3.example/bucket/key2",
      headers: {},
      expiresAt: new Date().toISOString(),
    });
    const { asset } = await service.create(ownerId, {
      scope: "RESOURCE",
      kind: "IMAGE",
      fileName: "big.jpg",
      size: 5_000_000,
      mime: "image/jpeg",
    });

    mockHead.mockResolvedValue({ size: 30_000_000 }); // vượt xa declaredSize (khai 5 MiB, PUT 30 MiB)
    await expect(
      service.complete(asset.id, ownerId, { size: 30_000_000 })
    ).rejects.toMatchObject({ statusCode: 413, errorCode: "ASSET_002" });

    const reloaded = await repo.findById(asset.id);
    expect(reloaded?.status).toBe("REJECTED");
    expect(mockDeleteMany).toHaveBeenCalledWith([reloaded?.storageKey]);

    const events = await prisma.outboxEvent.findMany({
      where: { aggregateId: asset.id, type: "asset.process" },
    });
    expect(events).toHaveLength(0); // chưa tới finalize() nên không có outbox
  });

  it("ASSET_007 khi complete() trước khi storage có object (head() trả null)", async () => {
    mockCreateUploadUrl.mockResolvedValue({
      method: "PRESIGNED_PUT",
      url: "https://s3.example/bucket/key3",
      headers: {},
      expiresAt: new Date().toISOString(),
    });
    const { asset } = await service.create(ownerId, {
      scope: "RESOURCE",
      kind: "IMAGE",
      fileName: "c.jpg",
      size: 1000,
      mime: "image/jpeg",
    });

    mockHead.mockResolvedValue(null);
    await expect(service.complete(asset.id, ownerId, { size: 1000 })).rejects.toMatchObject({
      statusCode: 409,
      errorCode: "ASSET_007",
    });
  });
});
