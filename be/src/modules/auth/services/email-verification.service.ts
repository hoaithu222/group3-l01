import { randomInt, timingSafeEqual } from "crypto";
import { prisma } from "../../../infrastructure/database";
import { AppError, NotFoundError } from "../../../core/exceptions";
import { PasswordAttemptGuard } from "../../../core/auth/password-attempt-guard";
import { env } from "../../../core/config";
import { mailService } from "../../../infrastructure/mail";
import { logger } from "../../../infrastructure/logger";
import { ErrorCode } from "../../../core/utils/error.codes";

const VERIFICATION_CODE_TTL = 15 * 60; // 15 phút (giây)
const INVALID_CODE_MESSAGE = "Mã xác minh không hợp lệ hoặc đã hết hạn";
const ALREADY_VERIFIED_MESSAGE = "Email đã được xác minh";

/**
 * Mã lỗi RIÊNG (trước đây cả hai đều `VAL_001` nên client phải đọc câu chữ để phân biệt): `AUTH_019` đã xác minh, `AUTH_020` mã sai/hết hạn.
 * HTTP status vẫn 400 và thông điệp giữ nguyên chữ — client cũ (phân loại theo status 400 + câu gốc) chạy như trước.
 */
const alreadyVerified = (): AppError => new AppError(ALREADY_VERIFIED_MESSAGE, 400, ErrorCode.AUTH_019);

/** So sánh mã theo thời gian không phụ thuộc số ký tự đúng (chuỗi độ dài khác nhau ⇒ sai). */
function sameCode(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Xác minh email bằng mã 6 chữ số.
 *
 * `emailVerified` là cơ sở để tin email của tài khoản (vd nhận lời mời workspace
 * theo email — p3-04), nên mã phải KHÔNG đoán được và KHÔNG dò được:
 *   - sinh bằng `crypto.randomInt` (CSPRNG) — `Math.random()` đoán trước được;
 *   - sai `LIMITS.auth.passwordAttempts.failedAttemptsMax` lần ⇒ khoá tạm theo
 *     TÀI KHOẢN (không thì 10^6 khả năng dò hết được qua nhiều IP);
 *   - không log mã ở production (chỉ dev khi chưa cấu hình SMTP).
 */
export class EmailVerificationService {
  constructor(
    private readonly guard: PasswordAttemptGuard = new PasswordAttemptGuard("verify-email")
  ) {}

  /** Gửi mã xác minh 6 chữ số — lưu vào DB, gửi mail. */
  async send(userId: string): Promise<void> {
    // Query directly to get emailVerified field (not in User entity interface)
    const record = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, emailVerified: true },
    });
    if (!record) throw new NotFoundError("Người dùng không tồn tại");

    if (record.emailVerified) throw alreadyVerified();

    const code = randomInt(100_000, 1_000_000).toString();
    const expires = new Date(Date.now() + VERIFICATION_CODE_TTL * 1000);

    await prisma.user.update({
      where: { id: userId },
      data: { verificationToken: code, verificationTokenExpires: expires },
    });

    // Send email — fallback to log if SMTP not configured
    const smtpConfigured = !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);

    if (smtpConfigured) {
      await mailService.sendRaw({
        to: record.email,
        subject: "Xác minh địa chỉ email của bạn",
        html: `<p>Mã xác minh của bạn: <strong>${code}</strong> (có hiệu lực 15 phút)</p>`,
        text: `Mã xác minh của bạn: ${code} (có hiệu lực 15 phút)`,
      });
    } else if (env.NODE_ENV !== "production") {
      logger.info(`[DEV EMAIL] verification code: ${code} for ${record.email}`);
    } else {
      // Production chưa cấu hình SMTP: KHÔNG ghi mã vào log (mã là bí mật xác minh).
      logger.warn("[EmailVerificationService] Chưa cấu hình SMTP — không gửi được mã xác minh", {
        userId,
      });
    }

    logger.info("[EmailVerificationService] Verification code sent", { userId });
  }

  /** Xác nhận email bằng mã 6 chữ số. */
  async confirm(userId: string, code: string): Promise<void> {
    await this.guard.assertNotLocked(userId);

    const record = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        emailVerified: true,
        verificationToken: true,
        verificationTokenExpires: true,
      },
    });

    if (!record) throw new NotFoundError("Người dùng không tồn tại");
    if (record.emailVerified) throw alreadyVerified();

    if (
      !record.verificationToken ||
      !record.verificationTokenExpires ||
      !sameCode(record.verificationToken, code) ||
      record.verificationTokenExpires < new Date()
    ) {
      await this.guard.recordFailure(userId);
      throw new AppError(INVALID_CODE_MESSAGE, 400, ErrorCode.AUTH_020);
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        emailVerified: true,
        emailVerifiedAt: new Date(),
        verificationToken: null,
        verificationTokenExpires: null,
      },
    });
    await this.guard.reset(userId);

    logger.info("[EmailVerificationService] Email verified", { userId });
  }
}
