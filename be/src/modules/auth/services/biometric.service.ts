import { randomBytes, createHash, createHmac, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import type {
  IBiometricCredentialRepository,
  BiometricCredential,
} from "../repositories/biometric-credential.repository.interface";
import type { IUserRepository } from "../../users/repositories/user.repository.interface";
import { TokenIssuer, type AuthResult } from "./token-issuer";
import { LIMITS } from "../../../core/constants/limits";
import { getUserStatusCached } from "../../../core/permission/user-status";
import type { PasswordAttemptGuard } from "../../../core/auth/password-attempt-guard";
import { UnauthorizedError, NotFoundError, AccountLockedError } from "../../../core/exceptions";
import { ErrorCode } from "../../../core/utils/error.codes";
import { createContextLogger } from "../../../infrastructure/logger";
import { authBiometricLoginTotal } from "../../../infrastructure/metrics";
import { pendingDeletionDetails } from "./account-lock";

const log = createContextLogger({ service: "BiometricService" });

const BIOMETRIC_INVALID_MESSAGE =
  "Không xác thực được bằng sinh trắc học. Vui lòng đăng nhập bằng mật khẩu";
const BIOMETRIC_DISABLED_MESSAGE =
  "Đăng nhập sinh trắc học trên thiết bị này đã bị vô hiệu. Vui lòng đăng nhập bằng mật khẩu rồi bật lại";
const BIOMETRIC_EXPIRED_MESSAGE =
  "Đăng nhập sinh trắc học đã hết hạn. Vui lòng đăng nhập bằng mật khẩu rồi bật lại";

export interface BiometricCredentialSummary {
  id: string;
  deviceName: string | null;
  platform: string;
  biometryKind: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
  current: boolean;
}

export interface EnrollInput {
  deviceId: string;
  platform: "ANDROID" | "IOS";
  deviceName?: string;
  biometryKind: "FACE" | "FINGERPRINT" | "IRIS" | "GENERIC";
}

export interface EnrollResult {
  credentialId: string;
  secret: string;
  expiresAt: Date;
  biometryKind: string;
}

export interface BiometricLoginInput {
  credentialId: string;
  deviceId: string;
  nonce: string;
  hmac: string;
  userAgent?: string;
  ipAddress?: string;
}

export type BiometricLoginResult = AuthResult & {
  biometric: { credentialId: string; expiresAt: Date };
};

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export class BiometricService {
  constructor(
    private readonly repo: IBiometricCredentialRepository,
    private readonly userRepo: IUserRepository,
    private readonly tokenIssuer: TokenIssuer,
    /** Đếm lần nhập sai mật khẩu khi bật sinh trắc học (chống dò mật khẩu bằng access token bị lộ). */
    private readonly reauthGuard?: PasswordAttemptGuard
  ) {}

  /**
   * Đăng ký sinh trắc học cho 1 thiết bị — xác minh mật khẩu, trả bí mật thô
   * DUY NHẤT 1 LẦN (client tự lưu để tính HMAC ở các lần đăng nhập sau).
   */
  async enroll(userId: string, password: string, input: EnrollInput): Promise<EnrollResult> {
    await this.reauthGuard?.assertNotLocked(userId);
    const user = await this.userRepo.findById(userId);
    // AUTH_001 (không phải mặc định AUTH_002): app KHÔNG được coi đây là "token hết hạn" (làm mới token rồi dọn phiên —
    // người dùng bị đá ra chỉ vì gõ sai mật khẩu khi bật sinh trắc học). Xem `isCredentialRejection` phía app.
    if (!user || !user.passwordHash) {
      throw new UnauthorizedError("Mật khẩu hiện tại không đúng", ErrorCode.AUTH_001);
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await this.reauthGuard?.recordFailure(userId);
      throw new UnauthorizedError("Mật khẩu hiện tại không đúng", ErrorCode.AUTH_001);
    }
    await this.reauthGuard?.reset(userId);

    const secret = randomBytes(LIMITS.auth.biometric.secretBytes).toString("base64url");
    const secretHash = sha256Hex(secret);
    const activeKey = `${userId}:${input.deviceId}`;

    // Thiết bị này đã có credential ACTIVE → thay thế (REPLACED).
    const existing = await this.repo.findActiveByKey(activeKey);
    if (existing) {
      await this.repo.update(existing.id, {
        status: "REVOKED",
        activeKey: `revoked:${existing.id}`,
        revokeReason: "REPLACED",
        revokedAt: new Date(),
      });
    }

    // Vượt trần số credential ACTIVE/user → thu hồi bản cũ nhất (lastUsedAt ?? createdAt).
    const activeList = await this.repo.findActiveByUser(userId);
    if (activeList.length >= LIMITS.auth.biometric.perUserMax) {
      const oldest = [...activeList].sort(
        (a, b) => (a.lastUsedAt ?? a.createdAt).getTime() - (b.lastUsedAt ?? b.createdAt).getTime()
      )[0];
      if (oldest) {
        await this.repo.update(oldest.id, {
          status: "REVOKED",
          activeKey: `revoked:${oldest.id}`,
          revokeReason: "DEVICE_LIMIT",
          revokedAt: new Date(),
        });
      }
    }

    const expiresAt = new Date(
      Date.now() + LIMITS.auth.biometric.credentialMaxAgeDays * 24 * 60 * 60 * 1000
    );
    const created = await this.repo.create({
      userId,
      deviceId: input.deviceId,
      platform: input.platform,
      deviceName: input.deviceName ?? null,
      biometryKind: input.biometryKind,
      secretHash,
      activeKey,
      expiresAt,
    });

    log.info("Biometric credential enrolled", {
      userId,
      credentialId: created.id,
      platform: input.platform,
      biometryKind: input.biometryKind,
    });

    return {
      credentialId: created.id,
      secret,
      expiresAt,
      biometryKind: created.biometryKind,
    };
  }

  /**
   * Đăng nhập sinh trắc học.
   *
   * DEVIATION so với bản nháp be.md gốc: xác minh bằng
   * `HMAC-SHA256(secretHash, nonce)` (nonce chống replay, tiêu thụ qua
   * `requireNonce()` trước khi vào đây) thay vì so sánh trực tiếp `secret`
   * thô — bí mật gốc KHÔNG BAO GIỜ rời khỏi thiết bị sau lúc enroll.
   *
   * Thứ tự kiểm cố định (khớp be.md §5.4, bỏ bước feature-flag vì
   * `requireSystemConfig` chưa tồn tại trong repo — xem báo cáo cuối):
   *   1. Tìm credential theo id.
   *   2. Credential REVOKED?
   *   3. deviceId khớp + HMAC đúng?
   *   4. Hết hạn?
   *   5. Trạng thái tài khoản (LOCKED/ANONYMIZED/PENDING_DELETION).
   *   6. Cấp token qua `TokenIssuer`.
   *   7. Cập nhật lastUsedAt/failedAttempts (compare-and-set).
   *   8. Metric `auth_biometric_login_total`.
   */
  async login(input: BiometricLoginInput): Promise<BiometricLoginResult> {
    const credential = await this.repo.findById(input.credentialId);
    if (!credential) {
      authBiometricLoginTotal.inc({ result: "unknown" });
      throw new UnauthorizedError(BIOMETRIC_INVALID_MESSAGE, ErrorCode.AUTH_013);
    }
    if (credential.status === "REVOKED") {
      authBiometricLoginTotal.inc({ result: "revoked" });
      throw new UnauthorizedError(BIOMETRIC_DISABLED_MESSAGE, ErrorCode.AUTH_014);
    }

    const hmacOk = this.verifyHmac(credential.secretHash, input.nonce, input.hmac);
    if (credential.deviceId !== input.deviceId || !hmacOk) {
      const revoked = await this.handleFailedAttempt(credential);
      if (revoked) {
        authBiometricLoginTotal.inc({ result: "locked" });
        throw new UnauthorizedError(BIOMETRIC_DISABLED_MESSAGE, ErrorCode.AUTH_014);
      }
      authBiometricLoginTotal.inc({ result: "invalid" });
      throw new UnauthorizedError(BIOMETRIC_INVALID_MESSAGE, ErrorCode.AUTH_013);
    }

    if (credential.expiresAt.getTime() <= Date.now()) {
      await this.repo.update(credential.id, {
        status: "REVOKED",
        activeKey: `revoked:${credential.id}`,
        revokeReason: "EXPIRED",
        revokedAt: new Date(),
      });
      authBiometricLoginTotal.inc({ result: "expired" });
      throw new UnauthorizedError(BIOMETRIC_EXPIRED_MESSAGE, ErrorCode.AUTH_015);
    }

    const snap = await getUserStatusCached(credential.userId);
    if (!snap) throw new NotFoundError("Người dùng không tồn tại");
    if (snap.status === "LOCKED" || snap.status === "ANONYMIZED") {
      authBiometricLoginTotal.inc({ result: "locked" });
      throw new AccountLockedError(ErrorCode.AUTH_011);
    }
    if (snap.status === "PENDING_DELETION") {
      authBiometricLoginTotal.inc({ result: "locked" });
      // HMAC đã xác minh ⇒ người gọi là chủ máy đã gắn: trả kèm ngày tự ẩn danh hoá cho màn "Khôi phục tài khoản".
      throw new AccountLockedError(
        ErrorCode.AUTH_012,
        pendingDeletionDetails(await this.userRepo.findById(credential.userId))
      );
    }

    const user = await this.userRepo.findById(credential.userId);
    if (!user) throw new NotFoundError("Người dùng không tồn tại");

    const result = await this.tokenIssuer.issue(user, {
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      deviceId: input.deviceId,
      authMethod: "BIOMETRIC",
      biometricCredentialId: credential.id,
      notifyNewDevice: true,
    });

    // Compare-and-set — thua đua với 1 request thu hồi credential đồng thời
    // (vd admin revoke ngay lúc đang đăng nhập) thì coi như credential đã bị
    // vô hiệu, không trả token vừa cấp cho client dùng tiếp.
    const ok = await this.repo.updateIfStatus(credential.id, "ACTIVE", {
      lastUsedAt: new Date(),
      failedAttempts: 0,
    });
    if (!ok) {
      // Phiên vừa cấp KHÔNG được để sống (client không nhận được token, nhưng phiên vẫn chiếm chỗ
      // trong danh sách và giữ refresh token hợp lệ tới 7 ngày) — thu hồi ngay.
      await this.tokenIssuer.discard(result, credential.userId);
      authBiometricLoginTotal.inc({ result: "locked" });
      throw new UnauthorizedError(BIOMETRIC_DISABLED_MESSAGE, ErrorCode.AUTH_014);
    }

    authBiometricLoginTotal.inc({ result: "ok" });
    return {
      ...result,
      biometric: { credentialId: credential.id, expiresAt: credential.expiresAt },
    };
  }

  /** Danh sách credential ACTIVE của chính mình. */
  async listMine(userId: string, currentDeviceId?: string): Promise<BiometricCredentialSummary[]> {
    const list = await this.repo.findActiveByUser(userId);
    return list.map((c) => ({
      id: c.id,
      deviceName: c.deviceName,
      platform: c.platform,
      biometryKind: c.biometryKind,
      createdAt: c.createdAt,
      lastUsedAt: c.lastUsedAt,
      expiresAt: c.expiresAt,
      current: currentDeviceId !== undefined && c.deviceId === currentDeviceId,
    }));
  }

  /** Tự thu hồi credential của chính mình — idempotent (đã REVOKED vẫn coi là thành công). */
  async revokeMine(
    userId: string,
    credentialId: string,
    reason: "USER_DISABLED" | "ACCOUNT_SWITCHED"
  ): Promise<void> {
    const credential = await this.repo.findById(credentialId);
    if (!credential || credential.userId !== userId) {
      throw new NotFoundError("Không tìm thấy đăng nhập sinh trắc học");
    }
    if (credential.status === "REVOKED") return;
    await this.repo.update(credential.id, {
      status: "REVOKED",
      activeKey: `revoked:${credential.id}`,
      revokeReason: reason,
      revokedAt: new Date(),
    });
  }

  /**
   * Tăng `failedAttempts`; vượt ngưỡng → thu hồi luôn (`TOO_MANY_ATTEMPTS`).
   * Trả `true` nếu CHÍNH lượt gọi này vừa làm credential bị thu hồi (để
   * `login()` trả `AUTH_014` thay vì `AUTH_013` ngay trong cùng response).
   */
  private async handleFailedAttempt(credential: BiometricCredential): Promise<boolean> {
    // `$inc` nguyên tử — không đọc-rồi-ghi `cũ + 1` (các lần thử sai đồng thời sẽ đếm thiếu).
    const failedAttempts =
      (await this.repo.incrementFailedAttempts(credential.id)) ?? credential.failedAttempts + 1;
    if (failedAttempts >= LIMITS.auth.biometric.failedAttemptsMax) {
      await this.repo.update(credential.id, {
        status: "REVOKED",
        activeKey: `revoked:${credential.id}`,
        revokeReason: "TOO_MANY_ATTEMPTS",
        revokedAt: new Date(),
      });
      return true;
    }
    return false;
  }

  /**
   * `expectedHmac = HMAC-SHA256(secretHash, nonce)` — đối xứng với client
   * (client tính HMAC bằng chính `secret` thô nó lưu cục bộ; vì `secretHash =
   * SHA-256(secret)` là hàm 1 chiều xác định, client và server luôn ra cùng
   * khoá HMAC mà KHÔNG cần secret rời khỏi thiết bị lần thứ 2).
   * So bằng `timingSafeEqual` — chặn timing attack dò từng byte.
   */
  private verifyHmac(secretHashHex: string, nonce: string, hmac: string): boolean {
    try {
      const keyBytes = Buffer.from(secretHashHex, "hex");
      const expectedHmac = createHmac("sha256", keyBytes).update(nonce, "utf8").digest("hex");
      const a = Buffer.from(expectedHmac, "hex");
      const b = Buffer.from(hmac, "hex");
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
}
