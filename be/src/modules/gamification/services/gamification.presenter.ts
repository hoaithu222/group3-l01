import { criteriaProgress, type CounterValues, type CriteriaProgress } from "../../../shared/criteria/criteria-evaluator";
import type { Badge, GamificationCounters, UserBadge, XpEvent } from "../entities/gamification.interface";
import { parseCriteria } from "./badge.service";

/** Huy hiệu hiển thị cho người dùng — whitelist trường (không lộ `criteria` thô/`createdBy`). */
export interface BadgeDto {
  id: string;
  code: string;
  name: string;
  description: string;
  emoji: string | null;
  iconAssetId: string | null;
  rarity: Badge["rarity"];
  unlockedAt?: string;
  seen?: boolean;
  progress?: CriteriaProgress[];
}

export function toBadgeDto(b: Badge, owned?: UserBadge, counters?: CounterValues): BadgeDto {
  const criteria = counters ? parseCriteria(b.criteria) : null;
  return {
    id: b.id,
    code: b.code,
    name: b.name,
    description: b.description,
    emoji: b.emoji,
    iconAssetId: b.iconAssetId,
    rarity: b.rarity,
    ...(owned && { unlockedAt: owned.unlockedAt.toISOString(), seen: owned.seenAt !== null }),
    ...(criteria && counters && { progress: criteriaProgress(criteria, counters) }),
  };
}

export interface XpEventDto {
  id: string;
  sourceType: XpEvent["sourceType"];
  xp: number;
  capped: boolean;
  blockedReason: string | null;
  occurredAt: string;
  workspaceId: string | null;
}

export const toXpEventDto = (e: XpEvent): XpEventDto => ({
  id: e.id,
  sourceType: e.sourceType,
  xp: e.xp,
  capped: e.capped,
  blockedReason: e.blockedReason,
  occurredAt: e.occurredAt.toISOString(),
  workspaceId: e.workspaceId,
});

/** Bộ đếm cho đánh giá tiến độ: counters lưu + `level` (counter tính từ cấp độ). */
export const counterView = (counters: GamificationCounters, level: number): CounterValues => ({ ...counters, level });
