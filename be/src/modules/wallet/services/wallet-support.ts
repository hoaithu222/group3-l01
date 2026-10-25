import type { Prisma } from "@prisma/client";
import { outbox } from "../../../infrastructure/queue";
import { LIMITS } from "../../../core/constants/limits";
import { runtimeConfig } from "../../../core/config/runtime-config";
import { createContextLogger } from "../../../infrastructure/logger";
import type { ProjectionResult } from "./wallet-projection.service";

const log = createContextLogger({ service: "WalletSupport" });

export type WalletEventReason = "EXPENSE" | "SETTLEMENT" | "SETTINGS";

export interface WalletLimits {
  expenseMax: number;
  participantsMax: number;
  reminderMinDebt: number;
}

/** Giới hạn hiệu lực = `LIMITS.wallet` ⊕ override `SystemConfig` `limits.wallet`; lỗi đọc cấu hình → dùng mặc định cứng. */
export async function getWalletLimits(): Promise<WalletLimits> {
  const fallback: WalletLimits = {
    expenseMax: LIMITS.wallet.expenseMax,
    participantsMax: LIMITS.wallet.participantsMax,
    reminderMinDebt: LIMITS.wallet.reminderMinDebt,
  };
  try {
    const eff = (await runtimeConfig.getEffective("limits.wallet")) as Partial<WalletLimits>;
    return {
      expenseMax: eff.expenseMax ?? fallback.expenseMax,
      participantsMax: eff.participantsMax ?? fallback.participantsMax,
      reminderMinDebt: eff.reminderMinDebt ?? fallback.reminderMinDebt,
    };
  } catch (err) {
    log.warn("Không đọc được limits.wallet, dùng mặc định", { error: err instanceof Error ? err.message : String(err) });
    return fallback;
  }
}

/**
 * Ghi outbox `wallet.events` (consumer phát `wallet:updated` tới `ws:{id}` SAU commit — KHÔNG kèm số tiền).
 * `dedupeKey` gắn `walletVersion` mới nên mỗi thay đổi có đúng một sự kiện; relay tự thay `:` → `_` làm jobId.
 */
export async function emitWalletUpdated(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  result: Pick<ProjectionResult, "walletVersion" | "changedUserIds">,
  reason: WalletEventReason
): Promise<void> {
  await outbox.add(tx, {
    type: "wallet.updated",
    aggregateType: "Wallet",
    aggregateId: workspaceId,
    queue: "notifications",
    jobName: "wallet.events",
    dedupeKey: `wallet.updated:${workspaceId}:v${result.walletVersion}`,
    payload: {
      workspaceId,
      walletVersion: result.walletVersion,
      changedUserIds: result.changedUserIds,
      reason,
    },
  });
}

/** Ngày yyyymmdd theo múi giờ ví — khoá dedupe nhắc nợ theo NGÀY ĐỊA PHƯƠNG. */
export function localDayKey(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}`;
}

/** Đầu tháng theo múi giờ ví (UTC instant) — "chi tháng này" của `summary`. */
export function startOfMonthInTz(at: Date, timeZone: string): Date {
  const key = localDayKey(at, timeZone);
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(4, 6));
  // Nửa đêm ngày 1 theo tz: lấy UTC ngày 1 rồi trừ độ lệch tz tại thời điểm đó.
  const guess = new Date(Date.UTC(year, month - 1, 1));
  const localAsUtc = new Date(guess.toLocaleString("en-US", { timeZone }));
  const utcAsUtc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (localAsUtc.getTime() - utcAsUtc.getTime()));
}
