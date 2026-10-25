import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import type { IUserRepository } from "../../users/repositories/user.repository.interface";
import type { User } from "../../users/entities/user.interface";
import { ConflictError, UnauthorizedError } from "../../../core/exceptions";
import { ROLES } from "../../../core/constants";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { normalizeEmail } from "../../../core/auth/normalize-email";
import { stripHtml } from "../../../core/utils/html-sanitizer";
import { mailService } from "../../../infrastructure/mail";
import type { FirebaseIdentity, IFirebaseIdentityVerifier } from "../../../infrastructure/firebase";
import type { SessionService } from "./session.service";
import type { AuthResult, IssueTokenMeta, TokenIssuer } from "./token-issuer";
import { SALT_ROUNDS } from "./password.service";
import { fireAndForget, type AuditRecorder } from "./auth-audit";
import { accountBlockedError } from "./account-lock";

/** Nhà cung cấp danh tính được phép đăng nhập (`firebase.sign_in_provider`) — thêm `apple.com`… khi app hỗ trợ. */
const ALLOWED_PROVIDERS: ReadonlySet<string> = new Set(["google.com"]);

/**
 * Chỉ nhận token của lần xác thực với nhà cung cấp trong khoảng này (claim `auth_time`): ID token Firebase sống 1 giờ
 * và là bearer — token bị lộ không dùng lại để đăng nhập được lâu. App luôn bắt người dùng chọn tài khoản Google MỚI mỗi lần bấm nút.
 */
export const MAX_AUTH_AGE_SECONDS = 5 * 60;

const NAME_MAX = 80;

export interface SocialLoginDeps {
  verifier: IFirebaseIdentityVerifier;
  audit?: AuditRecorder;
  /** Ghi đè đồng hồ cho test (epoch ms). */
  now?: () => number;
}

interface Resolved {
  user: User;
  created: boolean;
  /** Tài khoản có sẵn CHƯA xác minh email đã bị vô hiệu mật khẩu cũ — xem `linkExisting`. */
  passwordInvalidated: boolean;
}

/**
 * Đăng nhập bằng mạng xã hội qua Firebase (`POST /auth/firebase-login`).
 *
 * Danh tính = email ĐÃ XÁC MINH do nhà cung cấp chứng thực (không có bảng liên kết riêng):
 *  - chưa có tài khoản ⇒ tạo mới (`role=USER`, không mật khẩu, email đã xác minh);
 *  - có tài khoản ⇒ đăng nhập vào chính tài khoản đó. Nếu tài khoản có sẵn CHƯA xác minh email, mật khẩu cũ bị đổi thành giá trị
 *    không dùng được và mọi phiên bị thu hồi TRƯỚC khi cấp token — chống "chiếm chỗ" (kẻ xấu đăng ký trước bằng email của nạn nhân
 *    với mật khẩu của hắn, rồi nạn nhân đăng nhập Google vào đúng tài khoản đó).
 * Khoá tài khoản/chờ xoá được kiểm SAU khi danh tính đã được chứng minh (giống `login` kiểm sau mật khẩu đúng).
 */
export class SocialLoginService {
  private readonly now: () => number;

  constructor(
    private readonly userRepo: IUserRepository,
    private readonly tokenIssuer: TokenIssuer,
    private readonly sessions: SessionService | undefined,
    private readonly deps: SocialLoginDeps
  ) {
    this.now = deps.now ?? Date.now;
  }

  async login(idToken: string, meta?: Omit<IssueTokenMeta, "authMethod">): Promise<AuthResult> {
    const identity = await this.deps.verifier.verify(idToken);
    const email = this.assertEligible(identity);

    const existing = await this.userRepo.findByEmail(email);
    const { user, created, passwordInvalidated } = existing
      ? await this.linkExisting(existing)
      : await this.createNew(email, identity);

    const result = await this.tokenIssuer.issue(user, {
      ...meta,
      authMethod: "SOCIAL",
      // Tài khoản vừa tạo: thiết bị nào cũng "mới" — vô nghĩa cảnh báo (giống `register`).
      notifyNewDevice: created ? false : meta?.notifyNewDevice,
    });

    fireAndForget("ghi audit đăng nhập mạng xã hội", async () => {
      await this.deps.audit?.record({
        actorId: user.id,
        actorRole: user.role,
        action: "auth.social-login",
        targetType: "User",
        targetId: user.id,
        ip: meta?.ipAddress,
        userAgent: meta?.userAgent,
        metadata: { provider: identity.provider, created, passwordInvalidated },
      });
    });
    return result;
  }

