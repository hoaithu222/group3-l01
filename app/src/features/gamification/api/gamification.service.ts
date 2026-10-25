import type { AxiosResponse } from 'axios';

import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  BADGES_PATH,
  ME_BADGE_SHOWCASE_PATH,
  ME_GAMIFICATION_PATH,
  ME_GAMIFICATION_SEEN_PATH,
  ME_PRIVACY_PATH,
  ME_XP_EVENTS_PATH,
  publicGamificationPath,
  workspaceLeaderboardPath,
} from './gamification.api';
import type {
  BadgeDto,
  GamificationPrivacy,
  GamificationPrivacyPatch,
  LeaderboardDto,
  LeaderboardPeriod,
  MyGamificationDto,
  PublicGamificationDto,
  SeenPayload,
  XpEventsPage,
} from './gamification.types';

/** `ResponseUtils.cursor` trả `{ data, meta }` ngang hàng — không bóc bằng `unwrapData` (mất `meta`). */
const cursorPage = ({ data: body }: AxiosResponse<XpEventsPage>): XpEventsPage => ({
  data: body.data,
  meta: body.meta,
});

/** XP · cấp · chuỗi · huy hiệu · xếp hạng nhóm (p4-03). */
export const gamificationService = {
  async me(): Promise<MyGamificationDto> {
    const response = await apiClient.get(ME_GAMIFICATION_PATH);
    return unwrapData<MyGamificationDto>(response);
  },

  /** 204 — lỗi không chặn luồng (thử lại lần mở sau) ⇒ tắt toast. */
  async seen(payload: SeenPayload): Promise<void> {
    await apiClient.post(ME_GAMIFICATION_SEEN_PATH, payload, { skipErrorToast: true });
  },

  async xpEvents(params: { cursor?: string; limit: number }): Promise<XpEventsPage> {
    const response = await apiClient.get<XpEventsPage>(ME_XP_EVENTS_PATH, { params });
    return cursorPage(response);
  },

  async badges(): Promise<BadgeDto[]> {
    const response = await apiClient.get(BADGES_PATH);
    return unwrapData<BadgeDto[]>(response);
  },

  /** `GAME_006` (chưa mở/quá 6) do màn toast bằng câu của feature ⇒ `skipErrorToast`. */
  async setShowcase(badgeIds: string[]): Promise<{ showcase: BadgeDto[] }> {
    const response = await apiClient.put(
      ME_BADGE_SHOWCASE_PATH,
      { badgeIds },
      { skipErrorToast: true },
    );
    return unwrapData<{ showcase: BadgeDto[] }>(response);
  },

  /** Khách/người ngoài nhóm → 404 (màn tự xử lý, không toast). */
  async leaderboard(workspaceId: string, period: LeaderboardPeriod): Promise<LeaderboardDto> {
    const response = await apiClient.get(workspaceLeaderboardPath(workspaceId), {
      params: { period },
      skipErrorToast: true,
    });
    return unwrapData<LeaderboardDto>(response);
  },

  /** 404 trung tính (không chung nhóm / người đó tắt hiển thị) ⇒ màn tự hiện thông điệp, không toast. */
  async publicProfile(userId: string): Promise<PublicGamificationDto> {
    const response = await apiClient.get(publicGamificationPath(userId), { skipErrorToast: true });
    return unwrapData<PublicGamificationDto>(response);
  },

  /** Lỗi do nơi gọi (rollback + toast) ⇒ `skipErrorToast`. */
  async updatePrivacy(patch: GamificationPrivacyPatch): Promise<GamificationPrivacy> {
    const response = await apiClient.patch(ME_PRIVACY_PATH, patch, { skipErrorToast: true });
    return unwrapData<GamificationPrivacy>(response);
  },
};
