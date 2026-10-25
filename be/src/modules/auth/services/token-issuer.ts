import { JwtUtils } from "../../../core/utils/jwt";
import { LIMITS } from "../../../core/constants/limits";
import { newObjectId } from "../../../core/utils/object-id";
import { mailService } from "../../../infrastructure/mail";
import { logger } from "../../../infrastructure/logger";
import type { SessionService } from "./session.service";
import { DeviceTrustService } from "./device-trust.service";
import type { User } from "../../users/entities/user.interface";
import { toAuthUserDto, type AuthUserDto } from "../dtos/auth-user.dto";
import { withDataPermissions } from "../../../core/permission/data-permissions";

/** 7 ngày tính bằng giây — TTL refresh token/Session. */
const REFRESH_TOKEN_TTL_S = 7 * 24 * 60 * 60;

export interface IssueTokenMeta {
  userAgent?: string;
  ipAddress?: string;
  /** Id thiết bị app (header `X-Device-Id`) — gắn vào `Session.deviceId`. */
  deviceId?: string;
  authMethod?: "PASSWORD" | "BIOMETRIC" | "SOCIAL";
  biometricCredentialId?: string;
  /**
   * `true` ⇒ kiểm "thiết bị/vị trí đã biết chưa" TRƯỚC khi tạo session mới,
   * và nếu là thiết bị mới thì gửi email cảnh báo (fire-and-forget, không
   * chặn response) — login (password/biometric). `register` không truyền
   * field này (tài khoản mới thì thiết bị nào cũng là "mới", vô nghĩa cảnh báo).
   */
  notifyNewDevice?: boolean;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUserDto;
  /** Id `Session` gắn với cặp token (claim `sid`) — chỉ dùng nội bộ, KHÔNG đưa vào response. */
  sessionId?: string;
}

/**
 * Cấp cặp access/refresh token + tạo `Session` — logic DÙNG CHUNG cho
 * `AuthService.login`, `AuthService.register` và `BiometricService.login`
 * (tách khỏi `AuthService` theo p0-13 để 3 luồng đăng nhập không tự lặp lại
 * cách cấp token).
 */
export class TokenIssuer {
  private readonly deviceTrust?: DeviceTrustService;

  constructor(private readonly sessionService?: SessionService) {
    if (sessionService) this.deviceTrust = new DeviceTrustService(sessionService);
  }

  async issue(user: User, meta: IssueTokenMeta = {}): Promise<AuthResult> {
    // Nhận diện thiết bị quen/lạ/gốc TRƯỚC khi tạo session mới của lượt đăng nhập này
    // (nếu không sẽ luôn tự khớp với chính phiên vừa tạo). Luôn ghi nhận thiết bị (kể cả register/biometric)
    // để máy đăng nhập đầu tiên thành "thiết bị gốc"; chỉ CẢNH BÁO khi `notifyNewDevice`.
    if (this.sessionService && this.deviceTrust) {
      const deviceMeta = { deviceId: meta.deviceId, userAgent: meta.userAgent, ipAddress: meta.ipAddress };
      let known = true;
      try {
        known = (await this.deviceTrust.evaluate(user.id, deviceMeta)).known;
      } catch (err) {
        // Lỗi ghi nhận (vd DB) không được chặn đăng nhập — rơi về cách kiểm cũ theo lịch sử phiên.
        logger.warn("[TokenIssuer] Nhận diện thiết bị thất bại, dùng kiểm theo lịch sử phiên:", err);
        known = await this.sessionService.isKnownDevice(user.id, deviceMeta);
      }
      if (meta.notifyNewDevice && !known) {
        // Fire-and-forget — không chặn response đăng nhập nếu mail/thông báo lỗi/chậm.
        Promise.resolve(
          mailService.sendNewDeviceLogin(user.email, {
            userAgent: meta.userAgent,
            ipAddress: meta.ipAddress,
            at: new Date(),
          })
        ).catch((err) =>
          logger.warn("[TokenIssuer] Gửi email cảnh báo thiết bị mới thất bại:", err)
        );
        void this.deviceTrust.notifyUnknown(user.id, deviceMeta);
      }
    }

    // Id phiên sinh TRƯỚC để nhúng vào claim `sid` của token — nhờ đó access
    // token nhận ra phiên của nó (thu hồi tức thì một phiên, "phiên hiện tại").
    const sessionId = this.sessionService ? newObjectId() : undefined;
    const result = this.issueTokens(user, sessionId);
    // (p6-05) + quyền theo dữ liệu (`partner:*`…) để admin suy đúng vai ngay từ response đăng nhập.
    result.user.permissions = await withDataPermissions(user.id, result.user.permissions);

    if (this.sessionService) {
      const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_S * 1000);
      await this.sessionService.create({
        id: sessionId,
        userId: user.id,
        refreshToken: result.refreshToken,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
        expiresAt,
        authMethod: meta.authMethod,
        deviceId: meta.deviceId,
        biometricCredentialId: meta.biometricCredentialId,
      });
      await this.sessionService.enforceSessionsMax(user.id, LIMITS.auth.sessionsMax);
    }

    return result;
  }

  /**
   * Huỷ kết quả `issue()` chưa trao cho client (vd thua đua với thu hồi
   * credential ở bước cuối đăng nhập sinh trắc học): thu hồi phiên vừa tạo.
   */
  async discard(result: AuthResult, userId: string): Promise<void> {
    if (!this.sessionService || !result.sessionId) return;
    await this.sessionService.revokeById(result.sessionId, userId);
  }

  /**
   * Chỉ tạo cặp token mới, KHÔNG tạo `Session` mới — dùng cho `POST
   * /auth/refresh` (rotate token của session hiện có, `SessionService.rotate`
   * tự cập nhật lại hash trên đúng bản ghi cũ thay vì tạo phiên mới).
   * `sessionId` = claim `sid` của refresh token vừa dùng — giữ nguyên để token
   * mới vẫn thuộc đúng phiên đó.
   */
  issueTokensOnly(user: User, sessionId?: string): AuthResult {
    return this.issueTokens(user, sessionId);
  }

  /**
   * Chỉ một access token mới cho phiên đang có (sau đổi mật khẩu: `sessionVersion`
   * tăng nên token cũ hết hiệu lực nhưng phiên hiện tại được giữ). Không đụng
   * refresh token/`Session`.
   */
  issueAccessOnly(user: User, sessionId?: string): string {
    return JwtUtils.generateAccessToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      sv: user.sessionVersion ?? 1,
      ...(sessionId && { sid: sessionId }),
    });
  }

  /** Tạo cặp access + refresh token từ User entity. */
  private issueTokens(user: User, sessionId?: string): AuthResult {
    const dto = toAuthUserDto(user);
    const sid = sessionId ? { sid: sessionId } : {};
    const payload = {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      sv: user.sessionVersion ?? 1,
      ...sid,
    };
    return {
      accessToken: JwtUtils.generateAccessToken(payload),
      refreshToken: JwtUtils.generateRefreshToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        ...sid,
      }),
      user: dto,
      ...(sessionId && { sessionId }),
    };
  }
}
