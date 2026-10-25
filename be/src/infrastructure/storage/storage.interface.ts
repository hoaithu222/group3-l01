/**
 * Kết quả sau khi upload thành công.
 */
export interface UploadResult {
  /** Key định danh file (path tương đối hoặc S3/Cloudinary object key) */
  key: string;
  /** URL truy cập công khai */
  url: string;
  /** MIME type của file */
  mimetype: string;
  /** Kích thước file (bytes) */
  size: number;
}

/** Tham số yêu cầu chỉ dẫn upload cho 1 object storage cụ thể (p0-05 §5.1). */
export interface CreateUploadUrlParams {
  /** Key đích — đã tính sẵn qua `buildKey()`, ổn định trong suốt vòng đời asset. */
  key: string;
  /** Id asset — Local/Cloudinary cần để dựng URL `PUT /assets/:id/content`. */
  assetId: string;
  contentType: string;
  contentLength: number;
  /** TTL (giây) cho URL presigned — bỏ qua với `API_PUT`. */
  ttlSeconds: number;
}

/**
 * Chỉ dẫn upload trả về cho client (p0-05 §4 `POST /assets`):
 * - `PRESIGNED_PUT` (S3): client `PUT` thẳng lên `url` kèm đúng `headers` đã ký.
 * - `API_PUT` (Local/Cloudinary): client `PUT` nội dung qua chính API (`/assets/:id/content`).
 */
export type UploadInstruction =
  | { method: "PRESIGNED_PUT"; url: string; headers: Record<string, string>; expiresAt: string }
  | { method: "API_PUT"; url: string };

/** Kết quả `head()` — `null` khi object chưa tồn tại trên storage. */
export interface HeadResult {
  size: number;
  contentType?: string;
}

/**
 * IStorage — interface tổng quát cho storage layer.
 * Impl cụ thể: LocalStorage (disk), S3Storage (AWS S3), CloudinaryStorage.
 */
export interface IStorage {
  /**
   * Upload file lên storage.
   * @param file   - File object từ Multer
   * @param folder - Thư mục con (tuỳ chọn)
   */
  upload(file: Express.Multer.File, folder?: string): Promise<UploadResult>;

  /**
   * Xoá file khỏi storage theo key.
   */
  delete(key: string): Promise<void>;

  /**
   * Tạo URL có chữ ký tạm thời để truy cập file private.
   * @param key       - Key của file
   * @param expiresIn - Thời gian hết hạn (giây), mặc định 3600
   */
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;

  /** Chỉ dẫn upload 2 bước (p0-05 §5.1) — S3 trả presigned PUT, Local/Cloudinary trả API_PUT. */
  createUploadUrl(params: CreateUploadUrlParams): Promise<UploadInstruction>;

  /** Kiểm object đã tồn tại trên storage + kích thước thật — `null` nếu chưa có. */
  head(key: string): Promise<HeadResult | null>;

  /** Đọc 1 đoạn byte `[start, end]` (inclusive) — dùng cho kiểm magic bytes (0..4095) hoặc tải về xử lý. */
  readRange(key: string, start: number, end: number): Promise<Buffer>;

  /** Ghi 1 buffer (thumbnail sinh ra bởi worker) vào `key` tường minh — khác `upload()` (sinh key ngẫu nhiên). */
  putObject(key: string, buffer: Buffer, contentType: string): Promise<{ key: string; size: number }>;

  /** Xoá hàng loạt — dùng khi dọn asset (gốc + thumbnail con) hoặc `assets.cleanup`. */
  deleteMany(keys: string[]): Promise<void>;
}
