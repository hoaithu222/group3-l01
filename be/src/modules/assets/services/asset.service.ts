import { createHash, timingSafeEqual } from "crypto";
import { withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { storage, buildKey, type UploadInstruction } from "../../../infrastructure/storage";
import { newObjectId } from "../../../core/utils/object-id";
import { parseSize } from "../../../core/utils/size";
import { logger } from "../../../infrastructure/logger";
import { AppError, NotFoundError, ScopeNotFoundError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import { LIMITS } from "../../../core/constants";
import { env } from "../../../core/config";
import type { AuthUser } from "../../../core/types/express";
import type { IAssetRepository } from "../repositories/asset.repository.interface";
import type { IAssetLinkRepository } from "../repositories/asset-link.repository.interface";
import type { AssetAccessService } from "./asset-access.service";
import type { AssetProcessor } from "./asset-processor";
import { mimePolicy } from "./mime-policy";
import { getAssetScopeGate } from "../../../shared/ports/asset-scope-gate.port";
import type { CreateAssetDto } from "../dtos/create-asset.dto";
import type { CompleteAssetDto } from "../dtos/complete-asset.dto";
import type { AssetUrlQuery } from "../dtos/asset-url.dto";
import {
  DISPLAY_IMAGE_TARGETS,
  type Asset,
  type AssetScope,
  type AssetKind,
  type AssetStatusValue,
  type AssetVariant,
  type ServerAssetScope,
} from "../entities/asset.interface";
import { buildLocalDownloadUrl, signLocalDownload } from "./local-download-url";

/** Tạo asset từ nội dung do SERVER sinh (xem `AssetService.createFromBuffer`). */
export interface CreateFromBufferInput {
  scope: ServerAssetScope;
  ownerId: string;
  workspaceId?: string;
  mime: string;
  /** Tên tệp hiển thị/tải về (KHÔNG dùng để dựng khoá storage). */
  fileName: string;
  buffer: Buffer;
  /** Mặc định `FILE`. */
  kind?: AssetKind;
}

export interface AssetDto {
  id: string;
  scope: AssetScope;
  kind: AssetKind;
  status: AssetStatusValue;
  mime: string;
  size: number | null;
  originalName: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  waveform: number[] | null;
  hasThumb: boolean;
  rejectReason: string | null;
  createdAt: Date;
  readyAt: Date | null;
}

/** Target link của ảnh hiển thị (avatar, ảnh bìa nhóm) — TTL cache dài hơn nội dung riêng tư (be.md §5.6). */
const DISPLAY_TARGET_TYPES = new Set<string>(DISPLAY_IMAGE_TARGETS);

/** Ngưỡng "fast path" xử lý ảnh đồng bộ trong request `complete` (be.md §5.2 bước 4). */
const FAST_PATH_TIMEOUT_MS = 3000;

export class AssetService {
  constructor(
    private readonly repo: IAssetRepository,
    private readonly linkRepo: IAssetLinkRepository,
    private readonly access: AssetAccessService,
    private readonly processor: AssetProcessor
  ) {}

  /** Bước 1/2 — đăng ký metadata + chỉ dẫn upload (be.md §5.1). */
  async create(ownerId: string, dto: CreateAssetDto): Promise<{ asset: AssetDto; upload: UploadInstruction }> {
    const { ext, maxBytes } = mimePolicy.resolve({ kind: dto.kind, mime: dto.mime, size: dto.size, scope: dto.scope });
    const hardCap = Math.min(LIMITS.upload.maxFileBytes, parseSize(env.MAX_FILE_SIZE));
    const effectiveMax = Math.min(maxBytes, hardCap);
    if (dto.size > effectiveMax) {
      throw new AppError("Tệp vượt quá dung lượng cho phép", 413, ErrorCode.ASSET_002, { max: effectiveMax });
    }

    // Hook theo scope (p3-01: RESOURCE kiểm quyền tải lên + hạn mức dung lượng → `RSC_007`) — TRƯỚC khi cấp URL upload.
    const gate = getAssetScopeGate(dto.scope);
    await gate?.beforeCreate({
      ownerId,
      workspaceId: dto.workspaceId,
      fileName: dto.fileName,
      mime: dto.mime,
      size: dto.size,
    });

    const assetId = newObjectId();
    const storageKey = buildKey(env.NODE_ENV, dto.scope, assetId, "ORIGINAL", ext);
    const upload = await storage.createUploadUrl({
      key: storageKey,
      assetId,
      contentType: dto.mime,
      contentLength: dto.size,
      ttlSeconds: LIMITS.upload.presignedPutTtlSeconds,
    });

    const created = await this.repo.create({
      id: assetId,
      ownerId,
      scope: dto.scope,
      kind: dto.kind,
      workspaceId: dto.workspaceId,
      uploadMethod: upload.method,
      mime: dto.mime,
      declaredSize: dto.size,
      originalName: dto.fileName,
      storageKey,
      checksum: dto.checksum,
      status: "UPLOADING",
    });
    await this.runGateSafely(dto.scope, "afterCreate", (gate) =>
      gate.afterCreate?.({ assetId, workspaceId: dto.workspaceId, size: dto.size })
    );

    return { asset: this.toDto(created), upload };
  }

  /**
   * Tạo asset từ NỘI DUNG DO SERVER SINH (đồng bộ chéo #3, p4-06 PDF báo cáo): ghi thẳng lên storage rồi tạo `Asset READY` — bỏ qua 2 bước
   * của client và job `asset.process` vì nội dung đáng tin, không có gì để xử lý lại. Vẫn qua `mimePolicy.resolve` (allowlist + trần
   * theo scope, `ASSET_001/002`) và kiểm chữ ký PDF. Asset CHƯA gắn `AssetLink` — caller gắn NGAY ở bước kế tiếp (job `assets.cleanup`
   * chỉ dọn asset mồ côi quá `LIMITS.upload.orphanTtlHours`). Chỉ nhận scope `SERVER_ASSET_SCOPES` (client không tạo được các scope này).
   */
  async createFromBuffer(input: CreateFromBufferInput): Promise<AssetDto> {
    const kind = input.kind ?? "FILE";
    const size = input.buffer.length;
    if (size === 0) throw new AppError("Tệp rỗng", 415, ErrorCode.ASSET_001);
    const { ext } = mimePolicy.resolve({ kind, mime: input.mime, size, scope: input.scope });
    if (input.mime === "application/pdf" && input.buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
      throw new AppError("Nội dung không phải PDF hợp lệ", 415, ErrorCode.ASSET_001);
    }

    const assetId = newObjectId();
    const storageKey = buildKey(env.NODE_ENV, input.scope, assetId, "ORIGINAL", ext);
    await storage.putObject(storageKey, input.buffer, input.mime);
    try {
      const now = new Date();
      await this.repo.create({
        id: assetId,
        ownerId: input.ownerId,
        scope: input.scope,
        kind,
        workspaceId: input.workspaceId,
        uploadMethod: "API_PUT",
        mime: input.mime,
        declaredSize: size,
        size,
        originalName: input.fileName,
        storageKey,
        checksum: createHash("sha256").update(input.buffer).digest("hex"),
        status: "READY",
      });
      const ready = await this.repo.update(assetId, { readyAt: now, processedAt: now });
      const created = ready ?? (await this.repo.findById(assetId));
      if (!created) throw new NotFoundError("Không tìm thấy tệp");
      return this.toDto(created);
    } catch (err) {
      await storage.deleteMany([storageKey]).catch(() => undefined);
      throw err;
    }
  }

  /** Chỉ dẫn upload MỚI (URL cũ hết hạn/thử lại) — cùng `storageKey`, TTL mới (be.md §4). */
  async reissueUploadUrl(assetId: string, ownerId: string): Promise<UploadInstruction> {
    const asset = await this.mustOwnUploading(assetId, ownerId);
    return storage.createUploadUrl({
      key: asset.storageKey,
      assetId: asset.id,
      contentType: asset.mime,
      contentLength: asset.declaredSize,
      ttlSeconds: LIMITS.upload.presignedPutTtlSeconds,
    });
  }

  /** Bước 2/2 (fallback Local/Cloudinary, `uploadMethod API_PUT`) — nhận nội dung qua chính API. */
  async uploadContent(assetId: string, ownerId: string, file: Express.Multer.File): Promise<AssetDto> {
    const asset = await this.mustOwnUploading(assetId, ownerId);
    if (asset.uploadMethod !== "API_PUT") {
      throw new AppError("Tệp này dùng luồng tải trực tiếp lên storage", 403, ErrorCode.ASSET_004);
    }
    if (file.size > asset.declaredSize) {
      await this.rejectAndCleanup(asset, "Kích thước tệp vượt khai báo");
      throw new AppError("Tệp vượt quá dung lượng cho phép", 413, ErrorCode.ASSET_002, {
        max: asset.declaredSize,
      });
    }

    await storage.putObject(asset.storageKey, file.buffer, asset.mime);
    const checksum = createHash("sha256").update(file.buffer).digest("hex");

    // `checksum` ghi CHUNG với chuyển PROCESSING (trong `finalize`) thay vì một `update` riêng; nội dung còn nằm trong RAM nên fast path
    // khỏi tải lại tệp vừa đẩy lên storage (mỗi lần tải lại là 1–2 vòng tới Cloudinary/S3).
    return this.finalize(asset, { size: file.size, checksum }, file.buffer);
  }

  /** `POST /assets/:id/complete` — chốt kích thước thật (S3 presigned PUT) + gợi ý metadata (be.md §5.2). */
  async complete(assetId: string, ownerId: string, dto: CompleteAssetDto): Promise<AssetDto> {
    const asset = await this.mustOwnUploading(assetId, ownerId);

    const head = await storage.head(asset.storageKey);
    if (!head) {
      throw new AppError("Chưa nhận được nội dung tệp, hãy tải lên lại", 409, ErrorCode.ASSET_007);
    }
    if (head.size !== dto.size || head.size > asset.declaredSize) {
      await this.rejectAndCleanup(asset, "Kích thước tệp không khớp khai báo");
      throw new AppError("Tệp vượt quá dung lượng cho phép", 413, ErrorCode.ASSET_002, {
        max: asset.declaredSize,
      });
    }

    return this.finalize(asset, {
      size: head.size,
      durationMs: dto.durationMs,
      width: dto.width,
      height: dto.height,
      waveform: dto.waveform,
    });
  }

  /** Huỷ upload (chưa/đang tải dở) — asset phải còn `UPLOADING` (be.md §4). */
  async abort(assetId: string, ownerId: string): Promise<void> {
    const asset = await this.mustOwnUploading(assetId, ownerId);
    await storage.deleteMany([asset.storageKey]).catch(() => undefined);
    await this.repo.markDeleted(asset.id);
    await this.releaseGate(asset);
  }

  async getById(assetId: string, user: AuthUser): Promise<AssetDto> {
    const asset = await this.repo.findById(assetId);
    if (!asset) throw new ScopeNotFoundError();
    await this.access.assertRead(user, asset);
    return this.toDto(asset);
  }

  /** `GET /assets/:id/url?variant&disposition` — URL ký, TTL theo be.md §5.6. */
  async getUrl(
    assetId: string,
    user: AuthUser,
    query: AssetUrlQuery
  ): Promise<{ url: string; expiresAt: string }> {
    const parent = await this.repo.findById(assetId);
    if (!parent) throw new ScopeNotFoundError();
    await this.access.assertRead(user, parent);
    if (parent.status !== "READY") {
      throw new AppError("Tệp chưa sẵn sàng để sử dụng", 409, ErrorCode.ASSET_003);
    }

    const target = await this.resolveVariantAsset(parent, query.variant);
    const ttlSeconds = await this.resolveTtlSeconds(parent);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    if (env.STORAGE_TYPE === "local") {
      return { url: this.buildLocalDownloadUrl(parent.id, query.variant, ttlSeconds), expiresAt };
    }
    const url = await storage.getSignedUrl(target.storageKey, ttlSeconds);
    return { url, expiresAt };
  }

  /**
   * Ký URL thumbnail cho NHIỀU asset gốc trong 1 lượt (đúng 2 truy vấn, không N+1) — CHỈ dùng khi caller đã tự kiểm
   * quyền đọc đối tượng gắn (vd danh sách tài liệu p3-01 đã `assert workspace.resource.read`). Asset chưa READY/không
   * có thumbnail → vắng mặt trong Map. TTL = `getUrl` cho nội dung riêng tư (≤ 60 s).
   */
  async signThumbnails(assetIds: string[]): Promise<Map<string, { url: string; expiresAt: string }>> {
    const result = new Map<string, { url: string; expiresAt: string }>();
    if (assetIds.length === 0) return result;

    const parents = (await this.repo.findByIds(assetIds)).filter((p) => p.status === "READY" && p.thumbnailAssetId);
    const thumbs = new Map(
      (await this.repo.findByIds(parents.map((p) => p.thumbnailAssetId as string))).map((t) => [t.id, t])
    );
    const ttlSeconds = Math.min(env.SIGNED_URL_TTL_SECONDS, LIMITS.upload.signedUrlTtlMaxSeconds);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    await Promise.all(
      parents.map(async (parent) => {
        const thumb = thumbs.get(parent.thumbnailAssetId as string);
        if (!thumb || thumb.status !== "READY") return;
        const url =
          env.STORAGE_TYPE === "local"
            ? this.buildLocalDownloadUrl(parent.id, "THUMB", ttlSeconds)
            : await storage.getSignedUrl(thumb.storageKey, ttlSeconds);
        result.set(parent.id, { url, expiresAt });
      })
    );
    return result;
  }

  /** Chủ + chưa gắn `AssetLink` nào (be.md §4/§6) — xoá cả thumbnail con. */
  async delete(assetId: string, ownerId: string): Promise<void> {
    const asset = await this.mustOwn(assetId, ownerId);
    const linked = await this.linkRepo.existsForAsset(asset.id);
    if (linked) {
      throw new AppError("Tệp đang được sử dụng nên không thể xoá", 409, ErrorCode.ASSET_010);
    }

    const children = await this.repo.findChildren(asset.id);
    const keys = [asset.storageKey, ...children.map((c) => c.storageKey)].filter((k) => k.length > 0);
    await storage.deleteMany(keys).catch(() => undefined);
    await this.repo.markDeleted(asset.id);
    await Promise.all(children.map((c) => this.repo.markDeleted(c.id)));
  }

  /** Xác minh chữ ký HMAC của gateway tải cục bộ (`STORAGE_TYPE=local`) — trả về asset (biến thể) cần đọc. */
  async verifyLocalDownload(assetId: string, variant: AssetVariant, exp: number, sig: string): Promise<Asset> {
    if (!Number.isFinite(exp) || Math.floor(Date.now() / 1000) > exp) {
      throw new AppError("Liên kết tải tệp đã hết hạn", 403, ErrorCode.ASSET_009);
    }
    const expected = Buffer.from(this.signDownload(assetId, variant, exp));
    const provided = Buffer.from(sig ?? "");
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
      throw new AppError("Liên kết tải tệp đã hết hạn", 403, ErrorCode.ASSET_009);
    }
    const parent = await this.repo.findById(assetId);
    if (!parent) throw new NotFoundError("Không tìm thấy tệp");
    return this.resolveVariantAsset(parent, variant);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Nội bộ
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Chuyển `PROCESSING` + đẩy `asset.process` qua outbox trong CÙNG
   * transaction (be.md §5.2 bước 3) — NGOẠI LỆ CÓ CHỦ ĐÍCH đi thẳng
   * `prisma`/`withTransaction`/`outbox` thay vì qua `IAssetRepository`, giống
   * `UserAnonymizer`/`UserService.requestDeletion` đã làm cho thao tác cần
   * ATOMIC với `OutboxEvent` (repo interface hiện tại không nhận `tx` — theo
   * đúng `api-patterns.md` "Service KHÔNG import Prisma trực tiếp", nghĩa là
   * KHÔNG thể thêm tham số `Prisma.TransactionClient` vào interface mà không
   * làm rò rỉ kiểu hạ tầng lên interface — bypass có kiểm soát là lựa chọn
   * nhất quán với tiền lệ đã có, không phải mẫu chung cho các method khác).
   */
  private async finalize(
    asset: Asset,
    hints: { size: number; checksum?: string; durationMs?: number; width?: number; height?: number; waveform?: number[] },
    content?: Buffer
  ): Promise<AssetDto> {
    await withTransaction(async (tx) => {
      await tx.asset.update({
        where: { id: asset.id },
        data: {
          status: "PROCESSING",
          size: hints.size,
          ...(hints.checksum !== undefined && { checksum: hints.checksum }),
          ...(hints.durationMs !== undefined && { durationMs: hints.durationMs }),
          ...(hints.width !== undefined && { width: hints.width }),
          ...(hints.height !== undefined && { height: hints.height }),
          ...(hints.waveform !== undefined && { waveform: { points: hints.waveform } }),
        },
      });
      await outbox.add(tx, {
        type: "asset.process",
        aggregateType: "Asset",
        aggregateId: asset.id,
        queue: "media",
        jobName: "asset.process",
        dedupeKey: `asset.process:asset:${asset.id}`,
        payload: { assetId: asset.id },
      });
    });

    if (asset.kind === "IMAGE" && hints.size <= LIMITS.upload.fastPathMaxBytes) {
      await this.tryFastPath(asset.id, content);
    }

    const updated = await this.repo.findById(asset.id);
    return this.toDto(updated ?? asset);
  }

  /** Ảnh nhỏ xử lý đồng bộ tối đa `FAST_PATH_TIMEOUT_MS` — hết giờ để job async xử lý lại (idempotent theo `PROCESSING`). */
  private async tryFastPath(assetId: string, content?: Buffer): Promise<void> {
    try {
      await Promise.race([
        this.processor.process(assetId, content ? { content } : undefined),
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error(`fast-path quá ${FAST_PATH_TIMEOUT_MS}ms`)), FAST_PATH_TIMEOUT_MS).unref();
        }),
      ]);
    } catch (err) {
      logger.warn("[AssetService] Fast path xử lý ảnh chưa xong — job async sẽ xử lý lại", {
        assetId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async rejectAndCleanup(asset: Asset, reason: string): Promise<void> {
    await this.repo.update(asset.id, { status: "REJECTED", rejectReason: reason });
    await storage.deleteMany([asset.storageKey]).catch(() => undefined);
    await this.releaseGate(asset);
  }

  /** Trả chỗ đã giữ ở gate của scope (vd dung lượng kho tài liệu) khi asset không bao giờ dùng tới. */
  private async releaseGate(asset: Asset): Promise<void> {
    await this.runGateSafely(asset.scope, "release", (gate) =>
      gate.release?.({ assetId: asset.id, workspaceId: asset.workspaceId })
    );
  }

  /** Hook hậu kỳ của gate là best-effort — lỗi (vd Redis) chỉ log, không làm hỏng thao tác đã hoàn tất. */
  private async runGateSafely(
    scope: string,
    hook: string,
    fn: (gate: NonNullable<ReturnType<typeof getAssetScopeGate>>) => Promise<void> | undefined
  ): Promise<void> {
    const gate = getAssetScopeGate(scope);
    if (!gate) return;
    try {
      await fn(gate);
    } catch (err) {
      logger.warn("[AssetService] Hook gate của scope thất bại — bỏ qua", {
        scope,
        hook,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async resolveVariantAsset(parent: Asset, variant: AssetVariant): Promise<Asset> {
    if (variant === "ORIGINAL") return parent;
    if (variant === "THUMB" && parent.thumbnailAssetId) {
      const thumb = await this.repo.findById(parent.thumbnailAssetId);
      if (thumb) return thumb;
    }
    throw new AppError("Không có bản xem trước cho tệp này", 404, ErrorCode.ASSET_008);
  }

  private async resolveTtlSeconds(parent: Asset): Promise<number> {
    const links = await this.linkRepo.listByAsset(parent.id, 20);
    const isAvatar = links.some((l) => DISPLAY_TARGET_TYPES.has(l.targetType));
    if (isAvatar) return LIMITS.upload.avatarUrlTtlSeconds;
    return Math.min(env.SIGNED_URL_TTL_SECONDS, LIMITS.upload.signedUrlTtlMaxSeconds);
  }

  private buildLocalDownloadUrl(assetId: string, variant: AssetVariant, ttlSeconds: number): string {
    return buildLocalDownloadUrl(assetId, variant, ttlSeconds);
  }

  private signDownload(assetId: string, variant: AssetVariant, exp: number): string {
    return signLocalDownload(assetId, variant, exp);
  }

  private async mustOwn(assetId: string, ownerId: string): Promise<Asset> {
    const asset = await this.repo.findById(assetId);
    if (!asset) throw new NotFoundError("Không tìm thấy tệp");
    if (asset.ownerId !== ownerId) {
      throw new AppError("Bạn không thể thao tác với tệp này ở trạng thái hiện tại", 403, ErrorCode.ASSET_004);
    }
    return asset;
  }

  private async mustOwnUploading(assetId: string, ownerId: string): Promise<Asset> {
    const asset = await this.mustOwn(assetId, ownerId);
    if (asset.status !== "UPLOADING") {
      throw new AppError("Bạn không thể thao tác với tệp này ở trạng thái hiện tại", 403, ErrorCode.ASSET_004);
    }
    return asset;
  }

  private toDto(asset: Asset): AssetDto {
    return {
      id: asset.id,
      scope: asset.scope,
      kind: asset.kind,
      status: asset.status,
      mime: asset.mime,
      size: asset.size,
      originalName: asset.originalName,
      width: asset.width,
      height: asset.height,
      durationMs: asset.durationMs,
      waveform: asset.waveform,
      hasThumb: asset.thumbnailAssetId !== null,
      rejectReason: asset.rejectReason,
      createdAt: asset.createdAt,
      readyAt: asset.readyAt,
    };
  }
}
