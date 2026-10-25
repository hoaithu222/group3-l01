import bcrypt from "bcryptjs";
import type { IUserRepository } from "../../users/repositories/user.repository.interface";
import { JwtUtils } from "../../../core/utils/jwt";
import { UnauthorizedError, ConflictError, NotFoundError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import { ROLES } from "../../../core/constants";
import { normalizeEmail } from "../../../core/auth/normalize-email";
import { mailService } from "../../../infrastructure/mail";
import { logger } from "../../../infrastructure/logger";
import { disconnectUserSockets } from "../../../infrastructure/socket";
import { getFirebaseIdentityVerifier, type IFirebaseIdentityVerifier } from "../../../infrastructure/firebase";
import type { SessionService } from "./session.service";
import { SocialLoginService } from "./social-login.service";
import { TokenIssuer, type IssueTokenMeta, type AuthResult } from "./token-issuer";
import {
  PasswordService,
  SALT_ROUNDS,
  type ChangePasswordResult,
  type PasswordServiceDeps,
} from "./password.service";
import { EmailVerificationService } from "./email-verification.service";
import { fireAndForget, type RequestMeta } from "./auth-audit";
import { accountBlockedError } from "./account-lock";
import { toAuthUserDto, type AuthUserDto } from "../dtos/auth-user.dto";
import { resolveDataPermissions, withDataPermissions } from "../../../core/permission/data-permissions";

export type { AuthResult } from "./token-issuer";
export type { ChangePasswordResult } from "./password.service";

/**
 * Hash bcrypt của một chuỗi cố định (KHÔNG phải bí mật) — `login` luôn chạy
 * `bcrypt.compare` với nó khi email không tồn tại/không có mật khẩu, để thời
 * gian phản hồi không cho biết email có đăng ký hay chưa.
 */
const TIMING_DUMMY_HASH = "$2a$10$WvnvZiKW2BCa.41/aORspuQW7/Si1jp0MI6yyg5er79gY.xwJ/4ci";

/** Cổng gỡ thiết bị — thoả mãn bởi `DeviceService` (module `devices`, p0-06) qua structural typing (`@modules/devices/public`). */
export interface DeviceUnregisterPort {
  unregister(userId: string, deviceId: string): Promise<number>;
}

/**
 * `audit`: ghi audit các hành động nhạy cảm · `loginGuard`: đếm lần đăng nhập SAI
 * theo email (khoá tạm sau N lần — bổ sung cho `authLimiter` theo IP) ·
 * `reauthGuard`/`resetTokens`: xem `PasswordServiceDeps`.
 */
export interface AuthServiceOptions extends PasswordServiceDeps {
  verification?: EmailVerificationService;
  /** Bộ xác thực Firebase ID token cho đăng nhập mạng xã hội — mặc định dùng factory dùng chung `infrastructure/firebase` (chỉ tra ở lúc gọi). */
  firebaseVerifier?: IFirebaseIdentityVerifier;
}

/** Danh tính phiên hiện tại của người gọi (claim `sid` của access token và/hoặc refresh token trong cookie/body). */
export interface CurrentSessionInfo {
  sessionId?: string;
  refreshToken?: string;
}

export class AuthService {
  private readonly tokenIssuer: TokenIssuer;
  private readonly passwords: PasswordService;
  private readonly verification: EmailVerificationService;
  private readonly social: SocialLoginService;

  constructor(
    private readonly userRepo: IUserRepository,
    private readonly sessionService?: SessionService,
    private readonly devices?: DeviceUnregisterPort,
    private readonly options: AuthServiceOptions = {}
  ) {
    this.tokenIssuer = new TokenIssuer(sessionService);
    this.passwords = new PasswordService(userRepo, sessionService, this.tokenIssuer, options);
    this.verification = options.verification ?? new EmailVerificationService();
    this.social = new SocialLoginService(userRepo, this.tokenIssuer, sessionService, {
      verifier: options.firebaseVerifier ?? { verify: (idToken) => getFirebaseIdentityVerifier().verify(idToken) },
      audit: options.audit,
    });
  }

  /**
   * Đăng nhập bằng email + password.
   *
   * - Khoá tạm theo TÀI KHOẢN sau nhiều lần sai (`loginGuard`), kiểm TRƯỚC khi
   *   tra DB/băm mật khẩu; đếm cả email không tồn tại nên không lộ "email có đăng ký hay không".
   * - Luôn chạy `bcrypt.compare` (kể cả email lạ) và chỉ xét trạng thái tài
   *   khoản SAU khi mật khẩu đúng: trước đây email tồn tại mà bị khoá/chờ xoá
   *   trả 403 ngay không cần mật khẩu, còn email lạ trả 401 nhanh — cả mã lỗi lẫn
   *   thời gian đều cho biết email có tồn tại.
   */
  async login(
    email: string,
    password: string,
    meta?: Omit<IssueTokenMeta, "authMethod">
  ): Promise<AuthResult> {
    const normalized = normalizeEmail(email);
    await this.options.loginGuard?.assertNotLocked(normalized);

    const user = await this.userRepo.findByEmail(normalized);
    const valid = await bcrypt.compare(password, user?.passwordHash ?? TIMING_DUMMY_HASH);
    if (!user || !user.passwordHash || !valid) {
      await this.onLoginFailed(normalized, user?.id, user?.role, meta);
      // AUTH_001 (không phải mặc định AUTH_002 "Token không hợp lệ"): app/admin phân biệt "sai mật khẩu" với "token hết hạn"
      // bằng mã này — sai mã ⇒ form đăng nhập hiện "Token không hợp lệ" và interceptor 401 coi là phiên hết hạn.
      throw new UnauthorizedError("Email hoặc mật khẩu không đúng", ErrorCode.AUTH_001);
    }
    if (user.status && user.status !== "ACTIVE") throw accountBlockedError(user);
    await this.options.loginGuard?.reset(normalized);
    return this.tokenIssuer.issue(user, { ...meta, authMethod: "PASSWORD" });
  }

  /**
   * Đăng ký tài khoản mới — luôn tạo role `ROLES.USER` (B1: `role` không còn nhận từ client).
   * `phone` (tuỳ chọn) đã chuẩn hoá E.164 ở DTO — tự khai, chưa xác minh, chỉ để người khác tìm/thêm vào nhóm.
   */
  async register(
    email: string,
    name: string,
    password: string,
    meta?: Omit<IssueTokenMeta, "authMethod" | "notifyNewDevice">,
    phone?: string | null
  ): Promise<AuthResult> {
    const normalized = normalizeEmail(email);
    const existing = await this.userRepo.findByEmail(normalized);
    if (existing) {
      throw new ConflictError("Email đã tồn tại");
    }
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    // Repository chuyển vi phạm unique (đăng ký trùng đồng thời) thành ConflictError.
    const user = await this.userRepo.create({
      email: normalized,
      name,
      ...(phone ? { phone } : {}),
      passwordHash,
      role: ROLES.USER,
    });
    // Gửi email chào mừng (không chặn response nếu mail lỗi)
    fireAndForget("gửi email chào mừng", () => mailService.sendWelcome(normalized, name));
    return this.tokenIssuer.issue(user, { ...meta, authMethod: "PASSWORD" });
  }

  /**
   * Đăng nhập bằng mạng xã hội (Firebase ID token) — tạo tài khoản nếu chưa có, hoặc vào tài khoản cùng email đã xác minh.
   * Xem `SocialLoginService` cho luật gộp tài khoản và chống chiếm chỗ email.
   */
  firebaseLogin(idToken: string, meta?: Omit<IssueTokenMeta, "authMethod">): Promise<AuthResult> {
    return this.social.login(idToken, meta);
  }

  /**
   * Làm mới access token bằng refresh token — rotate thật + reuse detection.
   * Ném UnauthorizedError(AUTH_006) nếu token không hợp lệ/hết hạn/không phải
   * refresh token (trước đây lỗi của `jsonwebtoken` lọt ra thành 500), AUTH_010
   * nếu phát hiện dùng lại token đã rotate (mọi phiên của user đã bị thu hồi).
   */
  async refreshToken(token: string): Promise<AuthResult> {
    let payload;
    try {
      payload = JwtUtils.verifyRefreshToken(token);
    } catch {
      throw new UnauthorizedError("Refresh token không hợp lệ", ErrorCode.AUTH_006);
    }
    const user = await this.userRepo.findById(payload.userId);
    if (!user) {
      throw new UnauthorizedError("Người dùng không tồn tại", ErrorCode.AUTH_006);
    }
    if (user.status && user.status !== "ACTIVE") throw accountBlockedError(user);
    // Token mới thuộc CÙNG phiên (`sid` của refresh token vừa dùng).
    const next = this.tokenIssuer.issueTokensOnly(user, payload.sid);
    if (this.sessionService) {
      const r = await this.sessionService.rotate(token, next.refreshToken);
      if (!r.ok) {
        throw new UnauthorizedError(
          r.reuse
            ? "Phiên đã bị thu hồi do nghi ngờ rò rỉ, vui lòng đăng nhập lại"
            : "Refresh token không hợp lệ",
          r.reuse ? ErrorCode.AUTH_010 : ErrorCode.AUTH_006
        );
      }
    }
    next.user.permissions = await withDataPermissions(user.id, next.user.permissions);
    return next;
  }

  /**
   * Đăng xuất — blacklist access token, thu hồi session hiện tại (theo refresh
   * token và/hoặc `sid` của access token — thu hồi TỨC THÌ mọi access token của
   * phiên đó), và gỡ mọi `DeviceToken` (FCM/APNs VoIP) của thiết bị đang logout
   * (be.md p0-06 §5.1 — `X-Device-Id`) để máy không tiếp tục nhận push cho
   * tài khoản vừa đăng xuất.
   *
   * `accessToken` vắng (đã hết hạn/hỏng — đăng xuất CHỈ bằng refresh token, cookie web hoặc body app): người gọi được nhận diện bằng
   * chính refresh token (phải là JWT refresh hợp lệ do ta ký); refresh token hết hạn/không hợp lệ ⇒ không còn phiên nào để thu hồi
   * (idempotent, không lỗi). Có `userId` (từ access token hợp lệ) thì khoá phiên phải thuộc đúng người đó.
   */
  async logout(
    accessToken: string | undefined,
    refreshToken?: string,
    userId?: string,
    deviceId?: string,
    sessionId?: string
  ): Promise<void> {
    if (accessToken) await JwtUtils.blacklistToken(accessToken);

    let ownerId = userId;
    let currentSessionId = sessionId;
    if (!ownerId && refreshToken) {
      try {
        const payload = JwtUtils.verifyRefreshToken(refreshToken);
        ownerId = payload.userId;
        currentSessionId ??= payload.sid;
      } catch {
        return; // refresh token hết hạn/không hợp lệ: phiên (nếu có) tự hết hiệu lực, không có gì để thu hồi
      }
    }

    if (this.sessionService) {
      if (refreshToken) await this.sessionService.revokeByToken(refreshToken, ownerId);
      if (ownerId && currentSessionId) await this.sessionService.revokeById(currentSessionId, ownerId);
    }
    if (ownerId && deviceId && this.devices) {
      await this.devices.unregister(ownerId, deviceId);
    }
  }

  /**
   * Đăng xuất MỌI thiết bị (kể cả thiết bị đang dùng): thu hồi mọi phiên,
   * tăng `sessionVersion` (vô hiệu mọi access token), thu hồi credential sinh
   * trắc học, ngắt socket, ghi audit. Trả số phiên đã thu hồi.
   */
  async logoutAll(
    userId: string,
    role: string | undefined,
    accessToken: string,
    meta: RequestMeta = {}
  ): Promise<{ revokedSessions: number }> {
    await JwtUtils.blacklistToken(accessToken);
    const revokedSessions = (await this.sessionService?.revokeAll(userId, "SESSIONS_REVOKED")) ?? 0;
    disconnectUserSockets(userId, "logout-all");
    await this.options.audit?.record({
      actorId: userId,
      actorRole: role,
      action: "auth.logout-all",
      targetType: "User",
      targetId: userId,
      ip: meta.ipAddress,
      userAgent: meta.userAgent,
      metadata: { revokedSessions },
    });
    return { revokedSessions };
  }

  /** Lấy hồ sơ người dùng hiện tại (`/auth/me`). */
  async getMe(userId: string): Promise<AuthUserDto> {
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundError("Người dùng không tồn tại");
    // (p6-05) + quyền theo dữ liệu (`partner:*`…) — admin suy vai đăng nhập từ `permissions`.
    return toAuthUserDto(user, await resolveDataPermissions(user.id));
  }

  /** Quên mật khẩu — xem `PasswordService.forgot` (luôn trả thành công, không lộ email nào tồn tại). */
  forgotPassword(email: string): Promise<void> {
    return this.passwords.forgot(normalizeEmail(email));
  }

  /** Đặt lại mật khẩu bằng token email — thu hồi MỌI phiên. */
  resetPassword(token: string, newPassword: string, meta?: RequestMeta): Promise<void> {
    return this.passwords.reset(token, newPassword, meta);
  }

  /** Đổi mật khẩu — thu hồi mọi phiên KHÁC phiên hiện tại. */
  changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    current?: CurrentSessionInfo,
    meta?: RequestMeta
  ): Promise<ChangePasswordResult> {
    return this.passwords.change(userId, currentPassword, newPassword, current, meta);
  }

  /** Gửi mã xác minh email 6 chữ số. */
  sendVerificationEmail(userId: string): Promise<void> {
    return this.verification.send(userId);
  }

  /** Xác nhận email bằng mã 6 chữ số. */
  confirmEmailVerification(userId: string, code: string): Promise<void> {
    return this.verification.confirm(userId, code);
  }

  /** Đếm lần sai; chạm ngưỡng thì ghi audit `auth.login-locked` (chỉ khi email có thật). */
  private async onLoginFailed(
    normalizedEmail: string,
    userId: string | undefined,
    role: string | undefined,
    meta?: Omit<IssueTokenMeta, "authMethod">
  ): Promise<void> {
    const state = await this.options.loginGuard?.recordFailure(normalizedEmail);
    if (!state?.justLocked) return;
    logger.warn("[AuthService] Khoá đăng nhập tạm thời do nhập sai nhiều lần", {
      userId,
      ip: meta?.ipAddress,
    });
    if (!userId) return; // email không tồn tại: không có đối tượng để ghi audit
    await this.options.audit?.record({
      actorId: userId,
      actorRole: role,
      action: "auth.login-locked",
      targetType: "User",
      targetId: userId,
      ip: meta?.ipAddress,
      userAgent: meta?.userAgent,
      metadata: { lockSeconds: state.retryAfterSeconds },
    });
  }
}
