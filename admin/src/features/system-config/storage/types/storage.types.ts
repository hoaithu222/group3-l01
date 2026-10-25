/**
 * Kiểu dữ liệu tab "Lưu trữ" — khớp `AdminStorageService` phía BE
 * (`be/src/modules/admin-storage`, p0-05 be.md §4).
 */

/** Một nhóm số liệu — `key` là giá trị enum BE (`scope` / `kind` / `status`). */
export interface StorageBucket {
  key: string;
  count: number;
  bytes: number;
}

/** `GET /admin/storage/stats`. `totals`/`byScope`/`byKind` KHÔNG tính tệp `DELETED`; `byStatus` có. */
export interface StorageStats {
  totals: { bytes: number; count: number };
  byScope: StorageBucket[];
  byKind: StorageBucket[];
  byStatus: StorageBucket[];
  /** Ước lượng tệp quá hạn chưa gắn nội dung nào (BE quét tối đa 5000 bản ghi). */
  orphan: { count: number; bytes: number };
  /** `local` | `s3` | `cloudinary` — chỉ đọc, đổi bằng biến môi trường. */
  storageType: string;
}

/** `POST /admin/storage/cleanup` — bắt buộc `reason` (≥ 10 ký tự, khớp `reasonSchema` BE). */
export interface StorageCleanupPayload {
  reason: string;
}

export interface StorageCleanupResult {
  /** `assets.cleanup:manual:<yyyyMMddHH>` (UTC) — mỗi giờ tối đa một lượt thủ công. */
  jobId: string;
  /** `true` = giờ này đã có lượt thủ công, BE KHÔNG xếp thêm và KHÔNG ghi nhật ký. */
  alreadyQueued: boolean;
}

/** Giới hạn một loại tệp — hình dạng `LIMITS.upload.kinds[kind]` phía BE. */
export interface UploadKindLimit {
  maxBytes: number;
  mime: string[];
  /** Chỉ `VOICE`. */
  maxSeconds?: number;
}
