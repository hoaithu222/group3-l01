/**
 * @file auth.controller.ts
 * @description Auth endpoints — refresh token nhận cookie HOẶC body (admin web
 * dùng cookie httpOnly; app mobile không có cookie jar bền nên gửi/nhận
 * refreshToken trong body, lưu ở SecureStore). Header `X-Client-Platform:
 * ANDROID|IOS` (p0-13 B11) quyết định nhánh app cho login/register — thiếu
 * header này ⇒ mặc định web (cookie).
 *
 * ┌────────────────────────────────────────────────────────────────────────────────────────────┐
 * │  Endpoint         │ Cookie action (web)          │ Body trả về (web)     │ Body trả về (app) │
 * ├────────────────────────────────────────────────────────────────────────────────────────────┤
 * │  POST /login      │ Set refresh_token (httpOnly) │ { accessToken, user } │ + refreshToken    │
 * │  POST /register   │ Set refresh_token (httpOnly) │ { accessToken, user } │ + refreshToken    │
 * │  POST /refresh    │ Rotate cookie NẾU có cookie   │ token+user (xem trên) — nhánh body giữ nguyên │
 * │  POST /logout     │ Clear refresh_token cookie   │ null                  │ null              │
 * │  POST /logout-all │ Clear refresh_token cookie   │ { revokedSessions }   │ { revokedSessions }│
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Error codes:
 *   AUTH_001 — Email/password không đúng
 *   AUTH_006 — Refresh token không hợp lệ
 *   AUTH_009 — Refresh token cookie/body không tồn tại
 *   AUTH_010 — Refresh token bị dùng lại (reuse) — mọi phiên đã thu hồi
 *   AUTH_011/012 — Tài khoản bị khoá / đang chờ xoá
 *   AUTH_018 — Nonce (chống replay login/register) không hợp lệ/đã dùng/hết hạn
 *
 * Secure cookie options:
 *   httpOnly: true  — JS không đọc được (chống XSS)
 *   secure: true    — Chỉ gửi qua HTTPS (production)
 *   sameSite: strict/lax — Chống CSRF
 *   path: /api/v1/auth — thu hẹp phạm vi cookie, chỉ gửi kèm request auth
 */

import type { CookieOptions, Request, Response } from "express";
import { AuthService, type AuthResult } from "../services/auth.service";
import { ResponseUtils } from "../../../core/utils";
import { catchAsync } from "../../../core/utils/catchAsync";
import { JwtUtils } from "../../../core/utils/jwt";
import { NonceUtils } from "../../../core/utils/nonce";
import { UnauthorizedError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import { env } from "../../../core/config";
import { readClientPlatform, readDeviceIdHeader } from "../../../core/auth/client-platform";
import type {
  FirebaseLoginDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from "../dtos/auth.dto";

// ── Cookie constants ──────────────────────────────────────────────────────────

const REFRESH_COOKIE_NAME = "refresh_token";
/**
 * Cờ cũ (non-httpOnly, "đã đăng nhập") của base Next.js — ĐÃ GỠ (rà soát auth BE 2026-09-25): `Path=/api/v1/auth` nên trang không đọc
 * được, `SameSite=Lax` cả ở production (refresh token thì Strict) và không client nào (admin/app) dùng. Không còn được đặt; chỉ còn
 * được XOÁ lúc đăng xuất để dọn trình duyệt vẫn giữ bản cũ.
 */
const LEGACY_IS_AUTH_COOKIE_NAME = "is_authenticated";

/** 7 ngày tính bằng milliseconds */
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/** Thu hẹp path — cookie chỉ gửi kèm request tới /api/v1/auth/*, không rò rỉ sang route khác. */
const AUTH_COOKIE_PATH = "/api/v1/auth";

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
  path: AUTH_COOKIE_PATH,
  maxAge: REFRESH_COOKIE_MAX_AGE,
};

const clearCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
  path: AUTH_COOKIE_PATH,
  maxAge: 0,
};

// ── Factory ───────────────────────────────────────────────────────────────────

