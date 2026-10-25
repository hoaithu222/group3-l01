import { v2 as cloudinary } from "cloudinary";
import type { UploadApiResponse } from "cloudinary";
import https from "node:https";
import type {
  IStorage,
  UploadResult,
  CreateUploadUrlParams,
  UploadInstruction,
  HeadResult,
} from "./storage.interface";
import { env } from "../../core/config";
import { logger } from "../logger";
import { BadGatewayError } from "../../core/exceptions";

// Cloudinary không có resource_type "audio" riêng — audio được xếp vào "video".
const VIDEO_EXTENSIONS = new Set([
  "mp4", "mov", "avi", "wmv", "flv", "mkv", "webm", "mpeg", "mpg", "3gp", "m4v",
  "mp3", "wav", "ogg", "m4a", "aac", "flac", "wma", "opus",
]);
const IMAGE_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "bmp", "tiff", "tif", "webp", "svg", "ico",
  "heic", "heif", "avif", "psd",
]);

/**
 * Suy ra Cloudinary `resource_type` từ phần mở rộng file trong `key`.
 * `IStorage.delete`/`getSignedUrl` chỉ nhận `key` (không có resource_type đi kèm),
 * nên phải suy ngược từ extension — nhất quán với `resource_type: "auto"` lúc upload.
 */
function inferResourceType(ext: string): "image" | "video" | "raw" {
  const normalized = ext.toLowerCase();
  if (IMAGE_EXTENSIONS.has(normalized)) return "image";
  if (VIDEO_EXTENSIONS.has(normalized)) return "video";
  return "raw";
}

/**
 * CloudinaryStorage — upload/delete/signed URL trên Cloudinary.
 * File key trả về dạng `<folder>/<public_id>.<ext>` — dùng chung với S3/Local.
 *
 * Asset luôn upload với `type: "authenticated"` — KHÔNG public qua `secure_url`.
 * Truy cập bắt buộc phải qua `getSignedUrl()`. Nếu upload không set type này,
 * `getSignedUrl()`/`delete()` bên dưới sẽ không khớp với asset thật (Cloudinary
 * định danh resource theo bộ ba public_id + resource_type + type).
 */
