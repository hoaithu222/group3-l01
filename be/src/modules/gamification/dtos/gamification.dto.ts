import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { objectIdSchema } from "../../../shared/dto/common-schemas";
import { LEADERBOARD_PERIODS } from "../services/leaderboard-period";

/** `POST /me/gamification/seen` — đánh dấu đã xem cấp (đồng bộ mọi thiết bị) và/hoặc huy hiệu mới. */
export const seenSchema = z.object({
  level: z.number().int().min(1).optional(),
  badgeIds: z.array(objectIdSchema).max(50).optional(),
});
export type SeenDto = z.infer<typeof seenSchema>;

/** `PUT /me/badges/showcase` — vượt số lượng do SERVICE trả `GAME_006` (không phải `VAL_001`); Zod chỉ chặn mảng phi lý. */
export const showcaseSchema = z.object({ badgeIds: z.array(objectIdSchema).max(50) });
export type ShowcaseDto = z.infer<typeof showcaseSchema>;

export const leaderboardQuerySchema = z.object({ period: z.enum(LEADERBOARD_PERIODS).default("WEEK") });
export type LeaderboardQueryDto = z.infer<typeof leaderboardQuerySchema>;

export const xpEventsQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(LIMITS.gamification.xpEventsPageMax).default(20),
});
export type XpEventsQueryDto = z.infer<typeof xpEventsQuerySchema>;

export const workspaceIdParamSchema = z.object({ id: objectIdSchema });
