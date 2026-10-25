import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { env } from "../config";
import { ValidationError } from "../exceptions";
import { parseSize } from "../utils/size";

/**
 * File upload middleware dùng Multer.
 *
 * Cung cấp các preset cho các use case phổ biến:
 * - uploadSingle("avatar")         → 1 file, field name "avatar"
 * - uploadMultiple("images", 5)    → tối đa 5 files, field name "images"
 * - uploadFields([{ name: "avatar", maxCount: 1 }, { name: "documents", maxCount: 3 }])
 *
 * File được lưu tạm vào memory (buffer), sau đó dùng Storage layer
 * (LocalStorage / S3Storage / CloudinaryStorage) để persist.
 */

// ─── Allowed MIME types ──────────────────────────────────────────────────────

/**
 * SVG KHÔNG nằm trong danh sách này — có chủ đích.
 *
 * SVG là tài liệu XML: nó chứa được `<script>`, `<foreignObject>` và handler
 * `onload`. Một file .svg lưu trong uploads/ rồi phục vụ qua express.static sẽ
 * chạy JavaScript trên chính origin của API — đọc được cookie, gọi được API
 * thay mặt người dùng. Đây là stored XSS kinh điển của mọi site cho upload ảnh.
 *
 * Nếu thực sự cần nhận SVG, truyền `allowedMimes: [...MIME_TYPES.IMAGE, "image/svg+xml"]`
 * ở đúng route đó VÀ bắt buộc rasterise qua sharp trước khi lưu — không bao giờ
 * lưu rồi phục vụ lại file SVG gốc.
 */
const IMAGE_MIMES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"];

const DOCUMENT_MIMES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
];

const ALL_ALLOWED_MIMES = [...IMAGE_MIMES, ...DOCUMENT_MIMES];

// ─── Storage config ──────────────────────────────────────────────────────────

/** Memory storage — file nằm trong buffer, không ghi disk */
const memoryStorage = multer.memoryStorage();

/**
 * Đuôi file được suy ra từ MIME ĐÃ ĐƯỢC DUYỆT, không lấy từ tên file người dùng gửi.
 *
 * Lấy đuôi từ `file.originalname` cho phép kẻ tấn công gửi một PNG hợp lệ tên
 * `payload.html`: file qua được fileFilter (mimetype image/png) nhưng nằm trên
 * disk với đuôi .html, và express.static sẽ phục vụ nó với
 * `Content-Type: text/html` → stored XSS. Đuôi phải do server quyết định.
 */
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "text/csv": ".csv",
  "text/plain": ".txt",
};

/** Đuôi an toàn cho một MIME đã duyệt; `.bin` khi không nhận diện được. */
export function safeExtensionFor(mimetype: string): string {
  return MIME_TO_EXT[mimetype] ?? ".bin";
}

/** Disk storage — ghi file ra uploads/ với tên unique do server sinh */
const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.resolve(process.cwd(), env.UPLOAD_DIR));
  },
  filename: (_req, file, cb) => {
    // Tên hoàn toàn do server sinh: không path traversal, không null byte,
    // không đuôi kép (`x.png.html`), không unicode gây nhầm lẫn.
    cb(null, `${uuidv4()}${safeExtensionFor(file.mimetype)}`);
  },
});

// ─── File filter ─────────────────────────────────────────────────────────────

/**
 * Đuôi file nguy hiểm — chặn ngay cả khi MIME do client khai báo trông hợp lệ.
 * Client tự đặt Content-Type nên MIME một mình không đủ tin cậy.
 */
const DANGEROUS_EXT =
  /\.(html?|xhtml|svgz?|xml|js|mjs|cjs|jsx|ts|php\d?|phtml|phar|asp|aspx|jsp|jspx|cgi|pl|py|rb|sh|bash|exe|dll|bat|cmd|com|scr|msi|jar|hta|vbs|wsf|ps1|htaccess|htpasswd|config)$/i;

function createFileFilter(allowedMimes: string[]) {
  return (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    // MIME do client khai báo phải nằm trong allowlist.
    if (!allowedMimes.includes(file.mimetype)) {
      cb(new ValidationError(`File type "${file.mimetype}" không được hỗ trợ`));
      return;
    }

    const name = file.originalname ?? "";

    // Null byte trong tên file — thủ thuật cũ để cắt ngắn đường dẫn ở tầng C.
    if (name.includes("\0")) {
      cb(new ValidationError("Tên file không hợp lệ"));
      return;
    }

    // Kiểm tra MỌI đuôi, không chỉ đuôi cuối: `evil.php.png` bị chặn.
    const segments = name.toLowerCase().split(".").slice(1);
    if (segments.some((seg) => DANGEROUS_EXT.test(`.${seg}`))) {
      cb(new ValidationError("Định dạng file không được phép"));
      return;
    }

    cb(null, true);
  };
}

// ─── Multer instances ────────────────────────────────────────────────────────

export interface UploadOptions {
  /** Lưu trên memory (buffer) hay disk. Default: "memory" */
  storage?: "memory" | "disk";
  /** Max file size. Default: env.MAX_FILE_SIZE */
  maxSize?: string;
  /** Allowed MIME types. Default: images + documents */
  allowedMimes?: string[];
}

function createMulter(options: UploadOptions = {}) {
  const {
    storage = "memory",
    maxSize = env.MAX_FILE_SIZE,
    allowedMimes = ALL_ALLOWED_MIMES,
  } = options;

  return multer({
    storage: storage === "disk" ? diskStorage : memoryStorage,
    limits: {
      fileSize: parseSize(maxSize),
      // Không có các giới hạn dưới đây, một request multipart với hàng nghìn
      // field hoặc file rỗng vẫn tiêu hết RAM/CPU dù fileSize đã bị chặn.
      files: 20,
      fields: 50,
      fieldNameSize: 200,
      fieldSize: 1024 * 1024,
      parts: 100,
      headerPairs: 100,
    },
    fileFilter: createFileFilter(allowedMimes),
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Upload 1 file */
export function uploadSingle(fieldName: string, options?: UploadOptions) {
  return createMulter(options).single(fieldName);
}

/** Upload nhiều file cùng field */
export function uploadMultiple(fieldName: string, maxCount = 5, options?: UploadOptions) {
  return createMulter(options).array(fieldName, maxCount);
}

/** Upload nhiều fields khác nhau */
export function uploadFields(fields: multer.Field[], options?: UploadOptions) {
  return createMulter(options).fields(fields);
}

/** Chỉ cho phép upload ảnh */
export function uploadImage(fieldName: string, options?: Omit<UploadOptions, "allowedMimes">) {
  return createMulter({ ...options, allowedMimes: IMAGE_MIMES }).single(fieldName);
}

/** Chỉ cho phép upload document */
export function uploadDocument(fieldName: string, options?: Omit<UploadOptions, "allowedMimes">) {
  return createMulter({ ...options, allowedMimes: DOCUMENT_MIMES }).single(fieldName);
}

/** Preset constants cho reuse */
export const MIME_TYPES = {
  IMAGE: IMAGE_MIMES,
  DOCUMENT: DOCUMENT_MIMES,
  ALL: ALL_ALLOWED_MIMES,
} as const;
