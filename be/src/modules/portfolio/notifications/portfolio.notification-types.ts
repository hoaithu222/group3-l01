import { registerNotificationType } from "../../notifications/public";
import type { NotificationTypeDef } from "../../notifications/public";

/**
 * Loại thông báo của p6-07 (đăng ký qua `registerNotificationType`, tạo bằng `notify()` trong transaction). Không gắn scope; `refs` chỉ có id (portfolioId/buildId) — push KHÔNG lộ
 * lý do gỡ, danh tính người báo cáo hay nội dung hồ sơ. Tên loại theo quy ước dấu chấm hiện hành (`career.skill-unlocked`…); kế hoạch ghi `PORTFOLIO_BUILD_FAILED`/`PORTFOLIO_TAKEN_DOWN`.
 * Dựng trang THÀNH CÔNG không tạo thông báo (chỉ socket `portfolio:build-updated`).
 */
export const PORTFOLIO_NOTIFICATION_TYPES = {
  BUILD_FAILED: "portfolio.build-failed",
  TAKEN_DOWN: "portfolio.taken-down",
} as const;

const BASE: Omit<NotificationTypeDef, "type" | "pushType" | "priority" | "push" | "batchable"> = {
  inbox: true,
  inboxFilter: "all",
  androidChannel: "default",
  respectMute: "ALWAYS",
  bypassDnd: false,
  readAction: null,
};

/** Idempotent (registry là `Map.set`) — gọi lúc import route (API) lẫn file job (worker). */
export function registerPortfolioNotificationTypes(): void {
  registerNotificationType({
    ...BASE,
    type: PORTFOLIO_NOTIFICATION_TYPES.BUILD_FAILED,
    pushType: PORTFOLIO_NOTIFICATION_TYPES.BUILD_FAILED,
    priority: 2,
    batchable: false,
    push: {
      ttlSeconds: 24 * 3600,
      collapseKey: () => "portfolio-build-failed",
      dataKeys: ["portfolioId", "buildId"],
      template: () => ({ title: "Chưa tạo được trang portfolio", body: "Trang portfolio của bạn chưa được công khai. Mở hồ sơ và thử lại nhé." }),
    },
  });
  registerNotificationType({
    ...BASE,
    type: PORTFOLIO_NOTIFICATION_TYPES.TAKEN_DOWN,
    pushType: PORTFOLIO_NOTIFICATION_TYPES.TAKEN_DOWN,
    priority: 3,
    batchable: false,
    push: {
      ttlSeconds: 7 * 24 * 3600,
      collapseKey: () => "portfolio-taken-down",
      dataKeys: ["portfolioId"],
      template: () => ({ title: "Portfolio đã bị gỡ", body: "Portfolio của bạn đã bị gỡ do vi phạm quy định. Liên hệ hỗ trợ để được xem xét." }),
    },
  });
}
