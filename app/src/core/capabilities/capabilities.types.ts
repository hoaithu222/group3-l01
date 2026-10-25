/**
 * Hợp đồng `GET /capabilities` — xem `docs/plan/config-be.md` B8.
 *
 * Endpoint này là NGUỒN DUY NHẤT cho "phân hệ nào đang bật" và "giới hạn nào
 * đang áp dụng" ở backend. App KHÔNG tự đoán — cờ trong `.env` chỉ bật/tắt
 * MÀN HÌNH đăng nhập (`EXPO_PUBLIC_AUTH_ENABLED`), còn phân hệ nghiệp vụ
 * (Nhóm, Học…) do CHÍNH backend quyết định qua `features`.
 */

/** Trạng thái một phân hệ. `available=false` = chưa có mã ở backend (khoá cứng, không phải do admin tắt). */
export interface CapabilityFeature {
  enabled: boolean;
  available: boolean;
  /** Chặn cứng theo quyết định dự án (D-13: AI) — khác `available=false` (chưa có mã) và `enabled=false` (admin tắt). */
  blocked?: 'D-13';
}

/**
 * Giới hạn nghiệp vụ (độ dài tên, số ký tự tin nhắn, dung lượng tệp…).
 *
 * ⚠️ CỐ Ý để `Record<string, unknown>` thay vì chép lại từng trường của
 * `LIMITS` bên backend (`config-be.md` §3.2) — bảng đó dài, chia theo phase, và
 * đổi liên tục khi mở phase mới. Ép kiểu chi tiết ở đây thì MỖI lần backend
 * thêm một nhóm giới hạn mới, app lại phải sửa theo dù chưa dùng tới. Chỗ nào
 * THẬT SỰ cần đọc một giới hạn cụ thể thì ép kiểu ngay tại chỗ dùng, có ghi chú.
 */
export type CapabilityLimits = Record<string, unknown>;

export interface Capabilities {
  /** Phiên bản app ở backend (`APP_VERSION`) — dùng để gợi ý cập nhật, chưa dùng ở Phase 0. */
  version: string;
  /**
   * Băm vector phiên bản các khoá cấu hình (cũng là `ETag`) — p0-07. `config:updated` mang giá trị này: khác bản đang giữ thì
   * làm mới. ⚠️ `optional`: BE cũ (trước p0-07) chưa trả.
   */
  configVersion?: string;
  /** Giờ máy chủ lúc trả (ISO) — để tính lệch đồng hồ (`useClockOffsetStore`). ⚠️ `optional` như trên. */
  serverNow?: string;
  /** Khoá = tên phân hệ (`communication`, `study`, …) — khớp `featureFlag` của `ModuleConfig`. */
  features: Record<string, CapabilityFeature>;
  limits: CapabilityLimits;
  upload: {
    maxFileBytes: number;
    allowedMime: readonly string[];
    signedUrlTtlSeconds: number;
  };
  /**
   * Cờ + ngưỡng riêng của đăng nhập sinh trắc học và khoá ứng dụng (p0-13,
   * `be.md` §9). ⚠️ `optional`, KHÔNG bắt buộc: backend cũ (trước p0-13) chưa
   * trả khối này, và một `Capabilities` thiếu `auth` không được coi là lỗi hợp
   * đồng — mọi nơi đọc trường này đều phải tự lo giá trị mặc định an toàn
   * (`useBiometricCapabilityFlag`, `AppLockBoundary`).
   */
  auth?: {
    biometricLogin?: { enabled: boolean };
    appLock?: { enabled: boolean; lockAfterBackgroundSeconds: number };
  };
}
