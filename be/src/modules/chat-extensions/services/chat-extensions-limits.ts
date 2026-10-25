import { LIMITS } from "../../../core/constants/limits";
import { runtimeConfig } from "../../../core/config/runtime-config";
import { createContextLogger } from "../../../infrastructure/logger";

const log = createContextLogger({ service: "ChatExtensionsLimits" });

export interface ChatExtLimits {
  poll: { optionsMin: number; optionsMax: number; questionMax: number; optionMax: number; closesInMaxDays: number; closeMinLeadSeconds: number; votersPageMax: number };
  scheduled: { pendingPerUserMax: number; sendAtMaxDays: number; minLeadSeconds: number; staleSendingSeconds: number; sendRetries: number };
  reminder: { pendingPerUserMax: number; remindAtMaxDays: number; minLeadSeconds: number };
}

const DEFAULTS: ChatExtLimits = {
  poll: {
    optionsMin: LIMITS.poll.optionsMin,
    optionsMax: LIMITS.poll.optionsMax,
    questionMax: LIMITS.poll.questionMax,
    optionMax: LIMITS.poll.optionMax,
    closesInMaxDays: LIMITS.poll.closesInMaxDays,
    closeMinLeadSeconds: LIMITS.poll.closeMinLeadSeconds,
    votersPageMax: LIMITS.poll.votersPageMax,
  },
  scheduled: {
    pendingPerUserMax: LIMITS.scheduledMessage.pendingPerUserMax,
    sendAtMaxDays: LIMITS.scheduledMessage.sendAtMaxDays,
    minLeadSeconds: LIMITS.scheduledMessage.minLeadSeconds,
    staleSendingSeconds: LIMITS.scheduledMessage.staleSendingSeconds,
    sendRetries: LIMITS.scheduledMessage.sendRetries,
  },
  reminder: {
    pendingPerUserMax: LIMITS.reminder.pendingPerUserMax,
    remindAtMaxDays: LIMITS.reminder.remindAtMaxDays,
    minLeadSeconds: LIMITS.reminder.minLeadSeconds,
  },
};

type Overrides = { poll: Partial<ChatExtLimits["poll"]>; scheduled: Partial<ChatExtLimits["scheduled"]>; reminder: Partial<ChatExtLimits["reminder"]> };

/**
 * Giới hạn hiệu lực = `LIMITS.poll|scheduledMessage|reminder` ⊕ override `SystemConfig` (`limits.poll` / `limits.scheduledMessage` / `limits.reminder`; admin chỉ HẠ được, kẹp bởi registry).
 * Lỗi đọc cấu hình (Redis/DB) → dùng mặc định cứng — không để việc đọc cấu hình làm hỏng thao tác chat. Chỉ các trường có trong registry mới đổi được; phần còn lại là bất biến giao thức.
 */
export async function getChatExtLimits(): Promise<ChatExtLimits> {
  try {
    const [poll, scheduled, reminder] = (await Promise.all([
      runtimeConfig.getEffective("limits.poll"),
      runtimeConfig.getEffective("limits.scheduledMessage"),
      runtimeConfig.getEffective("limits.reminder"),
    ])) as [Overrides["poll"], Overrides["scheduled"], Overrides["reminder"]];
    return {
      poll: { ...DEFAULTS.poll, ...pick(poll, ["optionsMax", "questionMax", "optionMax", "closesInMaxDays"]) },
      scheduled: { ...DEFAULTS.scheduled, ...pick(scheduled, ["pendingPerUserMax", "sendAtMaxDays"]) },
      reminder: { ...DEFAULTS.reminder, ...pick(reminder, ["pendingPerUserMax", "remindAtMaxDays"]) },
    };
  } catch (err) {
    log.warn("Không đọc được limits.poll/scheduledMessage/reminder, dùng mặc định", { error: err instanceof Error ? err.message : String(err) });
    return DEFAULTS;
  }
}

/** Chỉ nhận số hữu hạn ở các khoá cho phép — giá trị hỏng trong `SystemConfig` không được làm sai giới hạn. */
function pick<T extends object, K extends keyof T>(source: Partial<T> | undefined, keys: readonly K[]): Partial<Pick<T, K>> {
  const out: Partial<Pick<T, K>> = {};
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value as T[K];
  }
  return out;
}
