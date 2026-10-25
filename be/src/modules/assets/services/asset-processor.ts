import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { fromBuffer } from "file-type";
import type Sharp from "sharp";
import { env } from "../../../core/config";
import { logger } from "../../../infrastructure/logger";
import { storage, buildKey } from "../../../infrastructure/storage";
import { newObjectId } from "../../../core/utils/object-id";
import { LIMITS } from "../../../core/constants";
import { mimePolicy } from "./mime-policy";
import { looksLikePlainText } from "./text-sniff";
import type { IAssetRepository } from "../repositories/asset.repository.interface";
import type { Asset } from "../entities/asset.interface";

/** Đọc 4096 byte đầu (0..4095) để dò magic bytes — đủ cho hầu hết định dạng ảnh/video/audio/document. */
const MAGIC_BYTES_END = 4095;

/**
 * `music-metadata` v11 là ESM THUẦN (không có bản CJS — `package.json` chỉ có
 * `exports.import`). TypeScript biên dịch `import()` động xuống `require()`
 * khi `module: "commonjs"` (xác nhận bằng cách build thử — xem README §10),
 * làm `ERR_REQUIRE_ESM` trên Node < 22.12 (CI dùng Node 20). Dùng `Function`
 * constructor để giữ lại `import()` NGUYÊN VẸN lúc runtime (V8 thực thi thật
 * dynamic import, không bị tsc downlevel) — thủ thuật chuẩn cho dự án
 * CommonJS cần nạp gói ESM-only.
 */
// eslint-disable-next-line @typescript-eslint/no-implied-eval -- KHÔNG phải eval chuỗi người dùng nhập; literal cố định "return import(specifier)" chỉ để né tsc downlevel `import()`, xem giải thích ở trên.
const importEsm = new Function("specifier", "return import(specifier)") as (
  specifier: string
) => Promise<typeof import("music-metadata")>;

