/**
 * Unit — `DisplayImageService.resolve` (`GET /assets/:id/image`, ảnh hiển thị ký sẵn KHÔNG cần Bearer): chữ ký/hạn → 403 ASSET_009;
 * chỉ asset GỐC kiểu ảnh READY đang gắn đích `DISPLAY_IMAGE_TARGETS` (còn lại 404 trung tính); THUMB lùi bản gốc; Local trả byte,
 * S3/Cloudinary chuyển hướng URL storage TTL 3600 s. Repo in-memory + `storage.getSignedUrl` giả.
 */
const mockGetSignedUrl = jest.fn();
jest.mock("../../../infrastructure/storage", () => ({
  storage: { getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args) },
  LocalStorage: jest.fn(),
}));

import { env } from "../../../core/config";
import { ErrorCode } from "../../../core/utils/error.codes";
import { newObjectId } from "../../../core/utils/object-id";
import { displayImageUrl } from "../../../shared/media";
import { DisplayImageService } from "../services/display-image.service";
import { InMemoryAssetRepository } from "../repositories/asset.repository.inmemory";
import { InMemoryAssetLinkRepository } from "../repositories/asset-link.repository.inmemory";
import { DISPLAY_IMAGE_TARGETS, type AssetCreateInput, type AssetLinkTargetType } from "../entities/asset.interface";
import type { DisplayImageQuery } from "../dtos/asset-url.dto";

const OWNER = "65f00000000000000000aa01";
/** Đầu một ngày (giây) + 1 giờ — URL ký lúc này còn hạn (1 ngày, 2 ngày]. */
const NOW_MS = (20_000 * 86_400 + 3_600) * 1000;
const NOW_S = NOW_MS / 1000;

function signedQuery(assetId: string, v: DisplayImageQuery["v"] = "THUMB", nowMs = NOW_MS): DisplayImageQuery {
  const url = new URL(displayImageUrl(assetId, v, nowMs) ?? "");
  return { v, e: Number(url.searchParams.get("e")), s: url.searchParams.get("s") ?? "" };
}

