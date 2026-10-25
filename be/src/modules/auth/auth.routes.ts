import { Router } from "express";
import {
  validateBody,
  validateParams,
  validateQuery,
  authenticateToken,
  optionalAuth,
  loginLimiter,
  biometricLoginLimiter,
  createAuthLimiter,
  registerLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
  accountActionLimiter,
  nonceLimiter,
  requireNonce,
  requireTrustedOrigin,
  scopeLimiter,
  requireSystemConfig,
} from "../../core/middlewares";
import { PasswordAttemptGuard } from "../../core/auth/password-attempt-guard";
import { AppError } from "../../core/exceptions";
import {
  loginSchema,
  firebaseLoginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "./dtos/auth.dto";
import { confirmEmailSchema } from "./dtos/verify-email.dto";
import { changePasswordSchema } from "./dtos/change-password.dto";
import {
  biometricEnrollSchema,
  biometricLoginSchema,
  credentialIdParamsSchema,
  revokeMineQuerySchema,
} from "./dtos/biometric.dto";
import { createAuthController } from "./controllers/auth.controller";
import { createSessionController } from "./controllers/session.controller";
import { createBiometricController } from "./controllers/biometric.controller";
import { AuthService } from "./services/auth.service";
import { SessionService } from "./services/session.service";
import { TokenIssuer } from "./services/token-issuer";
import { BiometricService } from "./services/biometric.service";
import { PrismaBiometricCredentialRepository } from "./repositories";
import { PrismaUserRepository } from "../users/repositories";
import { createDeviceService } from "../devices/public";
import { AuditService } from "../audit-log/audit-log.service";
import { objectIdSchema } from "../../shared/dto/common-schemas";
import { LIMITS } from "../../core/constants/limits";
import { ErrorCode, ErrorMessages } from "../../core/utils/error.codes";
import { z } from "zod";
import { createHash } from "crypto";

const router = Router();

// ── DI wiring ─────────────────────────────────────────────────────────────────
const userRepo = new PrismaUserRepository();
const sessionService = new SessionService();
const auditService = new AuditService();
const authService = new AuthService(userRepo, sessionService, createDeviceService(), {
  audit: auditService,
  // Khoá tạm theo TÀI KHOẢN sau nhiều lần đăng nhập sai (bổ sung cho limiter theo IP).
  loginGuard: new PasswordAttemptGuard("login"),
  // Đổi mật khẩu: đếm lần nhập sai "mật khẩu hiện tại" (chống dò bằng access token bị lộ).
  reauthGuard: new PasswordAttemptGuard("reauth"),
});
const authController = createAuthController(authService);
const sessionController = createSessionController(sessionService, auditService);

const biometricRepo = new PrismaBiometricCredentialRepository();
const tokenIssuer = new TokenIssuer(sessionService);
const biometricService = new BiometricService(
  biometricRepo,
  userRepo,
  tokenIssuer,
  new PasswordAttemptGuard("reauth")
);
const biometricController = createBiometricController(biometricService);

// ── Nonce chống replay (Part 2) — mount TRƯỚC các route auth khác ────────────

/**
 * @openapi
 * /auth/nonce:
 *   get:
 *     summary: Lấy nonce chống replay dùng 1 lần (login/register/biometric-login)
 *     tags: [Auth]
 */
router.get("/nonce", nonceLimiter, authController.getNonce);

// ── Public routes (rate-limited) ─────────────────────────────────────────────

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Đăng nhập
 *     tags: [Auth]
 */
router.post(
  "/login",
  loginLimiter,
  validateBody(loginSchema),
  requireNonce(),
  authController.login
);

/** `POST /auth/firebase-login` — 30 lần THẤT BẠI / 15 phút / IP (đăng nhập đúng không tốn hạn mức, như `loginLimiter`). */
const firebaseLoginLimiter = createAuthLimiter("firebase-login", {
  max: 30,
  failedOnly: true,
  message: "Quá nhiều lần đăng nhập thất bại từ địa chỉ này, vui lòng thử lại sau 15 phút",
});

/**
 * @openapi
 * /auth/firebase-login:
 *   post:
 *     summary: "Đăng nhập bằng mạng xã hội (Firebase ID token — Google)"
 *     description: "Body { idToken, nonce }. Chưa có tài khoản thì tạo mới (email đã xác minh, không mật khẩu); trùng email đã xác minh thì vào tài khoản đó. Lỗi: AUTH_022 token sai/hết hạn/đăng nhập cũ hơn 5 phút, AUTH_023 email chưa xác minh hoặc nhà cung cấp chưa hỗ trợ, AUTH_018 nonce."
 *     tags: [Auth]
 */
router.post(
  "/firebase-login",
  firebaseLoginLimiter,
  validateBody(firebaseLoginSchema),
  requireNonce(),
  authController.firebaseLogin
);

/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Đăng ký tài khoản mới
 *     tags: [Auth]
 */
router.post(
  "/register",
  registerLimiter,
  validateBody(registerSchema),
  requireNonce(),
  authController.register
);

// Refresh token nhận từ httpOnly cookie HOẶC body.refreshToken (app mobile).
const refreshBodySchema = z.object({ refreshToken: z.string().min(1).max(4096).optional() });

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     summary: Làm mới access token (cookie hoặc body.refreshToken)
 *     tags: [Auth]
 */
// `requireTrustedOrigin`: refresh bằng cookie là endpoint duy nhất xác thực CHỈ bằng cookie → chống CSRF.
router.post(
  "/refresh",
  requireTrustedOrigin(),
  validateBody(refreshBodySchema),
  authController.refreshToken
);

/**
 * @openapi
 * /auth/refresh-token:
 *   post:
 *     summary: Làm mới access token (deprecated — dùng /auth/refresh)
 *     tags: [Auth]
 *     deprecated: true
 */
router.post(
  "/refresh-token",
  requireTrustedOrigin(),
  validateBody(refreshBodySchema),
  authController.refreshToken
);

router.post(
  "/forgot-password",
  forgotPasswordLimiter,
  validateBody(forgotPasswordSchema),
  // Chống "bom" email đặt lại mật khẩu vào một hộp thư (theo email, đếm cả email không tồn tại nên không lộ tài khoản).
  scopeLimiter(
    "forgot-password",
    (req) => {
      const email = (req.body as { email?: string } | undefined)?.email;
      return email ? createHash("sha256").update(email).digest("hex").slice(0, 32) : null;
    },
    [{ max: 3, windowSeconds: 900 }]
  ),
  authController.forgotPassword
);
router.post(
  "/reset-password",
  resetPasswordLimiter,
  validateBody(resetPasswordSchema),
  authController.resetPassword
);

// ── Protected routes ─────────────────────────────────────────────────────────

/**
 * @openapi
 * /auth/me:
 *   get:
 *     summary: Hồ sơ người dùng hiện tại
 *     tags: [Auth]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/me", authenticateToken, authController.getMe);

/**
 * @openapi
 * /auth/profile:
 *   get:
 *     summary: Hồ sơ người dùng hiện tại (deprecated — dùng /auth/me)
 *     tags: [Auth]
 *     security: [{ BearerAuth: [] }]
 *     deprecated: true
 */
router.get("/profile", authenticateToken, authController.getProfile);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Đăng xuất phiên hiện tại — bằng access token còn hạn HOẶC refresh token (cookie web / body.refreshToken app)
 *     tags: [Auth]
 */
// `optionalAuth` (không phải `authenticateToken`): access token hết hạn/máy offline vẫn đăng xuất được bằng refresh token. `requireTrustedOrigin`:
// nhánh cookie chỉ xác thực bằng cookie ⇒ chống CSRF (giống `/auth/refresh`). Thiếu cả hai ⇒ 401 ở controller.
router.post(
  "/logout",
  requireTrustedOrigin(),
  validateBody(refreshBodySchema),
  optionalAuth,
  authController.logout
);

/**
 * @openapi
 * /auth/logout-all:
 *   post:
 *     summary: Đăng xuất MỌI thiết bị (kể cả thiết bị đang gọi) — thu hồi mọi phiên + sinh trắc học
 *     tags: [Auth]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/logout-all", authenticateToken, accountActionLimiter, authController.logoutAll);

// ── Email verification (auth required + rate limited) ────────────────────────
router.post(
  "/verify-email/send",
  authenticateToken,
  accountActionLimiter,
  // Tối đa 3 mã / 15 phút / tài khoản (bom email, làm mới mã liên tục).
  scopeLimiter("verify-email-send", (req) => req.user?.id ?? null, [{ max: 3, windowSeconds: 900 }]),
  authController.sendVerificationEmail
);
router.post(
  "/verify-email/confirm",
  authenticateToken,
  accountActionLimiter,
  validateBody(confirmEmailSchema),
  authController.confirmVerificationEmail
);

// ── Change password (auth required + rate limited) ───────────────────────────
router.patch(
  "/change-password",
  authenticateToken,
  accountActionLimiter,
  validateBody(changePasswordSchema),
  authController.changePassword
);

// ── Session management (auth required) ───────────────────────────────────────
const sessionIdSchema = z.object({ id: objectIdSchema });

router.get("/sessions", authenticateToken, sessionController.listSessions);
router.delete(
  "/sessions/:id",
  authenticateToken,
  validateParams(sessionIdSchema),
  sessionController.revokeSession
);

// ── Biometric login (p0-13) ───────────────────────────────────────────────────
// ✅ 2026-09-17 (p0-07) — `requireSystemConfig("auth.biometricLogin.enabled")`
// nay ĐÃ GẮN vào `/auth/biometric/login` (module `system-config` tồn tại từ
// p0-07). Đăng nhập sinh trắc học tắt qua `PUT /admin/system-config/auth`
// (`value.biometricLogin.enabled = false`) → 403 `AUTH_016` NGAY tại đây,
// trước khi chạm `requireNonce()`/`BiometricService`. `enroll` CỐ TÌNH không
// gắn cờ này (be.md p0-13 §4 đánh dấu ~~requireSystemConfig~~ ở route enroll —
// quyết định giữ enroll không phụ thuộc cờ, chỉ chặn LOGIN).

/**
 * @openapi
 * /auth/biometric/enroll:
 *   post:
 *     summary: Đăng ký đăng nhập sinh trắc học cho 1 thiết bị — trả bí mật thô 1 lần duy nhất
 *     tags: [Auth]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/biometric/enroll",
  authenticateToken,
  accountActionLimiter,
  validateBody(biometricEnrollSchema),
  biometricController.enroll
);

/**
 * @openapi
 * /auth/biometric/login:
 *   post:
 *     summary: Đăng nhập bằng sinh trắc học (nonce + HMAC, không gửi bí mật thô)
 *     tags: [Auth]
 */
router.post(
  "/biometric/login",
  biometricLoginLimiter,
  validateBody(biometricLoginSchema),
  requireSystemConfig(
    "auth.biometricLogin.enabled",
    () => new AppError(ErrorMessages.AUTH_016, 403, ErrorCode.AUTH_016)
  ),
  requireNonce(),
  scopeLimiter(
    "biometric-login",
    (req) => (req.body as { credentialId?: string })?.credentialId ?? null,
    [LIMITS.auth.biometric.loginRate],
    ErrorCode.RATE_002
  ),
  biometricController.login
);

/**
 * @openapi
 * /auth/biometric/credentials:
 *   get:
 *     summary: Danh sách đăng nhập sinh trắc học đang bật của chính mình
 *     tags: [Auth]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/biometric/credentials", authenticateToken, biometricController.listMine);

/**
 * @openapi
 * /auth/biometric/credentials/{id}:
 *   delete:
 *     summary: Tự tắt đăng nhập sinh trắc học (idempotent)
 *     tags: [Auth]
 *     security: [{ BearerAuth: [] }]
 */
router.delete(
  "/biometric/credentials/:id",
  authenticateToken,
  validateParams(credentialIdParamsSchema),
  validateQuery(revokeMineQuerySchema),
  biometricController.revokeMine
);

export default router;
