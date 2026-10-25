import nodemailer from "nodemailer";
import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import type { IMailService, MailOptions } from "./mail.interface";
import { env } from "../../core/config";
import { logger } from "../logger";
import { enqueue } from "../queue";

/**
 * NodemailerService — implements IMailService dùng SMTP qua Nodemailer.
 * Graceful fallback: nếu thiếu SMTP config, chỉ log cảnh báo thay vì crash.
 */
export class NodemailerService implements IMailService {
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      });
      logger.info("[Mail] Nodemailer transporter đã sẵn sàng");
    } else {
      logger.warn("[Mail] Thiếu biến SMTP_*. Mail service chạy ở chế độ no-op.");
    }
  }

  /**
   * Escape giá trị trước khi chèn vào template HTML.
   *
   * `sendWelcome(to, name)` nhận `name` do người dùng tự đặt khi đăng ký. Chèn
   * thẳng vào HTML nghĩa là một tên như
   *   `<a href="https://gia-mao.example">Bấm để xác minh</a>`
   * biến email chính chủ của hệ thống thành trang phishing — gửi từ domain thật,
   * qua SPF/DKIM thật. Đây là HTML injection, không phải XSS trình duyệt, nhưng
   * hậu quả (lừa đảo danh nghĩa hệ thống) còn nặng hơn.
   */
  private static escapeHtml(value: string): string {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Đọc template HTML và thay thế placeholder dạng {{key}} (đã escape) */
  private loadTemplate(name: string, vars: Record<string, string>): string {
    // Tên template do code gọi truyền vào, nhưng vẫn chặn traversal để một
    // refactor sau này không vô tình mở `loadTemplate(req.body.template)`.
    if (!/^[a-z0-9-]+$/i.test(name)) {
      logger.warn(`[Mail] Tên template không hợp lệ: "${name}"`);
      return "";
    }

    const templatePath = path.join(__dirname, "templates", `${name}.html`);
    try {
      let html = fs.readFileSync(templatePath, "utf-8");
      for (const [key, val] of Object.entries(vars)) {
        html = html.replaceAll(`{{${key}}}`, NodemailerService.escapeHtml(val));
      }
      return html;
    } catch (err) {
      logger.warn(`[Mail] Không đọc được template "${name}":`, err);
      return `<p>${Object.values(vars).map((v) => NodemailerService.escapeHtml(v)).join(" ")}</p>`;
    }
  }

  /** {@inheritDoc IMailService.sendWelcome} */
  async sendWelcome(to: string, name: string): Promise<void> {
    const html = this.loadTemplate("welcome", { name });
    await this.sendRaw({
      to,
      subject: "Chào mừng bạn đến với hệ thống!",
      html,
    });
  }

  /** {@inheritDoc IMailService.sendResetPassword} */
  async sendResetPassword(to: string, token: string): Promise<void> {
    const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${token}`;
    const html = this.loadTemplate("reset-password", { token, url: resetUrl });
    await this.sendRaw({
      to,
      subject: "Yêu cầu đặt lại mật khẩu",
      html,
    });
  }

  /** {@inheritDoc IMailService.sendNewDeviceLogin} */
  async sendNewDeviceLogin(
    to: string,
    meta: { userAgent?: string; ipAddress?: string; at: Date }
  ): Promise<void> {
    const changePasswordUrl = `${env.FRONTEND_URL}/change-password`;
    const html = this.loadTemplate("new-device-login", {
      at: meta.at.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }),
      userAgent: meta.userAgent ?? "Không xác định",
      ipAddress: meta.ipAddress ?? "Không xác định",
      url: changePasswordUrl,
    });
    await this.sendRaw({
      to,
      subject: "Cảnh báo: Đăng nhập từ thiết bị mới",
      html,
    });
  }

  /**
   * Gửi email theo tên template tuỳ ý — dùng bởi job `mail.send` (`enqueueMail`,
   * `mail.jobs.ts`). Tái dùng `loadTemplate`/`sendRaw` sẵn có, không lặp logic
   * escape/đọc file. `vars.subject` (nếu có) là tiêu đề email, không được đưa
   * vào phần thay placeholder của template.
   */
  async sendTemplate(to: string, template: string, vars: Record<string, string>): Promise<void> {
    const { subject, ...templateVars } = vars;
    const html = this.loadTemplate(template, templateVars);
    await this.sendRaw({ to, subject: subject ?? "Thông báo từ hệ thống", html });
  }

  /**
   * Đưa 1 email vào hàng đợi `notifications`/`mail.send` thay vì gửi đồng bộ —
   * `jobId` idempotent theo `template` + hash(`to` + `ref`) nên gọi lại với
   * cùng tham chiếu nghiệp vụ (vd cùng đơn hàng) không gửi trùng.
   *
   * ⚠️ Hạ tầng (p0-04): CHƯA có call-site nào migrate sang dùng hàm này —
   * `sendWelcome`/`sendResetPassword`/`sendNewDeviceLogin` (luồng auth/bảo
   * mật) vẫn gọi `sendRaw` đồng bộ như cũ, có chủ đích (xem be.md/README).
   */
  async enqueueMail(
    template: string,
    to: string,
    vars: Record<string, string> = {},
    ref = ""
  ): Promise<void> {
    const dedupe = createHash("sha256").update(`${to}${ref}`).digest("hex").slice(0, 16);
    await enqueue(
      "notifications",
      "mail.send",
      { template, to, vars },
      {
        jobId: `mail.send:${template}:${dedupe}`,
        attempts: 5,
        backoff: { type: "exponential", delay: 10000 },
      }
    );
  }

  /** {@inheritDoc IMailService.sendRaw} */
  async sendRaw(options: MailOptions): Promise<void> {
    if (!this.transporter) {
      logger.warn(
        `[Mail] No-op sendRaw — to: ${Array.isArray(options.to) ? options.to.join(",") : options.to}`
      );
      return;
    }
    try {
      const info = await this.transporter.sendMail({
        from: options.from ?? env.SMTP_FROM ?? env.SMTP_USER,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        ...(options.icalEvent ? { icalEvent: options.icalEvent } : {}),
      });
      logger.info(`[Mail] Gửi thành công: ${info.messageId}`);
    } catch (err) {
      logger.error("[Mail] Gửi email thất bại:", err);
      throw err;
    }
  }
}

/** Instance dùng chung toàn app */
export const mailService = new NodemailerService();