async function loadMusicMetadata(): Promise<typeof import("music-metadata") | null> {
  try {
    return await importEsm("music-metadata");
  } catch (err) {
    logger.warn("[asset-processor] Không tải được music-metadata — bỏ qua durationMs thật", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * `sharp` là native dependency — lazy `require()` (giống `S3Storage`/
 * `CloudinaryStorage` ở `infrastructure/storage/index.ts`) để 1 deployment
 * thiếu binary (`libvips`) không sập cả tiến trình worker lúc import module,
 * chỉ bỏ qua bước tạo thumbnail (be.md §10 rủi ro).
 */
function loadSharp(): typeof Sharp | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("sharp") as typeof Sharp;
  } catch (err) {
    logger.warn("[asset-processor] sharp không khả dụng — bỏ qua tạo thumbnail", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Cổng nạp `music-metadata` — override được trong test (Jest chạy trong VM context, `import()` động cần cờ `--experimental-vm-modules` mà CI/`npm test` không bật; xem `asset-processor.test.ts`). Production dùng `loadMusicMetadata` thật (mặc định). */
export type MusicMetadataLoader = () => Promise<typeof import("music-metadata") | null>;
/** Cổng nạp `sharp` — tương tự, override được trong test nếu cần giả lập "thiếu sharp". */
export type SharpLoader = () => typeof Sharp | null;

/**
 * `asset.process` (be.md §5.3) — worker đọc lại nội dung THẬT từ storage
 * (không tin metadata client khai) để xác nhận magic bytes, sinh thumbnail
 * ảnh, đọc thời lượng audio/voice/video → chuyển `READY`/`REJECTED`.
 */
export class AssetProcessor {
  constructor(
    private readonly repo: IAssetRepository,
    private readonly deps: { loadMusicMetadata?: MusicMetadataLoader; loadSharp?: SharpLoader } = {}
  ) {}

  /**
   * @param opts.content nội dung tệp đã có sẵn trong RAM (đường `API_PUT` vừa nhận qua multer) — bỏ qua các lần tải lại từ storage
   * (dò magic bytes + tải cả tệp về đĩa tạm); vắng ⇒ đọc từ storage như trước (job async, presigned PUT).
   */
  async process(assetId: string, opts?: { content?: Buffer }): Promise<void> {
    const claimed = await this.repo.claimForProcessing(assetId);
    if (!claimed) return;
    const asset = await this.repo.findById(assetId);
    if (!asset || asset.status !== "PROCESSING") return;

    const size = asset.size ?? asset.declaredSize;
    const content = opts?.content && opts.content.length === size ? opts.content : undefined;
    const magicBuffer = content
      ? content.subarray(0, Math.min(MAGIC_BYTES_END + 1, size))
      : await storage.readRange(asset.storageKey, 0, Math.min(MAGIC_BYTES_END, size - 1));
    const detected = await fromBuffer(magicBuffer);
    const detectedMime = detected ? mimePolicy.normalizeDetectedMime(detected.mime, asset.mime) : undefined;
    if (!this.contentMatchesDeclared(asset, detectedMime, magicBuffer, size > magicBuffer.length)) {
      await this.reject(asset, "Nội dung tệp không khớp loại khai báo", [asset.storageKey]);
      return;
    }

    let tmpPath: string | null = null;
    try {
      switch (asset.kind) {
        case "IMAGE":
          if (content) {
            await this.processImage(asset, content);
          } else {
            tmpPath = await this.downloadToTemp(asset.storageKey, size, mimePolicy.extFor(asset.mime));
            await this.processImage(asset, tmpPath);
          }
          break;
        case "VOICE":
        case "AUDIO": {
          tmpPath = await this.downloadToTemp(asset.storageKey, size, mimePolicy.extFor(asset.mime));
          const rejected = await this.processAudio(asset, tmpPath);
          if (rejected) return;
          break;
        }
        case "VIDEO":
          tmpPath = await this.downloadToTemp(asset.storageKey, size, mimePolicy.extFor(asset.mime));
          await this.processVideo(asset, tmpPath);
          break;
        case "FILE":
          // P1: quét virus ClamAV. P0 không xử lý thêm.
          break;
      }
    } finally {
      if (tmpPath) await fs.promises.unlink(tmpPath).catch(() => undefined);
    }

    const now = new Date();
    await this.repo.update(asset.id, { status: "READY", readyAt: now, processedAt: now });
    logger.info("[asset-processor] Asset READY", { assetId: asset.id, kind: asset.kind });
  }

  /**
   * Nội dung thật khớp loại khai báo? MIME nhị phân: chữ ký `file-type` phải nằm trong allowlist của kind (theo
   * scope — RESOURCE nhận thêm md/json...). MIME văn bản (`text/plain|csv|markdown`, `application/json`) không có
   * magic bytes: `file-type` phải KHÔNG nhận ra chữ ký nhị phân nào (trừ XML) VÀ mẫu đầu là UTF-8 thuần, không NUL
   * — PNG/EXE đổi đuôi `.txt` bị từ chối (p3-01 ST-01).
   */
  private contentMatchesDeclared(
    asset: Asset,
    detectedMime: string | undefined,
    sample: Buffer,
    truncated: boolean
  ): boolean {
    if (mimePolicy.isTextMime(asset.mime)) {
      if (detectedMime && !mimePolicy.isTextualDetectedMime(detectedMime)) return false;
      return looksLikePlainText(sample, truncated);
    }
    if (!detectedMime) return false;
    return mimePolicy.allowedMimes(asset.kind, asset.scope).includes(detectedMime);
  }

  /** `source`: đường dẫn tệp tạm HOẶC buffer trong RAM (sharp nhận cả hai). */
  private async processImage(asset: Asset, source: string | Buffer): Promise<void> {
    const sharp = (this.deps.loadSharp ?? loadSharp)();
    if (!sharp) return; // Thiếu sharp — vẫn READY, chỉ không có thumbnail (be.md §10).

    const image = sharp(source).rotate();
    const metadata = await image.metadata();
    // Ghi kích thước SONG SONG với việc dựng thumbnail (hai việc độc lập) thay vì đợi 1 vòng DB rồi mới bắt đầu.
    const sizeWrite = this.repo.update(asset.id, {
      width: metadata.width ?? null,
      height: metadata.height ?? null,
    });

    sizeWrite.catch(() => undefined); // lỗi thật vẫn ném ở `await sizeWrite` bên dưới; dòng này chỉ tránh unhandled rejection nếu sharp ném trước
    const thumbBuffer = await sharp(source)
      .rotate()
      .resize(LIMITS.upload.thumbMaxPx, LIMITS.upload.thumbMaxPx, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
    const thumbMeta = await sharp(thumbBuffer).metadata();
    await sizeWrite;

    const thumbId = newObjectId();
    const thumbKey = buildKey(env.NODE_ENV, asset.scope, asset.id, "THUMB", "webp");
    await storage.putObject(thumbKey, thumbBuffer, "image/webp");

    const thumbAsset = await this.repo.create({
      id: thumbId,
      ownerId: asset.ownerId,
      scope: asset.scope,
      kind: "IMAGE",
      variant: "THUMB",
      parentAssetId: asset.id,
      workspaceId: asset.workspaceId ?? undefined,
      uploadMethod: asset.uploadMethod,
      mime: "image/webp",
      declaredSize: thumbBuffer.length,
      size: thumbBuffer.length,
      originalName: `thumb-${asset.originalName}`,
      storageKey: thumbKey,
      status: "READY",
      width: thumbMeta.width,
      height: thumbMeta.height,
    });
    await this.repo.update(thumbAsset.id, { readyAt: new Date(), processedAt: new Date() });
    await this.repo.update(asset.id, { thumbnailAssetId: thumbAsset.id });
  }

  /** @returns `true` nếu asset đã bị REJECTED (voice quá thời lượng) — caller dừng xử lý, KHÔNG set READY. */
  private async processAudio(asset: Asset, tmpPath: string): Promise<boolean> {
    const mm = await (this.deps.loadMusicMetadata ?? loadMusicMetadata)();
    if (!mm) return false;
    try {
      const parsed = await mm.parseFile(tmpPath, { duration: true });
      const durationMs = parsed.format.duration ? Math.round(parsed.format.duration * 1000) : undefined;
      if (durationMs === undefined) return false;

      const voicePolicy = LIMITS.upload.kinds.VOICE;
      if (asset.kind === "VOICE" && durationMs > voicePolicy.maxSeconds * 1000) {
        await this.reject(asset, "Ghi âm vượt quá thời lượng cho phép", [asset.storageKey]);
        return true;
      }
      await this.repo.update(asset.id, { durationMs });
      return false;
    } catch (err) {
      logger.warn("[asset-processor] Không đọc được metadata audio — bỏ qua durationMs", {
        assetId: asset.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  /** Best-effort — `music-metadata` không đảm bảo đọc được mọi container video (poster/probe đầy đủ ở P1). */
  private async processVideo(asset: Asset, tmpPath: string): Promise<void> {
    const mm = await (this.deps.loadMusicMetadata ?? loadMusicMetadata)();
    if (!mm) return;
    try {
      const parsed = await mm.parseFile(tmpPath, { duration: true });
      const durationMs = parsed.format.duration ? Math.round(parsed.format.duration * 1000) : undefined;
      if (durationMs !== undefined) await this.repo.update(asset.id, { durationMs });
    } catch (err) {
      logger.warn("[asset-processor] Không đọc được metadata video — giữ hint từ client", {
        assetId: asset.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async reject(asset: Asset, reason: string, storageKeys: string[]): Promise<void> {
    await this.repo.update(asset.id, { status: "REJECTED", rejectReason: reason });
    await storage.deleteMany(storageKeys).catch((err) => {
      logger.warn("[asset-processor] Xoá object gốc sau khi REJECTED thất bại", {
        assetId: asset.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    logger.info("[asset-processor] Asset REJECTED", { assetId: asset.id, reason });
  }

  private async downloadToTemp(key: string, size: number, ext: string): Promise<string> {
    const buffer = await storage.readRange(key, 0, Math.max(size - 1, 0));
    const tmpPath = path.join(env.MEDIA_TMP_DIR, `asset-${randomUUID()}.${ext}`);
    await fs.promises.writeFile(tmpPath, buffer);
    return tmpPath;
  }
}
