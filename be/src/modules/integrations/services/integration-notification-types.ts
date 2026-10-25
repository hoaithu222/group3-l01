import { INTEGRATION_PROVIDER_LABELS, type IntegrationProviderValue } from "../../../core/constants/integration";
import { registerNotificationType } from "../../notifications/public";

/** Chuỗi `type` thông báo lỗi tích hợp (kế hoạch gọi `INTEGRATION_ERROR`; theo quy ước chữ thường + dấu chấm của `registerNotificationType`). */
export const INTEGRATION_ERROR_TYPE = "integration.error";

/** Lý do → câu tiếng Việt cho push/hộp thư (app/admin có bảng nhãn riêng cho màn hình). Không chứa tên kênh/người. */
export const INTEGRATION_REASON_TEXT: Record<string, string> = {
  TARGET_FORBIDDEN: "Không còn quyền đăng vào kênh nhận thông báo",
  TARGET_ARCHIVED: "Kênh nhận thông báo không còn khả dụng",
  PROVIDER_REVOKED: "Ứng dụng đã bị gỡ khỏi tài khoản — hãy kết nối lại",
  PROVIDER_SUSPENDED: "Cài đặt đang bị tạm ngưng ở nhà cung cấp",
  TOKEN_INVALID: "Kết nối đã hết hạn — hãy kết nối lại",
  HOOK_MISSING: "Webhook ở nhà cung cấp đã bị xoá — hãy kết nối lại",
};

function providerLabel(value: unknown): string {
  return typeof value === "string" && value in INTEGRATION_PROVIDER_LABELS ? INTEGRATION_PROVIDER_LABELS[value as IntegrationProviderValue] : "Tích hợp";
}

/**
 * Đăng ký loại thông báo `integration.error` (p5-03 README §5): hộp thư + push tới người kết nối và OWNER khi kết nối chuyển ERROR/REVOKED. Gọi lúc `router.ts`
 * boot (API) VÀ lúc import file job (worker) — idempotent (đăng ký lại cùng `type` thì thay thế), giữ parity API ↔ worker (`worker-registries.parity.test.ts`).
 */
export function registerIntegrationNotificationTypes(): void {
  registerNotificationType({
    type: INTEGRATION_ERROR_TYPE,
    inbox: true,
    inboxFilter: "all",
    pushType: "integration.error",
    androidChannel: "default",
    priority: 3,
    respectMute: "ALWAYS",
    bypassDnd: false,
    batchable: false,
    readAction: null,
    push: {
      dataKeys: ["integrationId", "workspaceId", "provider", "reason"],
      collapseKey: (refs) => `integration-error:${typeof refs["integrationId"] === "string" ? refs["integrationId"] : "-"}`,
      template: ({ refs }) => ({
        title: `${providerLabel(refs["provider"])} gặp lỗi`,
        body: (typeof refs["reason"] === "string" && INTEGRATION_REASON_TEXT[refs["reason"]]) || "Kết nối tích hợp cần được kiểm tra",
      }),
    },
  });
}
