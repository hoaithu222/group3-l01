/**
 * Tùy chọn gửi email thô.
 */
export interface MailOptions {
  /** Địa chỉ người nhận (có thể là mảng) */
  to: string | string[];
  /** Tiêu đề email */
  subject: string;
  /** Nội dung HTML */
  html?: string;
  /** Nội dung plain-text (fallback khi HTML không hiển thị) */
  text?: string;
  /** Địa chỉ gửi (override SMTP_FROM) */
  from?: string;
  /**
   * (p2-04) Lời mời lịch `.ics` — nodemailer gắn `text/calendar; method=...` vào email để Outlook/Gmail/Apple Calendar tự
   * hiển thị nút Chấp nhận/Cập nhật/Huỷ. `content` là VCALENDAR đầy đủ (xem `mail/ics/ics-builder.ts`).
   */
  icalEvent?: { method: "REQUEST" | "CANCEL" | "PUBLISH"; content: string; filename?: string };
}

/**
 * IMailService — interface tổng quát cho mail layer.
 * Impl cụ thể: NodemailerService (SMTP).
 */
export interface IMailService {
  /**
   * Gửi email chào mừng sau khi đăng ký.
   * @param to   - Địa chỉ người nhận
   * @param name - Tên hiển thị
   */
  sendWelcome(to: string, name: string): Promise<void>;

  /**
   * Gửi email đặt lại mật khẩu.
   * @param to    - Địa chỉ người nhận
   * @param token - Reset token (nhúng vào link)
   */
  sendResetPassword(to: string, token: string): Promise<void>;

  /**
   * Gửi email tuỳ chỉnh.
   */
  sendRaw(options: MailOptions): Promise<void>;

  /**
   * Cảnh báo đăng nhập từ thiết bị/vị trí chưa từng dùng.
   * @param to   - Địa chỉ người nhận
   * @param meta - Thông tin phiên đăng nhập mới
   */
  sendNewDeviceLogin(
    to: string,
    meta: { userAgent?: string; ipAddress?: string; at: Date }
  ): Promise<void>;
}
