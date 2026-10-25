import type { XpRule } from "../entities/gamification.interface";
import type { XpInput } from "./xp-source-mapper";

export interface XpBase {
  /** XP trước khi áp trần ngày (≥ 0). */
  xp: number;
  /** `MIN_TASK_AGE` | `RULE_INACTIVE` | `null`. */
  blockedReason: "MIN_TASK_AGE" | "RULE_INACTIVE" | null;
}

/**
 * XP cơ bản của MỘT lần ghi nhận (p4-03 be.md §5.2 bước 2) — HÀM THUẦN. Luật chưa có/tắt → 0 (`RULE_INACTIVE`, counter vẫn tăng);
 * thẻ hoàn thành quá nhanh (`completedAt − taskCreatedAt < minTaskAgeSec`) → 0 (`MIN_TASK_AGE`, chống farm — chỉ áp cho nguồn thẻ);
 * còn lại `round(rule.xp × factor)`. Trần ngày áp ở bước sau (cần tổng đã cộng trong transaction).
 */
export function baseXp(input: Pick<XpInput, "sourceType" | "factor" | "occurredAt" | "taskCreatedAt">, rule: XpRule | null, minTaskAgeSec: number): XpBase {
  if (!rule || !rule.isActive) return { xp: 0, blockedReason: "RULE_INACTIVE" };
  const isTask = input.sourceType === "TASK_COMPLETED" || input.sourceType === "TASK_ON_TIME";
  if (isTask && input.taskCreatedAt && input.occurredAt.getTime() - input.taskCreatedAt.getTime() < minTaskAgeSec * 1000) {
    return { xp: 0, blockedReason: "MIN_TASK_AGE" };
  }
  return { xp: Math.max(0, Math.round(rule.xp * input.factor)), blockedReason: null };
}

/** Áp trần ngày: `allowed = min(xp, cap − đã cộng hôm nay)` (không âm); `null` = không trần. `capped` khi bị cắt. */
export function applyDailyCap(xp: number, dailyCap: number | null, alreadyToday: number): { allowed: number; capped: boolean } {
  if (dailyCap === null || xp <= 0) return { allowed: xp, capped: false };
  const allowed = Math.max(0, Math.min(xp, dailyCap - alreadyToday));
  return { allowed, capped: allowed < xp };
}
