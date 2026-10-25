/**
 * Kiểu dữ liệu `GET /capabilities` — cờ tính năng + hạn mức BE công bố cho client.
 *
 * `features` là map phẳng `{ tên cờ: { enabled, available } }` — `enabled` là
 * cờ VẬN HÀNH (admin bật/tắt qua `system-config`), `available` là cờ BUILD
 * (tính năng có tồn tại trên bản deploy này hay chưa, vd Job AI đang ⏸ D-13).
 * Registry/dashboard chỉ cần đọc `enabled` — `available` dành cho UI cấu hình
 * (ẩn hẳn toggle của tính năng chưa tồn tại thay vì hiện toggle luôn tắt).
 */
export interface CapabilityFeature {
  enabled: boolean;
  available: boolean;
  /** Chỉ có ở phân hệ bị chặn cứng theo quyết định dự án (D-13: `ai`, `ai-assistant`, `knowledge`). */
  blocked?: 'D-13';
}

export interface Capabilities {
  version: string;
  /** Băm các cặp `key:version` của mọi khoá `SystemConfig` — đổi khi admin sửa cấu hình. */
  configVersion?: string;
  features: Record<string, CapabilityFeature>;
  /** Hạn mức vận hành (rate limit, kích thước tối đa…) — hình dạng do BE quyết định theo phase. */
  limits: Record<string, unknown>;
  upload: {
    maxFileBytes: number;
    allowedMime: string[];
    signedUrlTtlSeconds: number;
  };
}
