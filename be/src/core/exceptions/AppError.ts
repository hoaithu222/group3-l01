/**
 * @file AppError.ts
 * @description Hierarchy of typed application errors.
 *
 * Design decisions:
 *  - `AppError` is the single base class — all thrown errors extend it.
 *  - `errorCode` links to the `ErrorCode` dictionary so consumers never
 *    hard-code raw strings.
 *  - `details` carries structured validation / context data forwarded to
 *    the error response body.
 *  - `stack` is always captured (Error.captureStackTrace when available).
 *
 * Usage:
 *   // Throw a typed subclass (most common)
 *   throw new NotFoundError("Người dùng không tồn tại");
 *
 *   // Throw with a specific code + details
 *   throw new AppError("Custom message", 409, ErrorCode.RES_002, { field: "email" });
 */

import { HttpStatusCodeType } from "../constants";
import { ErrorCode, ErrorCodeType } from "../utils/error.codes";

// ─────────────────────────────────────────────────────────────────────────────
// Base
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base class for all application-level errors.
 * Captures the stack trace and surfaces a typed `errorCode`.
 */
export class AppError extends Error {
  /** HTTP status code sent in the response */
  public readonly statusCode: HttpStatusCodeType;

  /**
   * Machine-readable code from the `ErrorCode` dictionary.
   * Passed through to the API response so clients can branch on it.
   */
  public readonly errorCode: ErrorCodeType;

  /**
   * Optional structured details (e.g. Zod field-level validation errors).
   * Forwarded as-is in the `error.details` field of the response.
   */
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: HttpStatusCodeType = 500,
    errorCode: ErrorCodeType = ErrorCode.SYS_500,
    details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;

    // Maintain correct prototype chain (required after `extends Error` in TS)
    Object.setPrototypeOf(this, new.target.prototype);

