import type { Badge } from "../entities/gamification.interface";

export interface BadgeAdminDto {
  id: string;
  code: string;
  name: string;
  description: string;
  emoji: string | null;
  iconAssetId: string | null;
  rarity: Badge["rarity"];
  criteria: unknown;
  counters: string[];
  isActive: boolean;
  order: number;
  version: number;
  unlockedCount: number;
  createdAt: string;
  updatedAt: string;
}

export const toAdminDto = (b: Badge, unlockedCount: number): BadgeAdminDto => ({
  id: b.id,
  code: b.code,
  name: b.name,
  description: b.description,
  emoji: b.emoji,
  iconAssetId: b.iconAssetId,
  rarity: b.rarity,
  criteria: b.criteria,
  counters: b.counters,
  isActive: b.isActive,
  order: b.order,
  version: b.version,
  unlockedCount,
  createdAt: b.createdAt.toISOString(),
  updatedAt: b.updatedAt.toISOString(),
});

/** Ảnh chụp huy hiệu cho audit `badge.create|update` (before/after). */
export const badgeAuditSnapshot = (b: Badge): Record<string, unknown> => ({
  code: b.code,
  name: b.name,
  description: b.description,
  emoji: b.emoji,
  iconAssetId: b.iconAssetId,
  criteria: b.criteria,
  rarity: b.rarity,
  isActive: b.isActive,
  order: b.order,
  version: b.version,
});
