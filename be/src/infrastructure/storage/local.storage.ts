import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import type {
  IStorage,
  UploadResult,
  CreateUploadUrlParams,
  UploadInstruction,
  HeadResult,
} from "./storage.interface";
import { env } from "../../core/config";
import { logger } from "../logger";

/**
 * LocalStorage — lưu file lên disk local.
 * URL trả về dạng `/uploads/<folder>/<filename>`.
 * Phục vụ static files qua Express.
 */
/**
 * Đuôi file được suy ra từ MIME đã duyệt — KHÔNG lấy từ tên file người dùng gửi.
 * Xem giải thích đầy đủ ở `core/middlewares/upload.ts`.
 */
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "application/pdf": ".pdf",
  "application/zip": ".zip",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/wav": ".wav",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "text/csv": ".csv",
  "text/plain": ".txt",
  "application/json": ".json",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
};

/** Đoạn đường dẫn hợp lệ: chỉ chữ, số, `.`, `-`, `_`. */
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

export class LocalStorage implements IStorage {
  private readonly uploadDir: string;

  constructor() {
    this.uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
    this.ensureDir(this.uploadDir);
  }

  /** Tạo thư mục nếu chưa tồn tại */
  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info(`[LocalStorage] Tạo thư mục upload: ${dir}`);
    }
  }

  /**
   * Chuyển `key` do caller cung cấp thành đường dẫn tuyệt đối NẰM TRONG uploadDir.
   *
   * `path.join(uploadDir, key)` là bẫy kinh điển: key = `../../.env` cho ra
   * đường dẫn ngoài thư mục upload, biến `delete(key)` thành công cụ xoá file
   * tuỳ ý trên server. Ở đây mọi segment phải khớp allowlist, và kết quả cuối
   * cùng còn được kiểm tra lại là hậu duệ thật sự của uploadDir.
   */
  private resolveKey(key: string): string {
    if (typeof key !== "string" || key === "" || key.includes("\0")) {
      throw new Error("Storage key không hợp lệ");
    }

    const segments = key.split(/[\\/]+/).filter(Boolean);
    if (segments.length === 0 || segments.length > 8) {
      throw new Error("Storage key không hợp lệ");
    }
    for (const segment of segments) {
      if (segment === "." || segment === ".." || !SAFE_SEGMENT.test(segment)) {
        throw new Error("Storage key không hợp lệ");
      }
    }

    const resolved = path.resolve(this.uploadDir, ...segments);
    const root = this.uploadDir.endsWith(path.sep) ? this.uploadDir : this.uploadDir + path.sep;
    if (resolved !== this.uploadDir && !resolved.startsWith(root)) {
      throw new Error("Storage key nằm ngoài thư mục upload");
    }
    return resolved;
  }

  /** {@inheritDoc IStorage.upload} */
  async upload(file: Express.Multer.File, folder?: string): Promise<UploadResult> {
    // Tên folder cũng do code gọi truyền vào — vẫn phải kiểm tra.
    if (folder !== undefined && !SAFE_SEGMENT.test(folder)) {
      throw new Error("Tên thư mục upload không hợp lệ");
    }

    const targetDir = folder ? path.join(this.uploadDir, folder) : this.uploadDir;
    this.ensureDir(targetDir);

    // Tên file do server sinh hoàn toàn: UUID + đuôi suy từ MIME đã duyệt.
    const ext = MIME_TO_EXT[file.mimetype] ?? ".bin";
    const filename = `${Date.now()}-${randomUUID()}${ext}`;
    const destPath = path.join(targetDir, filename);

    await fs.promises.writeFile(destPath, file.buffer);

    const key = folder ? `${folder}/${filename}` : filename;
    const url = `/${env.UPLOAD_DIR}/${key}`;

    logger.info(`[LocalStorage] Upload thành công: ${key}`);
    return { key, url, mimetype: file.mimetype, size: file.size };
  }

  /** {@inheritDoc IStorage.delete} */
  async delete(key: string): Promise<void> {
    let filePath: string;
    try {
      filePath = this.resolveKey(key);
    } catch (err) {
      logger.warn(`[LocalStorage] Từ chối xoá key không hợp lệ "${key}":`, err);
      return;
    }

    try {
      await fs.promises.unlink(filePath);
      logger.info(`[LocalStorage] Đã xoá: ${key}`);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        logger.warn(`[LocalStorage] Xoá thất bại "${key}":`, err);
      }
    }
  }

  /**
   * LocalStorage không có signed URL — trả về URL tĩnh.
   * Vẫn validate key để URL trả ra không chứa `../` khiến client đi lạc
   * ra ngoài đường dẫn uploads.
   */
  async getSignedUrl(key: string, _expiresIn?: number): Promise<string> {
    this.resolveKey(key);
    return `/${env.UPLOAD_DIR}/${key}`;
  }

  /**
   * Đọc nội dung file — dùng cho gateway tải asset private
   * (`GET /assets/:id/download?exp=&sig=`) khi `STORAGE_TYPE=local`, vì
   * `express.static` chỉ phục vụ công khai thư mục uploads (avatar).
   */
  async readFile(key: string): Promise<Buffer> {
    const filePath = this.resolveKey(key);
    return fs.promises.readFile(filePath);
  }

  /**
   * {@inheritDoc IStorage.createUploadUrl} — Local KHÔNG có presigned PUT
   * thật, trả `API_PUT` trỏ về chính API (`PUT /assets/:id/content`, đã có).
   */
  async createUploadUrl(params: CreateUploadUrlParams): Promise<UploadInstruction> {
    return { method: "API_PUT", url: `${env.PUBLIC_API_URL}/api/v1/assets/${params.assetId}/content` };
  }

  /** {@inheritDoc IStorage.head} */
  async head(key: string): Promise<HeadResult | null> {
    let filePath: string;
    try {
      filePath = this.resolveKey(key);
    } catch {
      return null;
    }
    try {
      const stat = await fs.promises.stat(filePath);
      return { size: stat.size };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return null;
      throw err;
    }
  }

  /** {@inheritDoc IStorage.readRange} */
  async readRange(key: string, start: number, end: number): Promise<Buffer> {
    const filePath = this.resolveKey(key);
    const fd = await fs.promises.open(filePath, "r");
    try {
      const length = end - start + 1;
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await fd.read(buffer, 0, length, start);
      return buffer.subarray(0, bytesRead);
    } finally {
      await fd.close();
    }
  }

  /** {@inheritDoc IStorage.putObject} — ghi buffer vào ĐÚNG `key` tường minh (khác `upload()`, sinh key ngẫu nhiên). */
  async putObject(key: string, buffer: Buffer, _contentType: string): Promise<{ key: string; size: number }> {
    const filePath = this.resolveKey(key);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, buffer);
    return { key, size: buffer.length };
  }

  /** {@inheritDoc IStorage.deleteMany} */
  async deleteMany(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.delete(key)));
  }
}

/** Instance dùng chung */
export const localStorage = new LocalStorage();