export class CloudinaryStorage implements IStorage {
  constructor() {
    if (
      !env.CLOUDINARY_CLOUD_NAME ||
      !env.CLOUDINARY_API_KEY ||
      !env.CLOUDINARY_API_SECRET
    ) {
      throw new BadGatewayError(
        "Thiếu cấu hình Cloudinary (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)"
      );
    }
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  /** {@inheritDoc IStorage.upload} */
  async upload(file: Express.Multer.File, folder?: string): Promise<UploadResult> {
    try {
      const result = await new Promise<UploadApiResponse>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: folder ?? undefined,
            resource_type: "auto",
            type: "authenticated",
          },
          (err, res) => {
            if (err || !res) return reject(err ?? new Error("Cloudinary upload trả về rỗng"));
            resolve(res);
          }
        );
        stream.end(file.buffer);
      });

      // key giữ format `<folder>/<public_id>.<ext>` để delete/signed URL tra ngược được
      const ext = result.format ? `.${result.format}` : "";
      const key = `${result.public_id}${ext}`;

      logger.info(`[CloudinaryStorage] Upload thành công: ${key}`);
      return {
        key,
        // secure_url ở đây KHÔNG truy cập trực tiếp được (type: authenticated) —
        // chỉ để log/debug. Muốn truy cập thật phải gọi getSignedUrl().
        url: result.secure_url,
        mimetype: file.mimetype,
        size: result.bytes ?? file.size,
      };
    } catch (err) {
      logger.error("[CloudinaryStorage] Upload thất bại:", err);
      throw new BadGatewayError(
        `Cloudinary upload thất bại: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /** {@inheritDoc IStorage.delete} */
  async delete(key: string): Promise<void> {
    try {
      const publicId = this.stripExtension(key);
      const resourceType = inferResourceType(this.extractFormat(key));
      const result = await cloudinary.uploader.destroy(publicId, {
        invalidate: true,
        resource_type: resourceType,
        type: "authenticated",
      });
      if (result.result !== "ok" && result.result !== "not found") {
        logger.warn(`[CloudinaryStorage] Xoá "${key}" trả về: ${result.result}`);
        return;
      }
      logger.info(`[CloudinaryStorage] Đã xoá: ${key}`);
    } catch (err) {
      logger.warn(`[CloudinaryStorage] Xoá thất bại "${key}":`, err);
    }
  }

  /**
   * Trả về signed URL có thời hạn thật cho asset `type: "authenticated"`.
   *
   * Dùng `cloudinary.url()` + `sign_url: true` + `expires_at` (được CDN cache) —
   * KHÔNG dùng `private_download_url` (chỉ dành cho asset `type: "private"`, và
   * mỗi lần gọi là một request API riêng, không cache qua CDN).
   */
  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    try {
      const publicId = this.stripExtension(key);
      const format = this.extractFormat(key);
      const resourceType = inferResourceType(format);
      const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
      return cloudinary.url(publicId, {
        resource_type: resourceType,
        type: "authenticated",
        sign_url: true,
        secure: true,
        format: format || undefined,
        expires_at: expiresAt,
      });
    } catch (err) {
      logger.error(`[CloudinaryStorage] getSignedUrl thất bại "${key}":`, err);
      throw new BadGatewayError(
        `Cloudinary getSignedUrl thất bại: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * {@inheritDoc IStorage.createUploadUrl} — Cloudinary không có presigned
   * PUT tương đương S3 đơn giản (risk note be.md §10) → fallback `API_PUT`
   * như Local.
   */
  async createUploadUrl(params: CreateUploadUrlParams): Promise<UploadInstruction> {
    return { method: "API_PUT", url: `${env.PUBLIC_API_URL}/api/v1/assets/${params.assetId}/content` };
  }

  /** {@inheritDoc IStorage.head} */
  async head(key: string): Promise<HeadResult | null> {
    try {
      const publicId = this.stripExtension(key);
      const resourceType = inferResourceType(this.extractFormat(key));
      const result = await cloudinary.api.resource(publicId, {
        resource_type: resourceType,
        type: "authenticated",
      });
      return { size: result.bytes, contentType: result.resource_type };
    } catch (err) {
      const httpCode = (err as { http_code?: number })?.http_code;
      if (httpCode === 404) return null;
      logger.error(`[CloudinaryStorage] head thất bại "${key}":`, err);
      throw new BadGatewayError(
        `Cloudinary head thất bại: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * {@inheritDoc IStorage.readRange} — Cloudinary không có API range-read
   * trực tiếp; dựng signed URL (`getSignedUrl`) rồi GET với header `Range`.
   */
  async readRange(key: string, start: number, end: number): Promise<Buffer> {
    const url = await this.getSignedUrl(key, 60);
    return new Promise<Buffer>((resolve, reject) => {
      https
        .get(url, { headers: { Range: `bytes=${start}-${end}` } }, (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => resolve(Buffer.concat(chunks)));
          res.on("error", reject);
        })
        .on("error", reject);
    }).catch((err) => {
      logger.error(`[CloudinaryStorage] readRange thất bại "${key}":`, err);
      throw new BadGatewayError(
        `Cloudinary readRange thất bại: ${err instanceof Error ? err.message : String(err)}`
      );
    });
  }

  /** {@inheritDoc IStorage.putObject} — public_id/tên biến thể (thumbnail) suy trực tiếp từ `key`. */
  async putObject(
    key: string,
    buffer: Buffer,
    _contentType: string
  ): Promise<{ key: string; size: number }> {
    const publicId = this.stripExtension(key);
    const resourceType = inferResourceType(this.extractFormat(key));
    try {
      const result = await new Promise<UploadApiResponse>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { public_id: publicId, resource_type: resourceType, type: "authenticated" },
          (err, res) => {
            if (err || !res) return reject(err ?? new Error("Cloudinary upload trả về rỗng"));
            resolve(res);
          }
        );
        stream.end(buffer);
      });
      return { key, size: result.bytes ?? buffer.length };
    } catch (err) {
      logger.error(`[CloudinaryStorage] putObject thất bại "${key}":`, err);
      throw new BadGatewayError(
        `Cloudinary putObject thất bại: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /** {@inheritDoc IStorage.deleteMany} */
  async deleteMany(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.delete(key)));
  }

  private stripExtension(key: string): string {
    const idx = key.lastIndexOf(".");
    return idx > 0 ? key.slice(0, idx) : key;
  }

  private extractFormat(key: string): string {
    const idx = key.lastIndexOf(".");
    return idx > 0 ? key.slice(idx + 1) : "";
  }
}
