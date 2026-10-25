/**
 * Unit — chỉ các method KHÔNG chạm `finalize()` (bypass repo, đi thẳng
 * `withTransaction`/`outbox` — xem comment ở `asset.service.ts`). `complete()`/
 * `uploadContent()` được test bằng Mongo thật ở `tests/integration/upload-presigned.test.ts`.
 */
import { AssetService } from "../services/asset.service";
import { AssetAccessService } from "../services/asset-access.service";
import { AssetProcessor } from "../services/asset-processor";
import { InMemoryAssetRepository } from "../repositories/asset.repository.inmemory";
import { InMemoryAssetLinkRepository } from "../repositories/asset-link.repository.inmemory";
import { AppError, NotFoundError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import type { AuthUser } from "../../../core/types/express";
import { clearAssetScopeGates, registerAssetScopeGate } from "../../../shared/ports/asset-scope-gate.port";

const mockCreateUploadUrl = jest.fn();
const mockDeleteMany = jest.fn();
const mockGetSignedUrl = jest.fn();
const mockHead = jest.fn();
const mockPutObject = jest.fn();
const mockReadRange = jest.fn();

jest.mock("../../../infrastructure/storage", () => ({
  storage: {
    createUploadUrl: (...args: unknown[]) => mockCreateUploadUrl(...args),
    deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
    head: (...args: unknown[]) => mockHead(...args),
    putObject: (...args: unknown[]) => mockPutObject(...args),
    readRange: (...args: unknown[]) => mockReadRange(...args),
  },
  buildKey: (nodeEnv: string, scope: string, assetId: string, variant: string, ext: string) =>
    `${nodeEnv}/${scope.toLowerCase()}/2026/01/${assetId}/${variant.toLowerCase()}.${ext}`,
  LocalStorage: jest.fn(),
}));

const OWNER = "owner-1";
const OTHER = "someone-else";

function authUser(id: string): AuthUser {
  return { id, email: `${id}@example.com` };
}

describe("AssetService", () => {
  let service: AssetService;
  let repo: InMemoryAssetRepository;
  let linkRepo: InMemoryAssetLinkRepository;

  beforeEach(() => {
    InMemoryAssetRepository.clearStore();
    InMemoryAssetLinkRepository.clearStore();
    repo = new InMemoryAssetRepository();
    linkRepo = new InMemoryAssetLinkRepository();
    const access = new AssetAccessService(linkRepo);
    const processor = new AssetProcessor(repo);
    service = new AssetService(repo, linkRepo, access, processor);

    mockCreateUploadUrl.mockReset().mockResolvedValue({
      method: "API_PUT",
      url: "/api/v1/assets/x/content",
    });
    mockDeleteMany.mockReset().mockResolvedValue(undefined);
    mockGetSignedUrl.mockReset().mockResolvedValue("https://signed.example/x?exp=60");
    mockHead.mockReset();
    mockPutObject.mockReset();
    mockReadRange.mockReset();
  });

  describe("create()", () => {
    it("tạo asset UPLOADING khi mime/size hợp lệ với kind", async () => {
      const { asset, upload } = await service.create(OWNER, {
        scope: "RESOURCE",
        kind: "IMAGE",
        fileName: "photo.png",
        size: 1024,
        mime: "image/png",
      });
      expect(asset.status).toBe("UPLOADING");
      expect(asset.kind).toBe("IMAGE");
      expect(upload.method).toBe("API_PUT");
      expect(mockCreateUploadUrl).toHaveBeenCalledWith(
        expect.objectContaining({ contentType: "image/png", contentLength: 1024 })
      );
    });

    it("ném lỗi 415 ASSET_001 khi mime không hợp lệ cho kind", async () => {
      await expect(
        service.create(OWNER, {
          scope: "RESOURCE",
          kind: "IMAGE",
          fileName: "x.exe",
          size: 10,
          mime: "application/x-msdownload",
        })
      ).rejects.toMatchObject({ statusCode: 415, errorCode: ErrorCode.ASSET_001 });
    });

    it("ném lỗi 413 ASSET_002 khi vượt maxBytes của kind", async () => {
      await expect(
        service.create(OWNER, {
          scope: "RESOURCE",
          kind: "IMAGE",
          fileName: "big.png",
          size: 30 * 1024 * 1024,
          mime: "image/png",
        })
      ).rejects.toMatchObject({ statusCode: 413, errorCode: ErrorCode.ASSET_002 });
    });

    it("AVATAR vượt avatarMaxBytes (2 MiB) dù dưới maxBytes chung của IMAGE (20 MiB) → 413", async () => {
      await expect(
        service.create(OWNER, {
          scope: "AVATAR",
          kind: "IMAGE",
          fileName: "avt.png",
          size: 3 * 1024 * 1024,
          mime: "image/png",
        })
      ).rejects.toMatchObject({ statusCode: 413, errorCode: ErrorCode.ASSET_002 });
    });

    it("AVATAR + kind khác IMAGE → 415 ASSET_001", async () => {
      await expect(
        service.create(OWNER, {
          scope: "AVATAR",
          kind: "VIDEO",
          fileName: "avt.mp4",
          size: 1024,
          mime: "video/mp4",
        })
      ).rejects.toMatchObject({ statusCode: 415, errorCode: ErrorCode.ASSET_001 });
    });
  });

  describe("reissueUploadUrl()", () => {
    it("cấp URL mới cho asset UPLOADING của chủ", async () => {
      const { asset } = await service.create(OWNER, {
        scope: "RESOURCE",
        kind: "IMAGE",
        fileName: "a.png",
        size: 10,
        mime: "image/png",
      });
      mockCreateUploadUrl.mockResolvedValueOnce({ method: "API_PUT", url: "/new-url" });
      const upload = await service.reissueUploadUrl(asset.id, OWNER);
      expect(upload.url).toBe("/new-url");
    });

    it("không phải chủ → 403 ASSET_004", async () => {
      const { asset } = await service.create(OWNER, {
        scope: "RESOURCE",
        kind: "IMAGE",
        fileName: "a.png",
        size: 10,
        mime: "image/png",
      });
      await expect(service.reissueUploadUrl(asset.id, OTHER)).rejects.toMatchObject({
        statusCode: 403,
        errorCode: ErrorCode.ASSET_004,
      });
    });
  });

  describe("abort()", () => {
    it("huỷ asset UPLOADING → DELETED + xoá storage key", async () => {
      const { asset } = await service.create(OWNER, {
        scope: "RESOURCE",
        kind: "IMAGE",
        fileName: "a.png",
        size: 10,
        mime: "image/png",
      });
      await service.abort(asset.id, OWNER);
      const reloaded = await repo.findById(asset.id);
      expect(reloaded?.status).toBe("DELETED");
      expect(mockDeleteMany).toHaveBeenCalled();
    });

    it("asset không còn UPLOADING → 403 ASSET_004", async () => {
      const { asset } = await service.create(OWNER, {
        scope: "RESOURCE",
        kind: "IMAGE",
        fileName: "a.png",
        size: 10,
        mime: "image/png",
      });
      await repo.update(asset.id, { status: "READY" });
      await expect(service.abort(asset.id, OWNER)).rejects.toMatchObject({
        statusCode: 403,
        errorCode: ErrorCode.ASSET_004,
      });
    });
  });

  describe("getById() / quyền đọc", () => {
    it("chủ đọc được asset chưa gắn link", async () => {
      const { asset } = await service.create(OWNER, {
        scope: "RESOURCE",
        kind: "IMAGE",
        fileName: "a.png",
        size: 10,
        mime: "image/png",
      });
      const dto = await service.getById(asset.id, authUser(OWNER));
      expect(dto.id).toBe(asset.id);
    });

    it("người khác không đọc được asset chưa gắn link → PERM_404", async () => {
      const { asset } = await service.create(OWNER, {
        scope: "RESOURCE",
        kind: "IMAGE",
        fileName: "a.png",
        size: 10,
        mime: "image/png",
      });
      await expect(service.getById(asset.id, authUser(OTHER))).rejects.toMatchObject({
        statusCode: 404,
        errorCode: ErrorCode.PERM_404,
      });
    });

    it("scopeType USER (avatar) — mọi user đăng nhập đọc được", async () => {
      const { asset } = await service.create(OWNER, {
        scope: "AVATAR",
        kind: "IMAGE",
        fileName: "avt.png",
        size: 10,
        mime: "image/png",
      });
      InMemoryAssetLinkRepository.seed({
        assetId: asset.id,
        targetType: "USER_AVATAR",
        targetId: OWNER,
        scopeType: "USER",
        scopeId: null,
        createdBy: OWNER,
      });
      const dto = await service.getById(asset.id, authUser(OTHER));
      expect(dto.id).toBe(asset.id);
    });

    it("asset DELETED → không ai đọc được kể cả chủ", async () => {
      const { asset } = await service.create(OWNER, {
        scope: "RESOURCE",
        kind: "IMAGE",
        fileName: "a.png",
        size: 10,
        mime: "image/png",
      });
      await repo.update(asset.id, { status: "DELETED" });
      await expect(service.getById(asset.id, authUser(OWNER))).rejects.toMatchObject({
        errorCode: ErrorCode.PERM_404,
      });
    });

    it("đã gắn link nhưng KHÔNG có resolver cho scope (WORKSPACE) → ném lỗi (fail-closed, không phải AppError nghiệp vụ)", async () => {
      const { asset } = await service.create(OWNER, {
        scope: "MESSAGE",
        kind: "IMAGE",
        fileName: "a.png",
        size: 10,
        mime: "image/png",
      });
      await repo.update(asset.id, { status: "READY" });
      InMemoryAssetLinkRepository.seed({
        assetId: asset.id,
        targetType: "MESSAGE",
        targetId: "msg-1",
        scopeType: "WORKSPACE",
        scopeId: "65f0000000000000000000aa",
        createdBy: OWNER,
      });
      // Không đăng ký resolver WORKSPACE ở Phase 0 — permissionService ném lỗi lập trình thô.
      await expect(service.getById(asset.id, authUser(OWNER))).rejects.toThrow();
    });
  });

  describe("getUrl()", () => {
    it("ASSET_003 khi asset chưa READY", async () => {
      const { asset } = await service.create(OWNER, {
        scope: "RESOURCE",
        kind: "IMAGE",
        fileName: "a.png",
        size: 10,
        mime: "image/png",
      });
      await expect(
        service.getUrl(asset.id, authUser(OWNER), { variant: "ORIGINAL", disposition: "inline" })
      ).rejects.toMatchObject({ errorCode: ErrorCode.ASSET_003 });
    });

    it("ASSET_008 khi xin variant THUMB nhưng chưa có thumbnail", async () => {
      const { asset } = await service.create(OWNER, {
        scope: "RESOURCE",
        kind: "IMAGE",
        fileName: "a.png",
        size: 10,
        mime: "image/png",
      });
      await repo.update(asset.id, { status: "READY" });
      await expect(
        service.getUrl(asset.id, authUser(OWNER), { variant: "THUMB", disposition: "inline" })
      ).rejects.toMatchObject({ errorCode: ErrorCode.ASSET_008 });
    });

    it("trả URL ORIGINAL khi READY", async () => {
      const { asset } = await service.create(OWNER, {
        scope: "RESOURCE",
        kind: "IMAGE",
        fileName: "a.png",
        size: 10,
        mime: "image/png",
      });
      await repo.update(asset.id, { status: "READY" });
      const result = await service.getUrl(asset.id, authUser(OWNER), {
        variant: "ORIGINAL",
        disposition: "inline",
      });
      expect(typeof result.url).toBe("string");
      expect(typeof result.expiresAt).toBe("string");
    });
  });

  describe("delete()", () => {
    it("xoá thành công khi chưa gắn link", async () => {
      const { asset } = await service.create(OWNER, {
        scope: "RESOURCE",
        kind: "IMAGE",
        fileName: "a.png",
        size: 10,
        mime: "image/png",
      });
      await expect(service.delete(asset.id, OWNER)).resolves.not.toThrow();
      const reloaded = await repo.findById(asset.id);
      expect(reloaded?.status).toBe("DELETED");
    });

    it("ném NotFoundError khi asset không tồn tại", async () => {
      await expect(service.delete("nonexistent", OWNER)).rejects.toThrow(NotFoundError);
    });

    it("409 ASSET_010 khi đã gắn AssetLink", async () => {
      const { asset } = await service.create(OWNER, {
        scope: "RESOURCE",
        kind: "IMAGE",
        fileName: "a.png",
        size: 10,
        mime: "image/png",
      });
      InMemoryAssetLinkRepository.seed({
        assetId: asset.id,
        targetType: "RESOURCE",
        targetId: "res-1",
        scopeType: "NONE",
        scopeId: null,
        createdBy: OWNER,
      });
      await expect(service.delete(asset.id, OWNER)).rejects.toMatchObject({
        statusCode: 409,
        errorCode: ErrorCode.ASSET_010,
      });
    });

    it("người khác không phải chủ → 403 ASSET_004", async () => {
      const { asset } = await service.create(OWNER, {
        scope: "RESOURCE",
        kind: "IMAGE",
        fileName: "a.png",
        size: 10,
        mime: "image/png",
      });
      await expect(service.delete(asset.id, OTHER)).rejects.toThrow(AppError);
    });
  });

  describe("hook theo scope (shared/ports/asset-scope-gate.port — p3-01)", () => {
    const dto = { scope: "RESOURCE" as const, kind: "FILE" as const, fileName: "a.pdf", size: 4096, mime: "application/pdf", workspaceId: "w".repeat(24) };

    afterEach(() => clearAssetScopeGates());

    it("chưa đăng ký gate → hành vi Phase 0 giữ nguyên (không kiểm gì thêm)", async () => {
      await expect(service.create(OWNER, dto)).resolves.toMatchObject({ asset: { status: "UPLOADING" } });
    });

    it("beforeCreate nhận đủ thông tin; ném lỗi → KHÔNG cấp URL upload và KHÔNG tạo asset", async () => {
      const beforeCreate = jest.fn().mockRejectedValue(new AppError("Kho tài liệu của nhóm đã đầy dung lượng", 413, ErrorCode.RSC_007));
      registerAssetScopeGate("RESOURCE", { beforeCreate });
      await expect(service.create(OWNER, dto)).rejects.toMatchObject({ statusCode: 413, errorCode: "RSC_007" });
      expect(beforeCreate).toHaveBeenCalledWith({ ownerId: OWNER, workspaceId: dto.workspaceId, fileName: "a.pdf", mime: "application/pdf", size: 4096 });
      expect(mockCreateUploadUrl).not.toHaveBeenCalled();
    });

    it("gate chỉ áp cho đúng scope của nó", async () => {
      const beforeCreate = jest.fn();
      registerAssetScopeGate("TASK", { beforeCreate });
      await service.create(OWNER, dto);
      expect(beforeCreate).not.toHaveBeenCalled();
    });

    it("afterCreate chạy sau khi tạo (giữ chỗ); abort → release; lỗi ở hook hậu kỳ KHÔNG làm hỏng request", async () => {
      const afterCreate = jest.fn().mockResolvedValue(undefined);
      const release = jest.fn().mockRejectedValue(new Error("redis down"));
      registerAssetScopeGate("RESOURCE", { beforeCreate: jest.fn().mockResolvedValue(undefined), afterCreate, release });
      const { asset } = await service.create(OWNER, dto);
      expect(afterCreate).toHaveBeenCalledWith({ assetId: asset.id, workspaceId: dto.workspaceId, size: 4096 });
      await expect(service.abort(asset.id, OWNER)).resolves.toBeUndefined();
      expect(release).toHaveBeenCalledWith({ assetId: asset.id, workspaceId: dto.workspaceId });
    });

    it("afterCreate lỗi → vẫn trả asset (best-effort)", async () => {
      registerAssetScopeGate("RESOURCE", {
        beforeCreate: jest.fn().mockResolvedValue(undefined),
        afterCreate: jest.fn().mockRejectedValue(new Error("redis down")),
      });
      await expect(service.create(OWNER, dto)).resolves.toMatchObject({ asset: { status: "UPLOADING" } });
    });
  });
});