  /** Trả email đã chuẩn hoá nếu danh tính đủ điều kiện đăng nhập; ném `AUTH_022`/`AUTH_023` nếu không. */
  private assertEligible(identity: FirebaseIdentity): string {
    if (!ALLOWED_PROVIDERS.has(identity.provider) || !identity.email || !identity.emailVerified) {
      throw new UnauthorizedError(ErrorMessages[ErrorCode.AUTH_023], ErrorCode.AUTH_023);
    }
    const ageSeconds = this.now() / 1000 - identity.authTime;
    // `!(x <= max)` để NaN/thiếu `auth_time` cũng bị từ chối.
    if (!(ageSeconds <= MAX_AUTH_AGE_SECONDS)) {
      throw new UnauthorizedError(ErrorMessages[ErrorCode.AUTH_022], ErrorCode.AUTH_022);
    }
    return normalizeEmail(identity.email);
  }

  private async linkExisting(user: User): Promise<Resolved> {
    if (user.status && user.status !== "ACTIVE") throw accountBlockedError(user);
    if (user.emailVerified) return { user, created: false, passwordInvalidated: false };

    // Email chưa từng được xác minh ⇒ chưa thể tin mật khẩu hiện có là của chủ email. Thứ tự quan trọng: đổi mật khẩu → thu hồi phiên
    // → đánh dấu đã xác minh (bước cuối), nên lỗi giữa chừng để tài khoản vẫn "chưa xác minh" và lượt đăng nhập sau chạy lại từ đầu.
    await this.userRepo.update(user.id, { passwordHash: await unusablePasswordHash() });
    await this.sessions?.revokeAll(user.id, "PASSWORD_RESET");
    // `update` trả bản ghi MỚI (có `sessionVersion` sau khi thu hồi) — token cấp cho lượt này phải mang đúng `sv`.
    const verified = (await this.userRepo.update(user.id, { emailVerified: true })) ?? user;
    return { user: verified, created: false, passwordInvalidated: !!user.passwordHash };
  }

  private async createNew(email: string, identity: FirebaseIdentity): Promise<Resolved> {
    const name = displayName(identity.name, email);
    try {
      const user = await this.userRepo.create({ email, name, role: ROLES.USER, emailVerified: true });
      fireAndForget("gửi email chào mừng", () => mailService.sendWelcome(email, name));
      return { user, created: true, passwordInvalidated: false };
    } catch (err) {
      // Hai lượt đăng nhập ĐẦU TIÊN đồng thời: repository chuyển vi phạm unique email thành ConflictError — lấy tài khoản của bên thắng.
      if (!(err instanceof ConflictError)) throw err;
      const winner = await this.userRepo.findByEmail(email);
      if (!winner) throw err;
      return this.linkExisting(winner);
    }
  }
}

/** Hash bcrypt của chuỗi ngẫu nhiên 32 byte không ai biết — mật khẩu "đã bị khoá" (chủ tài khoản đặt lại qua "Quên mật khẩu"). */
async function unusablePasswordHash(): Promise<string> {
  return bcrypt.hash(randomBytes(32).toString("hex"), SALT_ROUNDS);
}

/** Tên hiển thị từ nhà cung cấp: bỏ thẻ HTML/ký tự điều khiển (claim KHÔNG đi qua `sanitizeInput`), cắt 80 ký tự, rỗng ⇒ phần trước `@`. */
function displayName(raw: string | null, email: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = stripHtml(raw ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (cleaned || email.split("@")[0]).slice(0, NAME_MAX);
}