describe("DisplayImageService.resolve", () => {
  let repo: InMemoryAssetRepository;
  let service: DisplayImageService;
  const originalStorageType = env.STORAGE_TYPE;

  beforeEach(() => {
    InMemoryAssetRepository.clearStore();
    InMemoryAssetLinkRepository.clearStore();
    repo = new InMemoryAssetRepository();
    service = new DisplayImageService(repo, new InMemoryAssetLinkRepository());
    mockGetSignedUrl.mockReset().mockResolvedValue("https://bucket.example.test/avatar.webp?X-Amz-Signature=abc");
    env.STORAGE_TYPE = "local";
  });
  afterEach(() => {
    env.STORAGE_TYPE = originalStorageType;
  });

  async function createAsset(over: Partial<AssetCreateInput> = {}): Promise<string> {
    const id = newObjectId();
    await repo.create({
      id,
      ownerId: OWNER,
      scope: "AVATAR",
      kind: "IMAGE",
      uploadMethod: "API_PUT",
      mime: "image/png",
      declaredSize: 1024,
      originalName: "a.png",
      storageKey: `test/avatar/${id}/original.png`,
      status: "READY",
      ...over,
    });
    return id;
  }

  function link(assetId: string, targetType: AssetLinkTargetType = "USER_AVATAR"): void {
    InMemoryAssetLinkRepository.seed({ assetId, targetType, targetId: OWNER, scopeType: "USER", scopeId: OWNER, createdBy: OWNER });
  }

  /** Ảnh gốc gắn USER_AVATAR + (tuỳ chọn) thumbnail webp. */
  async function avatarWithThumb(thumbStatus: "READY" | "PROCESSING" | null): Promise<{ parent: string; thumb: string | null }> {
    const parent = await createAsset();
    link(parent);
    if (thumbStatus === null) return { parent, thumb: null };
    const thumb = await createAsset({
      variant: "THUMB",
      parentAssetId: parent,
      mime: "image/webp",
      storageKey: `test/avatar/${parent}/thumb.webp`,
      status: thumbStatus,
    });
    await repo.update(parent, { thumbnailAssetId: thumb });
    return { parent, thumb };
  }

  describe("chữ ký / hạn → 403 ASSET_009 (không chạm repo)", () => {
    it("chữ ký sai, chữ ký của asset khác, exp bị sửa", async () => {
      const id = await createAsset();
      link(id);
      const spy = jest.spyOn(repo, "findById");
      const good = signedQuery(id);
      const other = signedQuery(await createAsset());
      for (const query of [
        { ...good, s: "0".repeat(64) },
        { ...good, s: other.s },
        { ...good, e: good.e + 86_400 },
      ]) {
        await expect(service.resolve(id, query, NOW_MS)).rejects.toMatchObject({ statusCode: 403, errorCode: ErrorCode.ASSET_009 });
      }
      expect(spy).not.toHaveBeenCalled();
    });

    it("URL đã hết hạn (now ≥ e) → 403 dù chữ ký đúng", async () => {
      const id = await createAsset();
      link(id);
      const query = signedQuery(id);
      await expect(service.resolve(id, query, query.e * 1000)).rejects.toMatchObject({ statusCode: 403, errorCode: ErrorCode.ASSET_009 });
    });
  });

  describe("404 trung tính khi asset không phải ảnh hiển thị hợp lệ", () => {
    it("không tồn tại", async () => {
      const ghost = newObjectId();
      await expect(service.resolve(ghost, signedQuery(ghost), NOW_MS)).rejects.toMatchObject({ statusCode: 404 });
    });

    it("chưa READY / đã xoá / bị từ chối", async () => {
      for (const status of ["UPLOADING", "PROCESSING", "DELETED", "REJECTED"] as const) {
        const id = await createAsset({ status });
        link(id);
        await expect(service.resolve(id, signedQuery(id), NOW_MS)).rejects.toMatchObject({ statusCode: 404 });
      }
    });

    it("asset CON (thumbnail) ký trực tiếp → 404 (chỉ ký asset gốc)", async () => {
      const { thumb } = await avatarWithThumb("READY");
      if (!thumb) throw new Error("thiếu thumbnail");
      link(thumb);
      await expect(service.resolve(thumb, signedQuery(thumb), NOW_MS)).rejects.toMatchObject({ statusCode: 404 });
    });

    it("không phải kind IMAGE → 404", async () => {
      const id = await createAsset({ kind: "FILE", mime: "application/pdf", scope: "MESSAGE" });
      link(id);
      await expect(service.resolve(id, signedQuery(id, "ORIGINAL"), NOW_MS)).rejects.toMatchObject({ statusCode: 404 });
    });

    it("không gắn đích hiển thị (chỉ MESSAGE/TASK/RESOURCE) hoặc không gắn gì → 404 dù chữ ký đúng", async () => {
      const lonely = await createAsset();
      await expect(service.resolve(lonely, signedQuery(lonely), NOW_MS)).rejects.toMatchObject({ statusCode: 404 });

      const privateImage = await createAsset({ scope: "MESSAGE" });
      for (const target of ["MESSAGE", "TASK", "RESOURCE"] as const) link(privateImage, target);
      await expect(service.resolve(privateImage, signedQuery(privateImage, "ORIGINAL"), NOW_MS)).rejects.toMatchObject({ statusCode: 404 });
    });

    it("mime của bản phục vụ không phải image/* → 404 (không phục vụ thứ khác dưới Content-Type của nó)", async () => {
      const id = await createAsset({ mime: "text/html" });
      link(id);
      await expect(service.resolve(id, signedQuery(id, "ORIGINAL"), NOW_MS)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe("biến thể + storage", () => {
    it("mọi đích DISPLAY_IMAGE_TARGETS đều phục vụ được", async () => {
      for (const target of DISPLAY_IMAGE_TARGETS) {
        const id = await createAsset();
        link(id, target);
        await expect(service.resolve(id, signedQuery(id, "ORIGINAL"), NOW_MS)).resolves.toMatchObject({ kind: "file", storageKey: `test/avatar/${id}/original.png` });
      }
    });

    it("Local + THUMB có thumbnail READY → trả byte bản thumbnail; maxAge = số giây còn lại của URL", async () => {
      const { parent } = await avatarWithThumb("READY");
      const query = signedQuery(parent, "THUMB");
      const result = await service.resolve(parent, query, NOW_MS);
      expect(result).toEqual({ kind: "file", storageKey: `test/avatar/${parent}/thumb.webp`, mime: "image/webp", maxAgeSeconds: query.e - NOW_S });
      expect(result.maxAgeSeconds).toBeGreaterThan(86_400);
      expect(mockGetSignedUrl).not.toHaveBeenCalled();
    });

    it("THUMB lùi về bản gốc khi chưa có thumbnail / thumbnail chưa READY / bản ghi thumbnail mất", async () => {
      const none = await avatarWithThumb(null);
      const processing = await avatarWithThumb("PROCESSING");
      const dangling = await createAsset();
      link(dangling);
      await repo.update(dangling, { thumbnailAssetId: newObjectId() });

      for (const parent of [none.parent, processing.parent, dangling]) {
        await expect(service.resolve(parent, signedQuery(parent, "THUMB"), NOW_MS)).resolves.toMatchObject({
          kind: "file",
          storageKey: `test/avatar/${parent}/original.png`,
          mime: "image/png",
        });
      }
    });

    it("ORIGINAL luôn là bản gốc dù có thumbnail", async () => {
      const { parent } = await avatarWithThumb("READY");
      await expect(service.resolve(parent, signedQuery(parent, "ORIGINAL"), NOW_MS)).resolves.toMatchObject({
        storageKey: `test/avatar/${parent}/original.png`,
      });
    });

    it("S3 → redirect tới storage.getSignedUrl(key, 3600); maxAge = min(3000, còn lại)", async () => {
      env.STORAGE_TYPE = "s3";
      const { parent } = await avatarWithThumb("READY");
      const result = await service.resolve(parent, signedQuery(parent, "THUMB"), NOW_MS);
      expect(result).toEqual({ kind: "redirect", url: "https://bucket.example.test/avatar.webp?X-Amz-Signature=abc", maxAgeSeconds: 3000 });
      expect(mockGetSignedUrl).toHaveBeenCalledWith(`test/avatar/${parent}/thumb.webp`, 3600);

      // Sát hạn URL: còn 100 s < 3000 → cache đúng 100 s (không vượt hạn URL ảnh).
      const query = signedQuery(parent, "ORIGINAL");
      const nearExpiry = await service.resolve(parent, query, (query.e - 100) * 1000);
      expect(nearExpiry).toMatchObject({ kind: "redirect", maxAgeSeconds: 100 });
      expect(mockGetSignedUrl).toHaveBeenLastCalledWith(`test/avatar/${parent}/original.png`, 3600);
    });

    it("Cloudinary cũng chuyển hướng như S3", async () => {
      env.STORAGE_TYPE = "cloudinary";
      const id = await createAsset();
      link(id, "WORKSPACE_COVER");
      await expect(service.resolve(id, signedQuery(id, "ORIGINAL"), NOW_MS)).resolves.toMatchObject({ kind: "redirect", maxAgeSeconds: 3000 });
    });
  });
});
