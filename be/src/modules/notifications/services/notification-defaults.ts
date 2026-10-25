import { runtimeConfig } from "../../../core/config/runtime-config";
import { FALLBACK_DEFAULTS, type NotificationDefaults } from "./preference-matrix";

/**
 * Mặc định cài đặt thông báo (`SystemConfig notification.defaults` ⊕ `LIMITS.notification.defaults`) — nguồn
 * duy nhất cho `MessagePreferenceResolver` (push) và `NotificationPreferenceService` (API). Lỗi đọc cấu hình →
 * rơi về mặc định trong mã (không làm hỏng push/API vì hạ tầng cấu hình).
 */
export async function messageDefaultsLoader(): Promise<NotificationDefaults> {
  try {
    const eff = (await runtimeConfig.getEffective("notification.defaults")) as Partial<NotificationDefaults>;
    return { ...FALLBACK_DEFAULTS, ...eff };
  } catch {
    return FALLBACK_DEFAULTS;
  }
}
