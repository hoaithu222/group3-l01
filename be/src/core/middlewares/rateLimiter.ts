import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";
import type { Request } from "express";
import { ErrorCode } from "../utils/error.codes";
import { makeRateLimitStore } from "./rate-limit-store";

/**
 * Helper tạo rate-limit response theo format chuẩn của errorHandler:
 * { success, error: { code, message }, timestamp }
 */
function rateLimitMessage(message: string) {
  return {
    success: false,
    error: {
      code: ErrorCode.RATE_001,
      message,
    },
    timestamp: new Date().toISOString(),
  };
}

/*
 * Bộ đếm của mọi limiter dưới đây nằm trên REDIS khi Redis sẵn sàng (đúng khi chạy nhiều instance — SEC-06),
 * và rơi về bộ nhớ tiến trình khi Redis chưa sẵn sàng/lỗi (dev không phụ thuộc Redis; production suy giảm
 * thay vì bỏ trống giới hạn) — xem `ResilientRateLimitStore`. Khoá Redis: `<REDIS_KEY_PREFIX>rl:<tên>:<ip|user>`.
 */

/**
 * Rate limiter toàn cục: 600 req / 60 giây mỗi IP.
 * Chỉ chặn lạm dụng ở tầng hạ tầng — giới hạn nghiệp vụ thật dùng
 * `apiLimiter`/`scopeLimiter` theo user. Bỏ qua health-check/metrics để
 * monitoring không bao giờ bị 429.
 */
export const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  store: makeRateLimitStore("rl:global:"),
  skip: (req: Request) => req.path === "/api/health" || req.path === "/api/health/live" || req.path === "/metrics",
  message: rateLimitMessage("Quá nhiều yêu cầu từ IP này, vui lòng thử lại sau"),
});

/**
 * Rate limiter chung cho auth (10 req / 15 phút mỗi IP, MỘT bộ đếm cho mọi route dùng nó, đếm cả request thành công).
 *
 * ⚠ Module `auth`/`users` KHÔNG còn dùng cái này: một bộ đếm dùng chung cho login/register/quên mật khẩu/đổi mật khẩu/... khiến
 * văn phòng chung IP bị 429 cả nhóm chỉ sau vài lượt đăng nhập ĐÚNG. Dùng các limiter tách theo endpoint bên dưới
 * (`loginLimiter`, `registerLimiter`, ...); chống dò mật khẩu một tài khoản là việc của `PasswordAttemptGuard` (khoá theo tài khoản).
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  store: makeRateLimitStore("rl:auth:"),
  message: rateLimitMessage("Quá nhiều lần thử đăng nhập, vui lòng thử lại sau 15 phút"),
});

/**
 * Rate limiter cho API nghiệp vụ: 300 req / 60 giây theo user (fallback IP khi chưa auth).
 */
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  store: makeRateLimitStore("rl:api:"),
  keyGenerator: (req: Request) => req.user?.id ?? req.ip ?? "unknown",
  message: rateLimitMessage("Quá nhiều yêu cầu API, vui lòng thử lại sau"),
});

/**
 * Rate limiter cho `GET /auth/nonce`: 300 req / 5 phút mỗi IP — mỗi lượt đăng nhập/đăng ký (kể cả gõ sai rồi thử lại) lấy 1 nonce, nên
 * phải đủ rộng cho văn phòng chung IP (60 từng chặn cả nhóm khi ~60 người vào app cùng lúc). Nonce tự nó không phải bí mật; hạn mức chỉ
 * để chặn lấp đầy Redis (TTL 120 s), còn `globalLimiter` vẫn giữ trần 600 req/phút/IP.
 */
export const nonceLimiter = rateLimit({
  windowMs: 5 * 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  store: makeRateLimitStore("rl:nonce:"),
  message: rateLimitMessage("Bạn yêu cầu nonce quá nhanh, vui lòng thử lại sau"),
});

// ── Limiter cho route xác thực — TÁCH theo endpoint (rà soát auth BE 2026-09-25) ─────────────────────────────────────────────────

const AUTH_WINDOW_MS = 15 * 60_000;

