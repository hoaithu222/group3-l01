import bcrypt from "bcryptjs";
import type { IUserRepository } from "../../users/repositories/user.repository.interface";
import type { User } from "../../users/entities/user.interface";
import { NotFoundError, UnauthorizedError, ValidationError } from "../../../core/exceptions";
import { normalizeEmail } from "../../../core/auth/normalize-email";
import { PasswordAttemptGuard } from "../../../core/auth/password-attempt-guard";
import { ErrorCode } from "../../../core/utils/error.codes";
import { env } from "../../../core/config";
import { mailService } from "../../../infrastructure/mail";
import { logger } from "../../../infrastructure/logger";
import { disconnectUserSockets } from "../../../infrastructure/socket";
import type { SessionService, CurrentSessionRef } from "./session.service";
import type { TokenIssuer } from "./token-issuer";
import { ResetTokenStore } from "./reset-token.store";
import { fireAndForget, type AuditRecorder, type RequestMeta } from "./auth-audit";

export const SALT_ROUNDS = 10;

const RESET_TOKEN_INVALID_MESSAGE = "Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn";

export interface ChangePasswordResult {
  /** Số phiên khác đã bị thu hồi. */
  revokedSessions: number;
  /** Access token MỚI (mang `sessionVersion` mới) cho phiên hiện tại — chỉ khi xác định được phiên hiện tại. */
  accessToken?: string;
}

export interface PasswordServiceDeps {
  audit?: AuditRecorder;
  /** Khoá đếm lần sai theo tài khoản dùng chung với đăng nhập — đặt lại mật khẩu xoá khoá này. */
  loginGuard?: PasswordAttemptGuard;
  /** Đếm lần nhập sai "mật khẩu hiện tại" khi đổi mật khẩu (chống dò mật khẩu bằng access token bị lộ). */
  reauthGuard?: PasswordAttemptGuard;
  resetTokens?: ResetTokenStore;
}

/**
 * Quên / đặt lại / đổi mật khẩu.
 *
 * Bất biến bảo mật: đổi mật khẩu bằng BẤT KỲ đường nào ⇒ mọi access token cũ
 * bị vô hiệu (`sessionVersion + 1`), phiên (refresh token) cũ bị thu hồi —
 * trừ phiên hiện tại khi đổi mật khẩu lúc đang đăng nhập —, credential sinh
 * trắc học bị thu hồi, socket bị ngắt, token đặt lại còn treo bị huỷ, có audit
 * và email cảnh báo.
 */
export class PasswordService {
  private readonly resetTokens: ResetTokenStore;

  constructor(
    private readonly userRepo: IUserRepository,
    private readonly sessions: SessionService | undefined,
    private readonly tokenIssuer: TokenIssuer,
    private readonly deps: PasswordServiceDeps = {}
  ) {
    this.resetTokens = deps.resetTokens ?? new ResetTokenStore();
  }

  /**
   * Quên mật khẩu — tạo token, lưu Redis 15 phút, gửi mail.
   *
   * Luôn trả thành công với MỌI email (chống dò tài khoản): không `await` việc
   * gửi mail (SMTP chậm/lỗi chỉ xảy ra với email có thật ⇒ lộ qua thời gian
   * phản hồi hoặc mã 500), và khi không có nơi lưu token thì từ chối SỚM cho
   * mọi email như nhau.
   */
  async forgot(email: string): Promise<void> {
    this.resetTokens.assertAvailable();
    const user = await this.userRepo.findByEmail(email);
    if (!user || user.status === "ANONYMIZED") return;

    const token = await this.resetTokens.issue(user.id);
    fireAndForget("gửi email đặt lại mật khẩu", () => mailService.sendResetPassword(user.email, token));
    logger.info("[PasswordService] Đã cấp token đặt lại mật khẩu", { userId: user.id });
  }

