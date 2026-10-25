import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { expectedVersionSchema, objectIdSchema, paginationSchema, reasonSchema } from "../../../shared/dto/common-schemas";
import { BADGE_RARITIES, XP_SOURCE_TYPES } from "../entities/gamification.interface";
import { LEADERBOARD_PERIODS } from "../services/leaderboard-period";

/** Nguồn XP sửa được qua admin (`ADMIN_ADJUST` không có luật — điều chỉnh đi qua `POST /admin/users/:id/xp-adjust`). */
export const RULE_SOURCE_TYPES = XP_SOURCE_TYPES.filter((s) => s !== "ADMIN_ADJUST") as [Exclude<(typeof XP_SOURCE_TYPES)[number], "ADMIN_ADJUST">, ...Array<Exclude<(typeof XP_SOURCE_TYPES)[number], "ADMIN_ADJUST">>];

export const sourceTypeParamSchema = z.object({ sourceType: z.enum(RULE_SOURCE_TYPES) });

export const updateXpRuleSchema = expectedVersionSchema.merge(reasonSchema).extend({
  xp: z.number().int().min(0).max(1000),
  dailyCap: z.number().int().min(0).max(10_000).nullable(),
  countsForStreak: z.boolean(),
  isActive: z.boolean(),
});
export type UpdateXpRuleDto = z.infer<typeof updateXpRuleSchema>;

/**
 * `criteria` nhận thô (`unknown`) rồi SERVICE kiểm bằng `criteriaSchema` (`shared/criteria`) để trả đúng mã `GAME_002` (400) thay vì `VAL_001` chung —
 * mọi lỗi điều kiện (counter lạ, `value` ngoài khoảng, quá số mệnh đề, thiếu `all`) đều về một mã.
 */
const rawCriteria = z.unknown();

const badgeBase = z.object({
  name: z.string().trim().min(2).max(LIMITS.badge.nameMax),
  description: z.string().trim().max(LIMITS.badge.descriptionMax),
  emoji: z.string().trim().max(8).optional(),
  iconAssetId: objectIdSchema.optional(),
  criteria: rawCriteria,
  rarity: z.enum(BADGE_RARITIES).default("COMMON"),
  order: z.number().int().min(0).max(10_000).default(0),
});

export const badgeSchema = badgeBase.merge(reasonSchema).extend({ code: z.string().regex(/^[a-z0-9-]{3,40}$/, "Mã huy hiệu 3–40 ký tự a-z, 0-9, dấu gạch ngang") });
export type CreateBadgeDto = z.infer<typeof badgeSchema>;

/** `null` xoá `emoji`/`iconAssetId`; thiếu = giữ nguyên. Không đổi `code`. */
export const patchBadgeSchema = expectedVersionSchema.merge(reasonSchema).extend({
  name: badgeBase.shape.name.optional(),
  description: badgeBase.shape.description.optional(),
  emoji: z.string().trim().max(8).nullable().optional(),
  iconAssetId: objectIdSchema.nullable().optional(),
  criteria: rawCriteria.optional(),
  rarity: z.enum(BADGE_RARITIES).optional(),
  order: badgeBase.shape.order.optional(),
  isActive: z.boolean().optional(),
});
export type PatchBadgeDto = z.infer<typeof patchBadgeSchema>;

export const previewBadgeSchema = z.object({ criteria: rawCriteria });
export const badgeIdParamSchema = z.object({ id: objectIdSchema });
export const userBadgeParamSchema = z.object({ id: objectIdSchema, badgeId: objectIdSchema });
export const userIdParamSchema = z.object({ id: objectIdSchema });

export const adminBadgesQuerySchema = paginationSchema.extend({
  isActive: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  /** Tìm theo TÊN huy hiệu (không phân biệt hoa/thường, không dấu). Rỗng sau `trim` = không lọc. */
  q: z.string().trim().max(LIMITS.badge.nameMax).optional(),
});
export type AdminBadgesQueryDto = z.infer<typeof adminBadgesQuerySchema>;

export const levelConfigSchema = expectedVersionSchema.merge(reasonSchema).extend({
  base: z.number().int().min(10).max(10_000),
  maxLevel: z.number().int().min(10).max(500),
});
export type LevelConfigDto = z.infer<typeof levelConfigSchema>;

/** Điều chỉnh XP ± ≤ `adjustMaxAbs`, khác 0; vượt → `GAME_004` (kiểm ở service, không phải `VAL_001`). */
export const xpAdjustSchema = reasonSchema.extend({ delta: z.number().int().refine((v) => v !== 0, { message: "delta phải khác 0" }) });
export type XpAdjustDto = z.infer<typeof xpAdjustSchema>;

export const adminLeaderboardQuerySchema = z.object({ workspaceId: objectIdSchema, period: z.enum(LEADERBOARD_PERIODS).default("WEEK") });
export type AdminLeaderboardQueryDto = z.infer<typeof adminLeaderboardQuerySchema>;

export const adminUserQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(LIMITS.gamification.xpEventsPageMax).default(20),
});
export type AdminUserQueryDto = z.infer<typeof adminUserQuerySchema>;
