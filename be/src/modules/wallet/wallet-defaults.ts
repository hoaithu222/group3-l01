import { runtimeConfig } from "../../core/config/runtime-config";
import { LIMITS } from "../../core/constants/limits";
import { createContextLogger } from "../../infrastructure/logger";
import { safeTimeZone } from "../../core/utils/local-date";
import { parseWeeklyCron } from "./domain/wallet-schedule";

const log = createContextLogger({ service: "WalletDefaults" });

/**
 * Lịch nhắc nợ + múi giờ + ngưỡng nợ MẶC ĐỊNH cho ví tạo mới (`SystemConfig` khoá `wallet` và `limits.wallet.reminderMinDebt`, p6-04 README §7). Ví đã có giữ cấu hình riêng
 * do OWNER/ADMIN nhóm đặt (`PUT /workspaces/:id/wallet`).
 */
export interface WalletDefaults {
  reminderCron: string;
  timezone: string;
  reminderMinDebt: number;
}

export type WalletDefaultsReader = () => Promise<WalletDefaults>;

/** Mặc định CỨNG của mã (`LIMITS.wallet`) — dùng khi không có cấu hình runtime (test, lỗi đọc). */
export const staticWalletDefaults: WalletDefaultsReader = () =>
  Promise.resolve({ reminderCron: LIMITS.wallet.defaultReminderCron, timezone: LIMITS.wallet.defaultTz, reminderMinDebt: LIMITS.wallet.reminderMinDebt });

/** Đọc qua `runtimeConfig` (`wallet.defaultReminderCron`, `wallet.defaultTz`, `limits.wallet.reminderMinDebt`); giá trị hỏng/lỗi đọc → mặc định của mã (không làm hỏng nghiệp vụ ví). */
export const readWalletDefaults: WalletDefaultsReader = async () => {
  const fallback = await staticWalletDefaults();
  try {
    const [cron, tz, limits] = await Promise.all([
      runtimeConfig.get("wallet.defaultReminderCron"),
      runtimeConfig.get("wallet.defaultTz"),
      runtimeConfig.getEffective("limits.wallet"),
    ]);
    const minDebt = limits.reminderMinDebt;
    return {
      reminderCron: typeof cron === "string" && parseWeeklyCron(cron) !== null ? cron : fallback.reminderCron,
      timezone: typeof tz === "string" && safeTimeZone(tz) === tz ? tz : fallback.timezone,
      reminderMinDebt: typeof minDebt === "number" && Number.isInteger(minDebt) && minDebt >= 0 ? minDebt : fallback.reminderMinDebt,
    };
  } catch (err) {
    log.warn("Không đọc được cấu hình wallet, dùng mặc định", { error: err instanceof Error ? err.message : String(err) });
    return fallback;
  }
};