export function createAuthController(authService: AuthService) {
  /**
   * Trả kết quả đăng nhập/đăng ký theo hợp đồng B11 (p0-13 §5.1):
   * - Web (không có `X-Client-Platform`): set cookie httpOnly + body chỉ có accessToken.
   * - App (`X-Client-Platform: ANDROID|IOS`): KHÔNG set-cookie — accessToken +
   *   refreshToken cùng nằm trong body (app không có cookie jar bền, lưu
   *   refreshToken ở SecureStore) — đây là chỗ sửa bug "app không bao giờ
   *   nhận được refresh token".
   */
  function respondWithTokens(
    req: Request,
    res: Response,
    result: AuthResult,
    message: string,
    statusCode = 200
  ): void {
    const platform = readClientPlatform(req);
    if (platform) {
      ResponseUtils.success(
        res,
        {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          tokenType: "Bearer",
          user: result.user,
        },
        message,
        statusCode
      );
      return;
    }
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, cookieOptions);
    ResponseUtils.success(
      res,
      { accessToken: result.accessToken, tokenType: "Bearer", user: result.user },
      message,
      statusCode
    );
  }

  /** Xoá cookie refresh (+ cờ cũ `is_authenticated` nếu trình duyệt còn giữ) — no-op nếu client không dùng cookie. */
  function clearAuthCookies(res: Response): void {
    res.clearCookie(REFRESH_COOKIE_NAME, clearCookieOptions);
    res.clearCookie(LEGACY_IS_AUTH_COOKIE_NAME, { path: AUTH_COOKIE_PATH });
  }

  // ─── POST /auth/login ─────────────────────────────────────────────────────

  const login = catchAsync(async (req: Request, res: Response) => {
    const { email, password } = req.body as LoginDto;
    const meta = {
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip,
      deviceId: readDeviceIdHeader(req),
      notifyNewDevice: true,
    };
    const result = await authService.login(email, password, meta);
    respondWithTokens(req, res, result, "Đăng nhập thành công");
  });

  // ─── POST /auth/register ─────────────────────────────────────────────────

  const register = catchAsync(async (req: Request, res: Response) => {
    const { email, name, password, phone } = req.body as RegisterDto;
    const meta = {
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip,
      deviceId: readDeviceIdHeader(req),
    };
    const result = await authService.register(email, name, password, meta, phone);
    respondWithTokens(req, res, result, "Đăng ký thành công", 201);
  });

  // ─── POST /auth/refresh (+ alias /refresh-token) ─────────────────────────
  //
  // Cookie có → rotate cookie, KHÔNG trả refreshToken trong body (admin web).
  // Không có cookie, có body.refreshToken → trả refreshToken mới trong body,
  // KHÔNG set cookie (app mobile, lưu ở SecureStore).

  const refreshToken = catchAsync(async (req: Request, res: Response) => {
    const cookieToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    const bodyToken = (req.body as { refreshToken?: string } | undefined)?.refreshToken;
    const token = cookieToken ?? bodyToken;

    if (!token) {
      throw new UnauthorizedError(
        "Refresh token không tồn tại, vui lòng đăng nhập lại",
        ErrorCode.AUTH_009
      );
    }

    const result = await authService.refreshToken(token);

    if (cookieToken) {
      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, cookieOptions);
      ResponseUtils.success(
        res,
        { accessToken: result.accessToken, tokenType: "Bearer", user: result.user },
        "Làm mới token thành công"
      );
      return;
    }

    ResponseUtils.success(
      res,
      {
        accessToken: result.accessToken,
        tokenType: "Bearer",
        refreshToken: result.refreshToken,
        user: result.user,
      },
      "Làm mới token thành công"
    );
  });

  // ─── GET /auth/me (+ alias /profile) ──────────────────────────────────────

  const getMe = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new UnauthorizedError("Chưa đăng nhập", ErrorCode.AUTH_002);
    }
    const user = await authService.getMe(req.user.id);
    ResponseUtils.success(res, user, "Lấy thông tin thành công");
  });

  // ─── POST /auth/logout ───────────────────────────────────────────────────
  //
  // Route gắn `optionalAuth` (KHÔNG phải `authenticateToken`): đăng xuất phải làm được cả khi access token đã hết hạn / máy mất mạng lúc
  // token hết hạn — trước đây 401 và phiên phía BE KHÔNG bị thu hồi (web còn cookie refresh, app còn refresh token trong SecureStore).
  //   - Access token còn hợp lệ ⇒ blacklist + thu hồi theo `sid` (như cũ).
  //   - Refresh token (cookie web hoặc body app) ⇒ thu hồi phiên của nó dù access token hỏng/vắng.
  //   - Không có gì trong hai thứ trên ⇒ 401 AUTH_002.

  const logout = catchAsync(async (req: Request, res: Response) => {
    const refreshFromCookie = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    const refreshFromBody = (req.body as { refreshToken?: string } | undefined)?.refreshToken;
    const refreshToken = refreshFromCookie ?? refreshFromBody;
    if (!req.user && !refreshToken) {
      throw new UnauthorizedError("Chưa đăng nhập", ErrorCode.AUTH_002);
    }

    // `req.user` chỉ có khi `optionalAuth` đã xác thực access token — lúc đó header chắc chắn hợp lệ.
    const accessToken = req.user ? JwtUtils.extractTokenFromHeader(req.headers.authorization) : undefined;
    await authService.logout(
      accessToken,
      refreshToken,
      req.user?.id,
      readDeviceIdHeader(req),
      req.user?.sessionId
    );

    clearAuthCookies(res);

    ResponseUtils.success(res, null, "Đăng xuất thành công");
  });

  // ─── POST /auth/logout-all ───────────────────────────────────────────────
  // Đăng xuất MỌI thiết bị (kể cả thiết bị đang gọi): thu hồi mọi phiên + sessionVersion.

  const logoutAll = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Chưa đăng nhập", ErrorCode.AUTH_002);
    const token = JwtUtils.extractTokenFromHeader(req.headers.authorization);
    const result = await authService.logoutAll(req.user.id, req.user.role, token, {
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip,
    });

    clearAuthCookies(res);

    ResponseUtils.success(res, result, "Đã đăng xuất khỏi mọi thiết bị");
  });

  // ─── POST /auth/forgot-password ──────────────────────────────────────────

  const forgotPassword = catchAsync(async (req: Request, res: Response) => {
    const { email } = req.body as ForgotPasswordDto;
    await authService.forgotPassword(email);
    ResponseUtils.success(
      res,
      null,
      "Nếu email tồn tại, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu"
    );
  });

  // ─── POST /auth/reset-password ───────────────────────────────────────────

  const resetPassword = catchAsync(async (req: Request, res: Response) => {
    const { token, newPassword } = req.body as ResetPasswordDto;
    await authService.resetPassword(token, newPassword, {
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip,
    });
    ResponseUtils.success(res, null, "Đặt lại mật khẩu thành công");
  });

  // ─── POST /auth/firebase-login ───────────────────────────────────────────

  const firebaseLogin = catchAsync(async (req: Request, res: Response) => {
    const { idToken } = req.body as FirebaseLoginDto;
    const meta = {
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip,
      deviceId: readDeviceIdHeader(req),
      notifyNewDevice: true,
    };
    const result = await authService.firebaseLogin(idToken, meta);
    respondWithTokens(req, res, result, "Đăng nhập thành công");
  });

  // ─── POST /auth/verify-email/send ────────────────────────────────────────

  const sendVerificationEmail = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Chưa đăng nhập", ErrorCode.AUTH_002);
    await authService.sendVerificationEmail(req.user.id);
    ResponseUtils.success(res, null, "Đã gửi mã xác minh đến email của bạn");
  });

  // ─── POST /auth/verify-email/confirm ─────────────────────────────────────

  const confirmVerificationEmail = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Chưa đăng nhập", ErrorCode.AUTH_002);
    const { code } = req.body as { code: string };
    await authService.confirmEmailVerification(req.user.id, code);
    ResponseUtils.success(res, null, "Xác minh email thành công");
  });

  // ─── PATCH /auth/change-password ─────────────────────────────────────────

  const changePassword = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Chưa đăng nhập", ErrorCode.AUTH_002);
    const { currentPassword, newPassword, refreshToken } = req.body as {
      currentPassword: string;
      newPassword: string;
      refreshToken?: string;
    };
    // Phiên hiện tại: `sid` của access token (mọi client) và/hoặc refresh token (cookie web, hoặc body cho app).
    const currentRefreshToken =
      (req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined) ?? refreshToken;
    const result = await authService.changePassword(
      req.user.id,
      currentPassword,
      newPassword,
      { sessionId: req.user.sessionId, refreshToken: currentRefreshToken },
      { userAgent: req.headers["user-agent"], ipAddress: req.ip }
    );
    ResponseUtils.success(
      res,
      {
        revokedSessions: result.revokedSessions,
        ...(result.accessToken && { accessToken: result.accessToken, tokenType: "Bearer" }),
      },
      "Đổi mật khẩu thành công"
    );
  });

  // ─── GET /auth/nonce ──────────────────────────────────────────────────────
  // Gọi thẳng core util (NonceUtils) — giống cách `logout` gọi thẳng JwtUtils,
  // không cần qua AuthService vì không đụng tới user/repository.

  const getNonce = catchAsync(async (_req: Request, res: Response) => {
    const { nonce, expiresIn } = await NonceUtils.issue();
    ResponseUtils.success(res, { nonce, expiresIn }, "Nonce đã được cấp");
  });

  return {
    login,
    firebaseLogin,
    register,
    refreshToken,
    getMe,
    /** @deprecated dùng getMe — giữ tên cũ cho route /profile alias */
    getProfile: getMe,
    logout,
    logoutAll,
    forgotPassword,
    resetPassword,
    sendVerificationEmail,
    confirmVerificationEmail,
    changePassword,
    getNonce,
  };
}