export interface AuthLimiterOptions {
  /** Số request tối đa trong cửa sổ. */
  max: number;
  /**
   * `true` = CHỈ đếm request thất bại (status ≥ 400): request thành công không tốn hạn mức. Dùng cho endpoint kiểu "nhập bí mật"
   * (đăng nhập, đặt lại mật khẩu): người dùng thật gõ đúng không bao giờ bị chặn vì người khác cùng IP; IP chỉ chặn credential-stuffing
   * (nhiều lần SAI), còn dò mật khẩu một tài khoản do `PasswordAttemptGuard` chặn theo tài khoản.
   */
  failedOnly?: boolean;
  /** `"user"` = khoá theo `req.user.id` (route ĐÃ xác thực — chung IP không tranh hạn mức của nhau); mặc định theo IP. */
  keyBy?: "ip" | "user";
  message: string;
}

/**
 * Tạo limiter cho 1 endpoint xác thực: bộ đếm RIÊNG (khoá Redis `<REDIS_KEY_PREFIX>rl:auth:<name>:<ip|user>`), cửa sổ 15 phút.
 * `name` phải duy nhất theo endpoint — hai limiter trùng `name` sẽ dùng chung bộ đếm.
 */
export function createAuthLimiter(name: string, options: AuthLimiterOptions): RateLimitRequestHandler {
  return rateLimit({
    windowMs: AUTH_WINDOW_MS,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    skipSuccessfulRequests: options.failedOnly ?? false,
    store: makeRateLimitStore(`rl:auth:${name}:`),
    ...(options.keyBy === "user" && {
      keyGenerator: (req: Request) => req.user?.id ?? req.ip ?? "unknown",
    }),
    message: rateLimitMessage(options.message),
  });
}

/** `POST /auth/login` — 30 lần đăng nhập SAI / 15 phút / IP (đăng nhập đúng không tốn hạn mức). */
export const loginLimiter = createAuthLimiter("login", {
  max: 30,
  failedOnly: true,
  message: "Quá nhiều lần đăng nhập thất bại từ địa chỉ này, vui lòng thử lại sau 15 phút",
});

/** `POST /auth/biometric/login` — 30 lần thất bại / 15 phút / IP (còn giới hạn riêng theo credential ở route). */
export const biometricLoginLimiter = createAuthLimiter("biometric-login", {
  max: 30,
  failedOnly: true,
  message: "Quá nhiều lần đăng nhập sinh trắc học thất bại, vui lòng thử lại sau 15 phút",
});

/** `POST /auth/register` — 10 lượt đăng ký / 15 phút / IP (đếm cả thành công: lạm dụng ở đây là tạo tài khoản hàng loạt). */
export const registerLimiter = createAuthLimiter("register", {
  max: 10,
  message: "Quá nhiều lượt đăng ký từ địa chỉ này, vui lòng thử lại sau 15 phút",
});

/** `POST /auth/forgot-password` — 10 yêu cầu / 15 phút / IP (đếm cả thành công; theo email còn có `scopeLimiter` ở route). */
export const forgotPasswordLimiter = createAuthLimiter("forgot-password", {
  max: 10,
  message: "Quá nhiều yêu cầu đặt lại mật khẩu, vui lòng thử lại sau 15 phút",
});

/** `POST /auth/reset-password` — 10 lần thất bại (token sai/hết hạn) / 15 phút / IP. */
export const resetPasswordLimiter = createAuthLimiter("reset-password", {
  max: 10,
  failedOnly: true,
  message: "Quá nhiều lần đặt lại mật khẩu thất bại, vui lòng thử lại sau 15 phút",
});

/** `POST /me/delete-cancel` (không cần token) — 10 lần thất bại / 15 phút / IP. */
export const deleteCancelLimiter = createAuthLimiter("delete-cancel", {
  max: 10,
  failedOnly: true,
  message: "Quá nhiều lần huỷ yêu cầu xoá thất bại, vui lòng thử lại sau 15 phút",
});

/**
 * Thao tác tài khoản ĐÃ xác thực (đổi mật khẩu, đăng xuất mọi nơi, xác minh email, bật sinh trắc học, yêu cầu xoá): 10 lượt / 15 phút
 * THEO NGƯỜI DÙNG (không theo IP). Đặt SAU `authenticateToken`. Sai mật khẩu ở các thao tác này còn bị `PasswordAttemptGuard("reauth")` khoá.
 */
export const accountActionLimiter = createAuthLimiter("account", {
  max: 10,
  keyBy: "user",
  message: "Bạn thao tác quá nhiều lần, vui lòng thử lại sau 15 phút",
});
