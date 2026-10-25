import { apiClient } from '@/core/api/client';
import type { RequestConfig } from '@/core/api/client.types';
import type { ApiResponse } from '@/shared/types/api.types';

import type {
  AdminBadge,
  AdminBadgesParams,
  AdminLeaderboard,
  AssetUrl,
  BadgeBackfillResult,
  BadgePreviewResult,
  CreateBadgePayload,
  LeaderboardParams,
  LevelConfigView,
  PatchBadgePayload,
  RevokeUserBadgePayload,
  UpdateLevelsPayload,
  UpdateXpRulePayload,
  UserGamificationOverview,
  XpAdjustPayload,
  XpAdjustResult,
  XpRule,
} from '../types/gamification.types';
import { gamificationApi } from './gamification.api';

/** Service THUẦN cho admin gamification — lỗi ghi để interceptor toast như mọi hành động khác. */
export const gamificationService = {
  listXpRules: async (): Promise<ApiResponse<XpRule[]>> =>
    (await apiClient.get<ApiResponse<XpRule[]>>(gamificationApi.xpRules)).data,

  updateXpRule: async ({
    sourceType,
    ...body
  }: UpdateXpRulePayload): Promise<ApiResponse<XpRule>> =>
    (await apiClient.put<ApiResponse<XpRule>>(gamificationApi.xpRule(sourceType), body)).data,

  listBadges: async (params: AdminBadgesParams): Promise<ApiResponse<AdminBadge[]>> =>
    (await apiClient.get<ApiResponse<AdminBadge[]>>(gamificationApi.badges, { params })).data,

  /** `GET /admin/badges/:id` — 404 khi không có (deep link tới huy hiệu đã bị xoá/sai id). */
  getBadge: async (id: string): Promise<ApiResponse<AdminBadge>> =>
    (await apiClient.get<ApiResponse<AdminBadge>>(gamificationApi.badge(id), { skipErrorToast: true } as RequestConfig)).data,

  createBadge: async (body: CreateBadgePayload): Promise<ApiResponse<AdminBadge>> =>
    (await apiClient.post<ApiResponse<AdminBadge>>(gamificationApi.badges, body)).data,

  patchBadge: async ({ id, ...body }: PatchBadgePayload): Promise<ApiResponse<AdminBadge>> =>
    (await apiClient.patch<ApiResponse<AdminBadge>>(gamificationApi.badge(id), body)).data,

  /** `GAME_002` khi điều kiện sai dạng — interceptor toast. */
  previewBadge: async (criteria: unknown): Promise<ApiResponse<BadgePreviewResult>> =>
    (
      await apiClient.post<ApiResponse<BadgePreviewResult>>(
        gamificationApi.badgePreview,
        { criteria },
      )
    ).data,

  backfillBadge: async ({
    id,
    reason,
  }: {
    id: string;
    reason: string;
  }): Promise<ApiResponse<BadgeBackfillResult>> =>
    (
      await apiClient.post<ApiResponse<BadgeBackfillResult>>(gamificationApi.badgeBackfill(id), {
        reason,
      })
    ).data,

  revokeUserBadge: async ({ userId, badgeId, reason }: RevokeUserBadgePayload): Promise<void> => {
    await apiClient.delete(gamificationApi.userBadge(userId, badgeId), { data: { reason } });
  },

  getLevels: async (): Promise<ApiResponse<LevelConfigView>> =>
    (await apiClient.get<ApiResponse<LevelConfigView>>(gamificationApi.levels)).data,

  updateLevels: async (body: UpdateLevelsPayload): Promise<ApiResponse<LevelConfigView>> =>
    (await apiClient.put<ApiResponse<LevelConfigView>>(gamificationApi.levels, body)).data,

  leaderboard: async (params: LeaderboardParams): Promise<ApiResponse<AdminLeaderboard>> =>
    (
      await apiClient.get<ApiResponse<AdminLeaderboard>>(gamificationApi.leaderboard, { params })
    ).data,

  /** URL ký của ảnh huy hiệu. Lỗi (không đọc được/chưa sẵn sàng) không toast — giao diện dùng emoji thay thế. */
  assetUrl: async (assetId: string): Promise<AssetUrl> =>
    (
      await apiClient.get<ApiResponse<AssetUrl>>(gamificationApi.assetUrl(assetId), {
        skipErrorToast: true,
      } as RequestConfig)
    ).data.data,

  userOverview: async (
    userId: string,
    cursor?: string,
  ): Promise<ApiResponse<UserGamificationOverview>> =>
    (
      await apiClient.get<ApiResponse<UserGamificationOverview>>(
        gamificationApi.userOverview(userId),
        { params: { cursor, limit: 20 } },
      )
    ).data,

  adjustXp: async ({
    userId,
    idempotencyKey,
    ...body
  }: XpAdjustPayload): Promise<ApiResponse<XpAdjustResult>> =>
    (
      await apiClient.post<ApiResponse<XpAdjustResult>>(
        gamificationApi.userXpAdjust(userId),
        body,
        {
          headers: { 'Idempotency-Key': idempotencyKey },
        },
      )
    ).data,
};