  /** Đặt lại mật khẩu bằng token email — thu hồi MỌI phiên (đồng bộ chéo #6). */
  async reset(token: string, newPassword: string, meta: RequestMeta = {}): Promise<void> {
    const userId = await this.resetTokens.consume(token);
    if (!userId) {
      throw new UnauthorizedError(RESET_TOKEN_INVALID_MESSAGE, ErrorCode.AUTH_008);
    }
    const user = await this.userRepo.findById(userId);
    if (!user || user.status === "ANONYMIZED") {
      // Cùng một thông điệp/mã với token sai — không lộ tài khoản đã bị xoá.
      throw new UnauthorizedError(RESET_TOKEN_INVALID_MESSAGE, ErrorCode.AUTH_008);
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const { revokedSessions } = await this.storePassword(user, passwordHash, "PASSWORD_RESET");
    // Đặt lại xong là lối thoát khỏi khoá đăng nhập theo tài khoản.
    await this.deps.loginGuard?.reset(normalizeEmail(user.email));

    await this.auditAndNotify(user, "auth.password-reset", meta, { revokedSessions });
    logger.info("[PasswordService] Đặt lại mật khẩu thành công", { userId });
  }

  /**
   * Đổi mật khẩu khi đang đăng nhập. Thu hồi mọi phiên KHÁC `current`; không
   * xác định được phiên hiện tại (không `sessionId`, không refresh token) thì
   * thu hồi TẤT CẢ và không trả access token mới.
   */
  async change(
    userId: string,
    currentPassword: string,
    newPassword: string,
    current: { sessionId?: string; refreshToken?: string } = {},
    meta: RequestMeta = {}
  ): Promise<ChangePasswordResult> {
    await this.deps.reauthGuard?.assertNotLocked(userId);

    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundError("Người dùng không tồn tại");
    if (!user.passwordHash) {
      throw new ValidationError("Tài khoản này không có mật khẩu (đăng nhập qua bên thứ ba)");
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      await this.deps.reauthGuard?.recordFailure(userId);
      // AUTH_001: app không đá người dùng ra khỏi phiên vì gõ sai mật khẩu (xem `isCredentialRejection` phía app).
      throw new UnauthorizedError("Mật khẩu hiện tại không đúng", ErrorCode.AUTH_001);
    }
    await this.deps.reauthGuard?.reset(userId);
    if (currentPassword === newPassword) {
      throw new ValidationError("Mật khẩu mới phải khác mật khẩu hiện tại");
    }

    const keep: CurrentSessionRef | undefined =
      current.sessionId || current.refreshToken ? current : undefined;
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const { revokedSessions, sessionVersion } = await this.storePassword(
      user,
      passwordHash,
      "PASSWORD_CHANGED",
      keep
    );

    await this.auditAndNotify(user, "auth.password-change", meta, { revokedSessions });
    logger.info("[PasswordService] Password changed", { userId });

    if (!keep) return { revokedSessions };
    // Phiên hiện tại được giữ, nhưng access token cũ mang `sessionVersion` cũ nên hết hiệu lực —
    // trả token mới để client tiếp tục không phải đăng nhập lại.
    const accessToken = this.tokenIssuer.issueAccessOnly({ ...user, sessionVersion }, current.sessionId);
    return { revokedSessions, accessToken };
  }

  /**
   * Ghi mật khẩu mới + thu hồi phiên (nguyên tử khi có `SessionService`), ngắt
   * socket và huỷ token đặt lại còn treo.
   */
  private async storePassword(
    user: User,
    passwordHash: string,
    reason: "PASSWORD_CHANGED" | "PASSWORD_RESET",
    keep?: CurrentSessionRef
  ): Promise<{ revokedSessions: number; sessionVersion: number }> {
    let result: { revokedSessions: number; sessionVersion: number };
    if (this.sessions) {
      result = await this.sessions.applyPasswordChange(user.id, passwordHash, { keep, reason });
    } else {
      // Không có SessionService (unit test/không dùng phiên DB): chỉ đổi mật khẩu.
      await this.userRepo.update(user.id, { passwordHash });
      result = { revokedSessions: 0, sessionVersion: user.sessionVersion ?? 1 };
    }
    disconnectUserSockets(user.id, reason === "PASSWORD_RESET" ? "password-reset" : "password-changed");
    await this.resetTokens.invalidateAllFor(user.id);
    return result;
  }

  private async auditAndNotify(
    user: User,
    action: "auth.password-change" | "auth.password-reset",
    meta: RequestMeta,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await this.deps.audit?.record({
      actorId: user.id,
      actorRole: user.role,
      action,
      targetType: "User",
      targetId: user.id,
      ip: meta.ipAddress,
      userAgent: meta.userAgent,
      metadata,
    });
    fireAndForget("gửi email báo đổi mật khẩu", () => this.sendPasswordChangedMail(user.email));
  }

  /** Email cảnh báo: chủ tài khoản biết ngay nếu người khác đổi mật khẩu của mình. */
  private async sendPasswordChangedMail(to: string): Promise<void> {
    const at = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    const url = `${env.FRONTEND_URL}/forgot-password`;
    await mailService.sendRaw({
      to,
      subject: "Mật khẩu tài khoản của bạn đã được thay đổi",
      html:
        `<p>Mật khẩu tài khoản của bạn vừa được thay đổi lúc ${at}. ` +
        `Mọi thiết bị khác đã bị đăng xuất.</p>` +
        `<p><strong>Nếu không phải bạn</strong>, hãy <a href="${url}">đặt lại mật khẩu</a> ngay và liên hệ quản trị viên.</p>`,
      text:
        `Mật khẩu tài khoản của bạn vừa được thay đổi lúc ${at}. Mọi thiết bị khác đã bị đăng xuất. ` +
        `Nếu không phải bạn, hãy đặt lại mật khẩu tại ${url} và liên hệ quản trị viên.`,
    });
  }
}
