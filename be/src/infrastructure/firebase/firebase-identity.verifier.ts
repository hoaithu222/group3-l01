import type { App } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { AppError, UnauthorizedError } from "../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../core/utils/error.codes";
import { logger } from "../logger";
import { getFirebaseApp } from "./firebase-app";

/** Danh tính đã được Firebase xác thực (đã kiểm chữ ký, `aud`/`iss` của đúng project, hạn dùng, thu hồi). */
export interface FirebaseIdentity {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  /** `firebase.sign_in_provider`: `google.com`, `apple.com`, `password`, `anonymous`, `phone`… */
  provider: string;
  /** Lần XÁC THỰC gần nhất với nhà cung cấp (claim `auth_time`, epoch giây) — khác `iat` (làm mới token). */
  authTime: number;
}

export interface IFirebaseIdentityVerifier {
  /** Ném `UnauthorizedError(AUTH_022)` khi token sai/hết hạn/bị thu hồi; `AppError 503 SYS_503` khi chưa cấu hình hoặc Firebase không với tới được. */
  verify(idToken: string): Promise<FirebaseIdentity>;
}

/** Lỗi do CHÍNH token (client gửi sai/hết hạn) — khác lỗi hạ tầng (mạng, quyền service-account) ⇒ 503, để client thử lại. */
const TOKEN_ERROR_CODES = new Set([
  "auth/id-token-expired",
  "auth/id-token-revoked",
  "auth/argument-error",
  "auth/invalid-id-token",
  "auth/user-disabled",
  "auth/user-not-found",
]);

function unavailable(): AppError {
  return new AppError(ErrorMessages[ErrorCode.SYS_503], 503, ErrorCode.SYS_503);
}

function mapVerifyError(err: unknown): AppError {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === "string" && TOKEN_ERROR_CODES.has(code)) {
    return new UnauthorizedError(ErrorMessages[ErrorCode.AUTH_022], ErrorCode.AUTH_022);
  }
  logger.error("[firebase] Không xác thực được ID token do lỗi hạ tầng", {
    code,
    err: err instanceof Error ? err.message : String(err),
  });
  return unavailable();
}

function toIdentity(decoded: DecodedIdToken): FirebaseIdentity {
  return {
    uid: decoded.uid,
    email: decoded.email ?? null,
    emailVerified: decoded.email_verified === true,
    name: typeof decoded.name === "string" && decoded.name.trim() ? decoded.name : null,
    provider: decoded.firebase?.sign_in_provider ?? "unknown",
    authTime: decoded.auth_time,
  };
}

export class FirebaseIdentityVerifier implements IFirebaseIdentityVerifier {
  constructor(private readonly app: App) {}

  async verify(idToken: string): Promise<FirebaseIdentity> {
    try {
      // `checkRevoked = true`: từ chối cả token của tài khoản Firebase đã bị vô hiệu hoá/thu hồi (thêm 1 lượt gọi mạng — chấp nhận được với đăng nhập).
      return toIdentity(await getAuth(this.app).verifyIdToken(idToken, true));
    } catch (err) {
      throw mapVerifyError(err);
    }
  }
}

/** Chưa cấu hình credentials Firebase — fail-CLOSED 503 (không bao giờ cho qua đăng nhập). */
class UnconfiguredIdentityVerifier implements IFirebaseIdentityVerifier {
  async verify(): Promise<FirebaseIdentity> {
    logger.warn("[firebase] Đăng nhập mạng xã hội bị từ chối: chưa cấu hình FIREBASE_* trên server");
    throw unavailable();
  }
}

let cached: IFirebaseIdentityVerifier | undefined;

/** Factory — memoized. Thiếu credentials ⇒ bản fail-closed (503), không chặn khởi động server. */
export function getFirebaseIdentityVerifier(): IFirebaseIdentityVerifier {
  if (cached) return cached;
  const app = getFirebaseApp();
  cached = app ? new FirebaseIdentityVerifier(app) : new UnconfiguredIdentityVerifier();
  return cached;
}

/** Chỉ dùng trong test — xoá cache để đổi env giữa các case. */
export function resetFirebaseIdentityVerifierCache(): void {
  cached = undefined;
}
