import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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

/** Đọc trọn 1 Node.js Readable (SDK v3 trả `Body` dạng stream ở runtime Node) thành Buffer. */
async function streamToBuffer(body: unknown): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Buffer | Uint8Array>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * S3Storage — upload/delete/presign file trên AWS S3 (hoặc tương thích S3 —
 * MinIO qua `AWS_S3_ENDPOINT`/`AWS_S3_FORCE_PATH_STYLE`).
 * Graceful fallback: ném lỗi BadGatewayError nếu thiếu cấu hình AWS.
 */
export class S3Storage implements IStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    if (
      !env.AWS_REGION ||
      !env.AWS_ACCESS_KEY_ID ||
      !env.AWS_SECRET_ACCESS_KEY ||
      !env.AWS_S3_BUCKET
    ) {
      throw new BadGatewayError(
        "Thiếu cấu hình AWS S3 (AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET)"
      );
    }
    this.bucket = env.AWS_S3_BUCKET;
    this.client = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
      ...(env.AWS_S3_ENDPOINT && { endpoint: env.AWS_S3_ENDPOINT }),
      ...(env.AWS_S3_FORCE_PATH_STYLE && { forcePathStyle: true }),
    });
  }

  /** {@inheritDoc IStorage.upload} */
  async upload(file: Express.Multer.File, folder?: string): Promise<UploadResult> {
    const ext = file.originalname.split(".").pop() ?? "";
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext ? `.${ext}` : ""}`;
    const key = folder ? `${folder}/${filename}` : filename;

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        })
      );

      const url = `https://${this.bucket}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;
      logger.info(`[S3Storage] Upload thành công: ${key}`);
      return { key, url, mimetype: file.mimetype, size: file.size };
    } catch (err) {
      logger.error("[S3Storage] Upload thất bại:", err);
      throw new BadGatewayError(
        `S3 upload thất bại: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /** {@inheritDoc IStorage.delete} */
  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      logger.info(`[S3Storage] Đã xoá: ${key}`);
    } catch (err) {
      logger.warn(`[S3Storage] Xoá thất bại "${key}":`, err);
    }
  }

  /** {@inheritDoc IStorage.getSignedUrl} */
  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
      return await getSignedUrl(this.client, command, { expiresIn });
    } catch (err) {
      logger.error(`[S3Storage] getSignedUrl thất bại "${key}":`, err);
      throw new BadGatewayError(
        `S3 getSignedUrl thất bại: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * {@inheritDoc IStorage.createUploadUrl} — presigned PUT ràng `ContentType`
   * + `ContentLength` (được ký vào `X-Amz-SignedHeaders`, S3 từ chối nếu
   * client PUT với header khác — AST-03). `STORAGE_PUBLIC_UPLOAD=false` (vd
   * bucket chưa cấu hình CORS) → fallback `API_PUT` như Local/Cloudinary.
   */
  async createUploadUrl(params: CreateUploadUrlParams): Promise<UploadInstruction> {
    if (!env.STORAGE_PUBLIC_UPLOAD) {
      return { method: "API_PUT", url: `${env.PUBLIC_API_URL}/api/v1/assets/${params.assetId}/content` };
    }
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.key,
        ContentType: params.contentType,
        ContentLength: params.contentLength,
      });
      const url = await getSignedUrl(this.client, command, { expiresIn: params.ttlSeconds });
      return {
        method: "PRESIGNED_PUT",
        url,
        headers: {
          "Content-Type": params.contentType,
          "Content-Length": String(params.contentLength),
        },
        expiresAt: new Date(Date.now() + params.ttlSeconds * 1000).toISOString(),
      };
    } catch (err) {
      logger.error(`[S3Storage] createUploadUrl thất bại "${params.key}":`, err);
      throw new BadGatewayError(
        `S3 createUploadUrl thất bại: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /** {@inheritDoc IStorage.head} */
  async head(key: string): Promise<HeadResult | null> {
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: result.ContentLength ?? 0, contentType: result.ContentType };
    } catch (err) {
      const name = (err as { name?: string })?.name;
      if (name === "NotFound" || name === "NoSuchKey") return null;
      logger.error(`[S3Storage] head thất bại "${key}":`, err);
      throw new BadGatewayError(`S3 head thất bại: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** {@inheritDoc IStorage.readRange} */
  async readRange(key: string, start: number, end: number): Promise<Buffer> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=${start}-${end}` })
      );
      return await streamToBuffer(result.Body);
    } catch (err) {
      logger.error(`[S3Storage] readRange thất bại "${key}":`, err);
      throw new BadGatewayError(
        `S3 readRange thất bại: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /** {@inheritDoc IStorage.putObject} */
  async putObject(
    key: string,
    buffer: Buffer,
    contentType: string
  ): Promise<{ key: string; size: number }> {
    try {
      await this.client.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buffer, ContentType: contentType })
      );
      return { key, size: buffer.length };
    } catch (err) {
      logger.error(`[S3Storage] putObject thất bại "${key}":`, err);
      throw new BadGatewayError(
        `S3 putObject thất bại: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /** {@inheritDoc IStorage.deleteMany} */
  async deleteMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      // Giới hạn 1000 key/lần theo API S3 — đủ cho cỡ lô dọn dẹp hiện có (≤500).
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })) },
        })
      );
    } catch (err) {
      logger.warn("[S3Storage] deleteMany thất bại:", err);
    }
  }
}
