import { logger } from "../../../infrastructure/logger";

/**
 * Cổng ghi audit log — thoả mãn bởi `AuditService` (module audit-log) qua
 * structural typing; nơi dựng (`auth.routes.ts`) truyền vào, `modules/auth`
 * không import module khác cho việc này.
 */
export interface AuditRecorder {
  record(input: {
    actorId: string;
    actorRole?: string;
    action: string;
    targetType: string;
    targetId: string;
    reason?: string;
    metadata?: Record<string, unknown>;
    ip?: string;
    userAgent?: string;
  }): Promise<void>;
}

/** Ngữ cảnh request kèm theo mọi thao tác nhạy cảm để ghi audit/gửi cảnh báo. */
export interface RequestMeta {
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Chạy việc "bắn rồi quên" (email cảnh báo…): không chặn phản hồi, KHÔNG bao
 * giờ ném lỗi ra ngoài — kể cả khi `fn` ném đồng bộ (vd mock/dịch vụ chưa cấu hình).
 */
export function fireAndForget(label: string, fn: () => unknown): void {
  void (async () => {
    try {
      await fn();
    } catch (err) {
      logger.warn(`[auth] ${label} thất bại (bỏ qua):`, err);
    }
  })();
}
