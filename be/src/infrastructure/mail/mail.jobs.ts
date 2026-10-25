import { UnrecoverableError } from "bullmq";
import { registerJob } from "../queue/worker";
import { logger } from "../logger";
import { mailService } from "./nodemailer.service";

interface MailSendPayload {
  template: string;
  to: string;
  vars: Record<string, string>;
}

/** Che phần local-part trước "@" khi log — không log địa chỉ email đầy đủ (be.md §5.6). */
function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!name || !domain) return "***";
  return `${name.slice(0, 1)}***@${domain}`;
}

/** SMTP 5xx (`responseCode` 5xx) là lỗi vĩnh viễn (địa chỉ/domain không tồn tại) — retry vô ích. */
function isPermanentSmtpError(err: unknown): boolean {
  const code = (err as { responseCode?: number } | undefined)?.responseCode;
  return typeof code === "number" && code >= 500 && code < 600;
}

/**
 * `mail.send` (queue `notifications`) — processor cho `mailService.enqueueMail()`.
 * Lỗi SMTP vĩnh viễn (5xx) ném `UnrecoverableError` (bullmq) để BullMQ KHÔNG
 * retry (đỡ tốn 5 lần thử vô ích); lỗi tạm thời (mất kết nối SMTP...) throw
 * bình thường để BullMQ tự retry theo `backoff` đã khai ở `enqueueMail`.
 *
 * ⚠️ Hạ tầng đã sẵn sàng nhưng CHƯA có call-site nào migrate — luồng
 * auth/bảo mật (`sendWelcome`/`sendResetPassword`/`sendNewDeviceLogin`) vẫn
 * gọi `sendRaw` đồng bộ như cũ, có chủ đích (xem be.md/README p0-04).
 */
registerJob("notifications", "mail.send", async (job) => {
  const { template, to, vars } = job.data as MailSendPayload;
  try {
    await mailService.sendTemplate(to, template, vars);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[mail.send] Gửi email thất bại", { template, to: maskEmail(to), error: message });
    if (isPermanentSmtpError(err)) {
      throw new UnrecoverableError(message);
    }
    throw err;
  }
});