    // Capture V8 stack trace, omitting the constructor frame
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Legacy alias so existing code that reads `err.code` keeps working.
   * @deprecated Prefer `errorCode`.
   */
  get code(): ErrorCodeType {
    return this.errorCode;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 400 – Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 400 Bad Request — request body / query / params failed schema validation.
 * Pass Zod / Joi field errors in `details`.
 */
export class ValidationError extends AppError {
  constructor(message = "Dữ liệu không hợp lệ", details?: unknown) {
    super(message, 400, ErrorCode.VAL_001, details);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 401 – Unauthorized
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 401 Unauthorized — missing or invalid authentication credentials.
 * Pass a specific `errorCode` to distinguish expired vs invalid token.
 *
 * @example
 *   throw new UnauthorizedError("Token đã hết hạn", ErrorCode.AUTH_003);
 */
export class UnauthorizedError extends AppError {
  constructor(message = "Không có quyền truy cập", errorCode: ErrorCodeType = ErrorCode.AUTH_002) {
    super(message, 401, errorCode);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 403 – Forbidden
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 403 Forbidden — authenticated but not authorised for this resource / role.
 */
export class ForbiddenError extends AppError {
  constructor(message = "Bạn không có quyền truy cập") {
    super(message, 403, ErrorCode.AUTH_005);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 404 – Not Found
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 404 Not Found — requested resource does not exist.
 */
export class NotFoundError extends AppError {
  constructor(message = "Không tìm thấy") {
    super(message, 404, ErrorCode.RES_001);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 409 – Conflict
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 409 Conflict — resource already exists or violates a uniqueness constraint.
 */
export class ConflictError extends AppError {
  constructor(message = "Dữ liệu đã tồn tại") {
    super(message, 409, ErrorCode.RES_002);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 409 – Version conflict / Idempotency
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 409 — `expectedVersion` lệch với dữ liệu hiện tại.
 * `details.currentVersion` để client tải lại trước khi thử lại.
 */
export class VersionConflictError extends AppError {
  constructor(currentVersion: number, message = "Dữ liệu đã thay đổi, vui lòng tải lại") {
    super(message, 409, ErrorCode.RES_003, { currentVersion });
  }
}

/**
 * 409 — cùng `Idempotency-Key` đang được xử lý (request trước chưa xong).
 */
export class IdempotencyInProgressError extends AppError {
  constructor() {
    super("Yêu cầu trùng đang được xử lý", 409, ErrorCode.RES_004);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 429 – Too Many Requests
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 429 Too Many Requests — triggered by rate-limiter middleware.
 */
export class TooManyRequestsError extends AppError {
  constructor(message = "Quá nhiều yêu cầu, vui lòng thử lại sau") {
    super(message, 429, ErrorCode.RATE_001);
  }
}

/**
 * 429 — giới hạn theo scope nghiệp vụ (vd: nhắn tin quá nhanh), kèm `retryAfterSeconds`.
 */
export class ScopeRateLimitError extends AppError {
  constructor(retryAfterSeconds: number, code: ErrorCodeType = ErrorCode.RATE_002) {
    super("Bạn thao tác quá nhanh, vui lòng thử lại sau", 429, code, { retryAfterSeconds });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 403 – Account locked / pending deletion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 403 — tài khoản bị khoá (AUTH_011) hoặc đang chờ xoá (AUTH_012).
 */
export class AccountLockedError extends AppError {
  /** `details` tuỳ chọn — AUTH_012 kèm `{ deletionGraceUntil }` để client biết ngày tự ẩn danh hoá (xem `modules/auth/services/account-lock.ts`). */
  constructor(code: ErrorCodeType = ErrorCode.AUTH_011, details?: unknown) {
    super(
      code === ErrorCode.AUTH_012 ? "Tài khoản đang chờ xoá" : "Tài khoản đã bị khoá",
      403,
      code,
      details
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Access control theo scope (p0-02)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 404 — scope không tồn tại HOẶC user không có quyền thấy nó. Cố tình dùng
 * cùng 1 message trung tính cho cả 2 trường hợp (be.md §5.2) để không lộ sự
 * tồn tại của tài nguyên riêng tư qua khác biệt thông điệp lỗi.
 */
export class ScopeNotFoundError extends AppError {
  constructor(message = "Không tìm thấy hoặc bạn không có quyền truy cập") {
    super(message, 404, ErrorCode.PERM_404);
  }
}

/**
 * 403 — user thấy scope (visible=true) nhưng thiếu action cụ thể, hoặc vai
 * trò không đủ bậc. `code` chọn theo loại scope (`PERM_001`..`PERM_006`,
 * be.md §8) — truyền tường minh từ nơi gọi (`permission.service.ts`,
 * `middlewares.ts`), không suy luận lại trong class này.
 */
export class ScopeForbiddenError extends AppError {
  constructor(message: string, code: ErrorCodeType = ErrorCode.PERM_001) {
    super(message, 403, code);
  }
}

/**
 * 503 — `ScopeResolver.resolve()` ném lỗi (DB lỗi, timeout) khi cache miss.
 * Fail-closed: KHÔNG cho qua như thể có quyền — be.md §5.1 bước 5 phân biệt
 * rõ "Redis lỗi" (bỏ cache, gọi resolver trực tiếp — vẫn OK) với "resolver
 * lỗi" (không có cách nào biết quyền thật → phải chặn).
 */
export class PermissionResolverError extends AppError {
  constructor(message = "Dịch vụ tạm thời không khả dụng, vui lòng thử lại") {
    super(message, 503, ErrorCode.SYS_503);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// User deletion / anonymization (p0-01, D-02) — be.md §8
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 409 — user vẫn là OWNER của ít nhất 1 workspace có thành viên khác. Ném bởi
 * guard đăng ký qua `registerOwnershipGuard()` (`core/permission/ownership-guard.ts`)
 * — registry rỗng ở Phase 0 nên lỗi này chưa thể xảy ra cho tới khi p1-01
 * đăng ký guard thật.
 */
export class OwnershipBlocksDeletionError extends AppError {
  constructor(
    message = "Bạn đang là chủ sở hữu nhóm, hãy chuyển quyền trước khi xoá tài khoản"
  ) {
    super(message, 409, ErrorCode.USER_010);
  }
}

/**
 * 409 — `/me/delete-cancel` hoặc `/admin/users/:id/anonymize/cancel` gọi khi
 * tài khoản không ở `PENDING_DELETION` hoặc `deletionGraceUntil` đã trôi qua
 * (job `user.anonymize` có thể đã ẩn danh hoá trước khi request huỷ tới).
 */
export class DeletionNotPendingError extends AppError {
  constructor(
    message = "Tài khoản không ở trạng thái chờ xoá hoặc đã hết thời gian huỷ"
  ) {
    super(message, 409, ErrorCode.USER_011);
  }
}

/**
 * 403 — `/admin/users/:id/anonymize` với `mode: "NOW"` nhưng actor không có
 * role `admin` (mặc dù đã qua `requirePermission("user:delete")` — kiểm lại
 * ở tầng service theo đúng be.md §4/§8, phòng khi ma trận quyền role đổi sau này).
 */
export class AnonymizeNowForbiddenError extends AppError {
  constructor(message = "Chỉ quản trị viên cấp cao được ẩn danh ngay lập tức") {
    super(message, 403, ErrorCode.USER_012);
  }
}

/** 400 — `confirmEmail` gửi lên không khớp email của tài khoản mục tiêu (mode NOW). */
export class ConfirmEmailMismatchError extends AppError {
  constructor(message = "Email xác nhận không khớp") {
    super(message, 400, ErrorCode.USER_013);
  }
}

/** 400 — admin gọi `/admin/users/:id/anonymize` với `id` là chính mình. */
export class SelfAnonymizeForbiddenError extends AppError {
  constructor(message = "Không thể tự xoá tài khoản của chính mình từ trang quản trị") {
    super(message, 400, ErrorCode.USER_014);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Devices / Push / Notifications (p0-06)
// ─────────────────────────────────────────────────────────────────────────────

/** 400 — thông tin thiết bị không hợp lệ (đã qua Zod nhưng sai ràng buộc nghiệp vụ, vd APNS_VOIP thiếu environment). */
export class DeviceInvalidError extends AppError {
  constructor(message = "Thông tin thiết bị không hợp lệ") {
    super(message, 400, ErrorCode.DEVICE_001);
  }
}

/** 404 — không tìm thấy thiết bị (`deviceId` không thuộc user hoặc chưa từng đăng ký). */
export class DeviceNotFoundError extends AppError {
  constructor(message = "Không tìm thấy thiết bị") {
    super(message, 404, ErrorCode.DEVICE_002);
  }
}

/** 503 — thiếu cấu hình FIREBASE_* / APNS_* hoặc cờ `push` đang tắt — `POST /admin/push/test` không gửi được gì để kiểm tra. */
export class PushNotConfiguredError extends AppError {
  constructor(message = "Dịch vụ thông báo đẩy chưa được cấu hình") {
    super(message, 503, ErrorCode.PUSH_001);
  }
}

/** 404 — user mục tiêu không có `DeviceToken` hoạt động nào (FCM lẫn APNs VoIP). */
export class PushNoDeviceError extends AppError {
  constructor(message = "Người dùng chưa có thiết bị nhận thông báo") {
    super(message, 404, ErrorCode.PUSH_002);
  }
}

/** 404 — thông báo không tồn tại hoặc không thuộc về user gọi API (`markRead`). */
export class NotificationNotFoundError extends AppError {
  constructor(message = "Không tìm thấy thông báo") {
    super(message, 404, ErrorCode.NOTI_002);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Job / Queue admin (p0-04)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 404 — không tìm thấy job trong hàng đợi BullMQ (`jobId` đã hoàn tất và bị
 * dọn `removeOnComplete`, hoặc chưa từng tồn tại).
 */
export class JobNotFoundError extends AppError {
  constructor(message = "Không tìm thấy job trong hàng đợi") {
    super(message, 404, ErrorCode.JOB_001);
  }
}

/**
 * 409 — chỉ được `retry()` job đang ở trạng thái `failed`.
 */
export class JobNotRetryableError extends AppError {
  constructor(message = "Job không ở trạng thái lỗi nên không thể chạy lại") {
    super(message, 409, ErrorCode.JOB_002);
  }
}

/**
 * 409 — chỉ được yêu cầu chạy lại (`requeue`) `OutboxEvent` đang ở trạng thái `FAILED`.
 */
export class OutboxEventNotFailedError extends AppError {
  constructor(message = "Sự kiện outbox không ở trạng thái thất bại") {
    super(message, 409, ErrorCode.JOB_003);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// System config / feature flags (p0-07)
// ─────────────────────────────────────────────────────────────────────────────

/** 404 — khoá không tồn tại trong `SYSTEM_CONFIG_REGISTRY`. */
export class SystemConfigNotFoundError extends AppError {
  constructor(message = "Không tìm thấy khoá cấu hình") {
    super(message, 404, ErrorCode.CFG_001);
  }
}

/**
 * 400 — giá trị 1 field vượt `floor`/`ceil` khai trong registry. `details`
 * mang `{ path, floor, ceil }` để admin UI biết chỗ nào sai — service KHÔNG
 * tự clamp khi ghi, admin phải thấy lỗi rồi tự sửa (be.md §5.1 bước 3).
 */
export class SystemConfigOutOfRangeError extends AppError {
  constructor(details: { path: string; floor?: number; ceil?: number }) {
    super("Giá trị nằm ngoài giới hạn cho phép", 400, ErrorCode.CFG_002, details);
  }
}

/**
 * 409 — bật cờ module chưa có mã (`AVAILABLE_MODULES`) hoặc thiếu cấu hình hạ
 * tầng bắt buộc (vd voice/meeting thiếu LiveKit env). `details.reason` phân
 * biệt 2 trường hợp cho client.
 */
export class FeatureNotAvailableError extends AppError {
  constructor(reason: "not-available" | "missing-env" = "not-available") {
    super(
      "Không thể bật tính năng: phân hệ chưa sẵn sàng hoặc thiếu cấu hình hạ tầng",
      409,
      ErrorCode.CFG_003,
      { reason }
    );
  }
}

/** 422 — bật cờ AI/ai-assistant/knowledge trong khi D-13 còn hiệu lực. */
export class FeatureBlockedError extends AppError {
  constructor(message = "Tính năng AI đang tạm dừng theo quyết định dự án") {
    super(message, 422, ErrorCode.CFG_004);
  }
}

/** 404 — `requireFeature(m)` chặn route của 1 phân hệ đang tắt (runtime). */
export class FeatureDisabledError extends AppError {
  constructor(message = "Tính năng chưa được bật") {
    super(message, 404, ErrorCode.CFG_005);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 501 – Not Implemented
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 501 Not Implemented — feature/integration is present in code but not
 * configured (e.g. missing env keys, adapter in stub mode).
 * Distinct from 502 (external service reachable but failed).
 */
export class NotImplementedError extends AppError {
  constructor(message = "Chức năng chưa được cấu hình") {
    super(message, 501, ErrorCode.SYS_501);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 502 – Bad Gateway
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 502 Bad Gateway — upstream dependency (S3, Cloudinary, SMTP…) did not respond.
 */
export class BadGatewayError extends AppError {
  constructor(message = "Dịch vụ phụ thuộc không phản hồi") {
    super(message, 502, ErrorCode.SYS_502);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OTP Exceptions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * OTP_001 — OTP không tồn tại hoặc đã hết hạn.
 * Sử dụng khi: không tìm thấy OTP trong Redis (chưa gửi / đã hết hạn / đã dùng).
 */
export class OtpExpiredError extends AppError {
  constructor(message = "Mã OTP không tồn tại hoặc đã hết hạn, vui lòng yêu cầu mã mới") {
    super(message, 400, ErrorCode.OTP_001);
  }
}

/**
 * OTP_002 — Mã OTP sai (còn lượt thử).
 * @param remainingAttempts - Số lần thử còn lại để hiển thị cho người dùng.
 * Sử dụng khi: người dùng nhập sai mã, attempts < MAX_ATTEMPTS.
 */
export class OtpInvalidError extends AppError {
  public readonly remainingAttempts: number;
  constructor(remainingAttempts: number) {
    super(`Mã OTP không đúng. Còn ${remainingAttempts} lần thử`, 400, ErrorCode.OTP_002, {
      remainingAttempts,
    });
    this.remainingAttempts = remainingAttempts;
  }
}

/**
 * OTP_003 — OTP bị khoá do nhập sai quá 5 lần.
 * Sử dụng khi: attempts >= MAX_ATTEMPTS, OTP đã bị xoá.
 * Người dùng PHẢI yêu cầu mã mới.
 */
export class OtpBlockedError extends AppError {
  constructor(message = "Mã OTP đã bị khoá do nhập sai quá nhiều lần. Vui lòng yêu cầu mã mới") {
    super(message, 400, ErrorCode.OTP_003);
  }
}

/**
 * OTP_004 — Đang trong thời gian cooldown (60 giây giữa 2 lần gửi).
 * @param cooldownSeconds - Số giây còn lại của cooldown.
 * Sử dụng khi: người dùng yêu cầu gửi lại quá sớm.
 */
export class OtpCooldownError extends AppError {
  public readonly cooldownSeconds: number;
  constructor(cooldownSeconds: number) {
    super(
      `Vui lòng đợi ${cooldownSeconds} giây trước khi yêu cầu mã OTP mới`,
      429,
      ErrorCode.OTP_004,
      { cooldownSeconds }
    );
    this.cooldownSeconds = cooldownSeconds;
  }
}

/**
 * OTP_005 — Vượt quá giới hạn gửi OTP trong 1 giờ (10 lần).
 * Sử dụng khi: rate limit counter >= MAX_SENDS_PER_HOUR.
 */
export class OtpRateLimitError extends AppError {
  constructor(message = "Bạn đã yêu cầu quá nhiều mã OTP trong 1 giờ. Vui lòng thử lại sau") {
    super(message, 429, ErrorCode.OTP_005);
  }
}
