/**
 * Unit (HTTP) — `GET /api/v1/assets/:id/image` qua router thật (`assets.routes.ts`) + `errorHandler`: KHÔNG cần Authorization (đăng ký
 * trước `authenticateToken`), validate params/query → 400, header phục vụ ảnh (Content-Type/nosniff/CSP sandbox/`Cache-Control: private`),
 * 302 khi S3. Repo Prisma thay bằng bản in-memory; storage + `LocalStorage.readFile` giả (không đọc/ghi đĩa thật).
 */
const mockReadFile = jest.fn();
const mockGetSignedUrl = jest.fn();
jest.mock("../../../infrastructure/storage", () => ({
  storage: { getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args) },
  buildKey: () => "unused",
  // Class thường (không `jest.fn`) — `resetMocks: true` không xoá được implementation của nó giữa các test.
  LocalStorage: class {
    readFile(key: string): Promise<Buffer> {
      return mockReadFile(key) as Promise<Buffer>;
    }
  },
}));
jest.mock("../repositories", () => {
  const { InMemoryAssetRepository } = jest.requireActual("../repositories/asset.repository.inmemory");
  const { InMemoryAssetLinkRepository } = jest.requireActual("../repositories/asset-link.repository.inmemory");
  return { PrismaAssetRepository: InMemoryAssetRepository, PrismaAssetLinkRepository: InMemoryAssetLinkRepository };
});

import express from "express";
import request from "supertest";
import { env } from "../../../core/config";
import { errorHandler, notFoundHandler } from "../../../core/middlewares";
import { newObjectId } from "../../../core/utils/object-id";
import { displayImageUrl } from "../../../shared/media";
import { InMemoryAssetRepository } from "../repositories/asset.repository.inmemory";
import { InMemoryAssetLinkRepository } from "../repositories/asset-link.repository.inmemory";
import type { AssetLinkTargetType } from "../entities/asset.interface";
import assetsRoutes from "../assets.routes";

const OWNER = "65f00000000000000000bb01";
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

