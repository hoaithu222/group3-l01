/**
 * Integration — AST-11 (Local storage dev: cùng API `PUT /content`, gateway
 * kiểm quyền qua chữ ký) + `ASSET_009` (chữ ký hết hạn/giả mạo). Dùng
 * `LocalStorage` THẬT (không mock — `STORAGE_TYPE=local` là default của
 * env.schema) ghi/đọc file tạm dưới `uploads/`, dọn sạch sau mỗi test.
 * Mongo thật qua `TEST_DB=memory`; `outboxSignal()` mock như các test khác
 * (Redis không cần thiết cho luồng này).
 */
jest.mock("../../../../infrastructure/queue/outbox/outbox.writer", () => {
  const actual = jest.requireActual("../../../../infrastructure/queue/outbox/outbox.writer");
  return { ...actual, outboxSignal: jest.fn().mockResolvedValue(undefined) };
});

import sharp from "sharp";
import { prisma } from "../../../../infrastructure/database";
import { storage, LocalStorage } from "../../../../infrastructure/storage";
import { env } from "../../../../core/config";
import { AssetService } from "../../services/asset.service";
import { AssetAccessService } from "../../services/asset-access.service";
import { AssetProcessor } from "../../services/asset-processor";
import { PrismaAssetRepository } from "../../repositories/asset.repository.prisma";
import { PrismaAssetLinkRepository } from "../../repositories/asset-link.repository.prisma";
import { newObjectId } from "../../../../core/utils/object-id";

function multerFile(buffer: Buffer, mimetype: string, originalname: string): Express.Multer.File {
  return {
    buffer,
    mimetype,
    originalname,
    size: buffer.length,
    fieldname: "file",
    encoding: "7bit",
  } as Express.Multer.File;
}

describe("Local storage gateway (integration — Mongo memory replset + disk thật)", () => {
  const repo = new PrismaAssetRepository();
  const linkRepo = new PrismaAssetLinkRepository();
  const access = new AssetAccessService(linkRepo);
  const processor = new AssetProcessor(repo);
  const service = new AssetService(repo, linkRepo, access, processor);
  const ownerId = newObjectId();
  const createdKeys: string[] = [];

  beforeAll(() => {
    expect(env.STORAGE_TYPE).toBe("local");
  });

  afterEach(async () => {
    await storage.deleteMany(createdKeys).catch(() => undefined);
    createdKeys.length = 0;
    await prisma.asset.deleteMany({ where: { ownerId } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateType: "Asset" } });
  });

  it("AST-11: uploadContent() ghi thật lên disk, getUrl()/download gateway đọc lại đúng nội dung", async () => {
    const pngBuffer = await sharp({
      create: { width: 20, height: 16, channels: 3, background: { r: 5, g: 6, b: 7 } },
    })
      .png()
      .toBuffer();

    const { asset, upload } = await service.create(ownerId, {
      scope: "RESOURCE",
      kind: "IMAGE",
      fileName: "a.png",
      size: pngBuffer.length,
      mime: "image/png",
    });
    expect(upload.method).toBe("API_PUT");
    createdKeys.push((await repo.findById(asset.id))!.storageKey);

    const completed = await service.uploadContent(asset.id, ownerId, multerFile(pngBuffer, "image/png", "a.png"));
    expect(completed.status).toBe("READY");
    expect(completed.hasThumb).toBe(true);

    const full = await repo.findById(asset.id);
    if (full?.thumbnailAssetId) {
      const thumb = await repo.findById(full.thumbnailAssetId);
      if (thumb) createdKeys.push(thumb.storageKey);
    }

    const { url } = await service.getUrl(asset.id, { id: ownerId, email: "o@example.com" }, {
      variant: "ORIGINAL",
      disposition: "inline",
    });
    const parsed = new URL(url, "http://localhost");
    const exp = Number(parsed.searchParams.get("exp"));
    const sig = parsed.searchParams.get("sig")!;

    const resolved = await service.verifyLocalDownload(asset.id, "ORIGINAL", exp, sig);
    expect(resolved.storageKey).toBe(full!.storageKey);

    const localStorage = new LocalStorage();
    const onDisk: Buffer = await localStorage.readFile(resolved.storageKey);
    expect(Buffer.compare(onDisk, pngBuffer)).toBe(0);
  });

  it("ASSET_009 khi liên kết đã hết hạn (exp trong quá khứ)", async () => {
    const asset = await repo.create({
      id: newObjectId(),
      ownerId,
      scope: "RESOURCE",
      kind: "IMAGE",
      uploadMethod: "API_PUT",
      mime: "image/png",
      declaredSize: 10,
      originalName: "a.png",
      storageKey: `resource/${ownerId}/${newObjectId()}.png`,
      status: "READY",
    });
    createdKeys.push(asset.storageKey);

    const expiredExp = Math.floor(Date.now() / 1000) - 10;
    await expect(service.verifyLocalDownload(asset.id, "ORIGINAL", expiredExp, "bogus")).rejects.toMatchObject({
      statusCode: 403,
      errorCode: "ASSET_009",
    });
  });

  it("ASSET_009 khi chữ ký bị giả mạo (exp hợp lệ nhưng sig sai)", async () => {
    const asset = await repo.create({
      id: newObjectId(),
      ownerId,
      scope: "RESOURCE",
      kind: "IMAGE",
      uploadMethod: "API_PUT",
      mime: "image/png",
      declaredSize: 10,
      originalName: "a.png",
      storageKey: `resource/${ownerId}/${newObjectId()}.png`,
      status: "READY",
    });
    createdKeys.push(asset.storageKey);

    const validExp = Math.floor(Date.now() / 1000) + 60;
    await expect(
      service.verifyLocalDownload(asset.id, "ORIGINAL", validExp, "0".repeat(64))
    ).rejects.toMatchObject({ statusCode: 403, errorCode: "ASSET_009" });
  });
});