const app = express();
app.use(express.json());
app.use("/api/v1/assets", assetsRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

/** Đường dẫn + query của URL ký (bỏ origin `PUBLIC_API_URL`). */
function imagePath(assetId: string, variant: "THUMB" | "ORIGINAL" = "THUMB"): string {
  const url = new URL(displayImageUrl(assetId, variant) ?? "");
  return `${url.pathname}${url.search}`;
}

async function seedImage(target: AssetLinkTargetType | null = "USER_AVATAR", over: { mime?: string } = {}): Promise<string> {
  const id = newObjectId();
  await new InMemoryAssetRepository().create({
    id,
    ownerId: OWNER,
    scope: "AVATAR",
    kind: "IMAGE",
    uploadMethod: "API_PUT",
    mime: over.mime ?? "image/png",
    declaredSize: PNG_BYTES.length,
    originalName: "a.png",
    storageKey: `test/avatar/${id}/original.png`,
    status: "READY",
  });
  if (target) InMemoryAssetLinkRepository.seed({ assetId: id, targetType: target, targetId: OWNER, scopeType: "USER", scopeId: OWNER, createdBy: OWNER });
  return id;
}

describe("GET /api/v1/assets/:id/image (ảnh hiển thị ký sẵn, không Bearer)", () => {
  const originalStorageType = env.STORAGE_TYPE;

  beforeEach(() => {
    InMemoryAssetRepository.clearStore();
    InMemoryAssetLinkRepository.clearStore();
    mockReadFile.mockReset().mockResolvedValue(PNG_BYTES);
    mockGetSignedUrl.mockReset().mockResolvedValue("https://bucket.example.test/a.png?sig=1");
    env.STORAGE_TYPE = "local";
  });
  afterEach(() => {
    env.STORAGE_TYPE = originalStorageType;
  });

  it("KHÔNG gửi Authorization vẫn 200 (Local): trả byte ảnh + Content-Type/nosniff/CSP sandbox/inline + Cache-Control private", async () => {
    const id = await seedImage();

    const res = await request(app).get(imagePath(id, "ORIGINAL"));

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toBe("default-src 'none'; sandbox");
    expect(res.headers["content-disposition"]).toBe("inline");
    const maxAge = Number(/^private, max-age=(\d+)$/.exec(res.headers["cache-control"] ?? "")?.[1]);
    expect(maxAge).toBeGreaterThan(86_400); // còn hạn (1 ngày, 2 ngày]
    expect(maxAge).toBeLessThanOrEqual(2 * 86_400);
    expect(Buffer.isBuffer(res.body) && res.body.equals(PNG_BYTES)).toBe(true);
    expect(mockReadFile).toHaveBeenCalledWith(`test/avatar/${id}/original.png`);
  });

  it("các route asset khác vẫn cần Bearer (chỉ /image và gateway tải đứng trước authenticateToken)", async () => {
    const id = await seedImage();
    expect((await request(app).get(`/api/v1/assets/${id}`)).status).toBe(401);
    expect((await request(app).get(`/api/v1/assets/${id}/url`)).status).toBe(401);
  });

  it("S3 → 302 tới URL ký của storage, Cache-Control private, max-age=3000", async () => {
    env.STORAGE_TYPE = "s3";
    const id = await seedImage("WORKSPACE_COVER");

    const res = await request(app).get(imagePath(id)).redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://bucket.example.test/a.png?sig=1");
    expect(res.headers["cache-control"]).toBe("private, max-age=3000");
    expect(mockGetSignedUrl).toHaveBeenCalledWith(`test/avatar/${id}/original.png`, 3600);
  });

  it("query thiếu/sai → 400 VAL_001 (trước khi kiểm chữ ký)", async () => {
    const id = await seedImage();
    const good = new URL(`http://x${imagePath(id)}`).searchParams;
    const e = good.get("e") ?? "";
    const s = good.get("s") ?? "";
    const base = `/api/v1/assets/${id}/image`;
    for (const query of [
      "",
      `?e=${e}`,
      `?s=${s}`,
      `?e=abc&s=${s}`,
      `?e=-5&s=${s}`,
      `?e=1.5&s=${s}`,
      `?e=${e}&s=${s.slice(0, 63)}`,
      `?e=${e}&s=${"z".repeat(64)}`,
      `?v=POSTER&e=${e}&s=${s}`,
    ]) {
      const res = await request(app).get(`${base}${query}`);
      expect({ query, status: res.status, code: res.body?.error?.code }).toEqual({ query, status: 400, code: "VAL_001" });
    }
    const badId = await request(app).get(`/api/v1/assets/khong-phai-id/image?e=${e}&s=${s}`);
    expect(badId.status).toBe(400);
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("chữ ký sai → 403 ASSET_009 (không phải 401); asset không gắn đích hiển thị → 404", async () => {
    const id = await seedImage();
    const good = new URL(`http://x${imagePath(id)}`).searchParams;
    const forged = await request(app).get(`/api/v1/assets/${id}/image?e=${good.get("e") ?? ""}&s=${"a".repeat(64)}`);
    expect(forged.status).toBe(403);
    expect(forged.body.error.code).toBe("ASSET_009");

    const unlinked = await seedImage(null);
    expect((await request(app).get(imagePath(unlinked))).status).toBe(404);
    const messageOnly = await seedImage("MESSAGE");
    expect((await request(app).get(imagePath(messageOnly))).status).toBe(404);
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it("đọc tệp lỗi (tệp mất trên đĩa) → 500 KHÔNG mang Cache-Control max-age (không để client cache lỗi dưới URL ảnh)", async () => {
    const id = await seedImage();
    mockReadFile.mockRejectedValue(Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" }));

    const res = await request(app).get(imagePath(id));

    expect(res.status).toBe(500);
    expect(res.headers["cache-control"] ?? "").not.toMatch(/max-age/);
  });
});
