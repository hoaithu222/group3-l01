import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { auditLogKeys } from '@/features/audit-log';
import { showToast } from '@/shared/utils/toast.utils';

import type {
  AdminBadgesParams,
  LeaderboardParams,
  LeaderboardPeriod,
} from '../types/gamification.types';
import { gamificationService } from './gamification.service';

/** Query key admin gamification (admin.md p4-03 §3). */
export const gamificationKeys = {
  all: ['gamification'] as const,
  xpRules: () => ['gamification', 'xp-rules'] as const,
  badgesAll: () => ['gamification', 'badges'] as const,
  badges: (params: AdminBadgesParams) => ['gamification', 'badges', params] as const,
  /** Nằm DƯỚI `badgesAll()` nên mọi lần sửa/bật/tắt/cấp bù (invalidate `badgesAll`) làm mới luôn ngăn kéo chi tiết. */
  badge: (id: string) => ['gamification', 'badges', 'detail', id] as const,
  badgeIcon: (assetId: string) => ['gamification', 'badge-icon', assetId] as const,
  levels: () => ['gamification', 'levels'] as const,
  leaderboard: (workspaceId: string, period: LeaderboardPeriod) =>
    ['gamification', 'leaderboard', workspaceId, period] as const,
  userAll: (userId: string) => ['user', 'gamification', userId] as const,
  user: (userId: string, cursor: string | undefined) =>
    ['user', 'gamification', userId, cursor ?? null] as const,
};

/** `GET /admin/xp-rules`. */
export const useXpRules = () =>
  useQuery({
    queryKey: gamificationKeys.xpRules(),
    queryFn: gamificationService.listXpRules,
    select: (res) => res.data,
  });

/**
 * `PUT /admin/xp-rules/:sourceType` — thành công hay lỗi đều làm mới danh sách (lỗi `RES_003` =
 * luật vừa bị sửa ở nơi khác → cần `version` mới; interceptor đã toast thông báo lỗi).
 */
export const useUpdateXpRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: gamificationService.updateXpRule,
    onSuccess: () => showToast('success', 'Đã lưu luật XP và ghi nhật ký'),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: gamificationKeys.xpRules() });
    },
  });
};

/** `GET /admin/badges` (phân trang server). */
export const useAdminBadges = (params: AdminBadgesParams) =>
  useQuery({
    queryKey: gamificationKeys.badges(params),
    queryFn: () => gamificationService.listBadges(params),
    placeholderData: keepPreviousData,
  });

/** `POST /admin/badges`. */
export const useCreateBadge = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: gamificationService.createBadge,
    onSuccess: () => {
      showToast('success', 'Đã tạo huy hiệu');
      void qc.invalidateQueries({ queryKey: gamificationKeys.badgesAll() });
      void qc.invalidateQueries({ queryKey: auditLogKeys.all });
    },
  });
};

/** `PATCH /admin/badges/:id` — sửa / bật / tắt; làm mới cả khi lỗi (CAS `RES_003`). */
export const usePatchBadge = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: gamificationService.patchBadge,
    onSuccess: () => showToast('success', 'Đã cập nhật huy hiệu và ghi nhật ký'),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: gamificationKeys.badgesAll() });
      void qc.invalidateQueries({ queryKey: auditLogKeys.all });
    },
  });
};

/** `GET /admin/users/:id/gamification` — tóm tắt + huy hiệu + lịch sử XP (cursor). */
export const useUserGamification = (userId: string, cursor: string | undefined) =>
  useQuery({
    queryKey: gamificationKeys.user(userId, cursor),
    queryFn: () => gamificationService.userOverview(userId, cursor),
    select: (res) => res.data,
    placeholderData: keepPreviousData,
  });

/** `POST /admin/users/:id/xp-adjust` — làm mới tổng quan gamification của người đó. */
export const useAdjustXp = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: gamificationService.adjustXp,
    onSuccess: (_res, vars) => {
      showToast('success', 'Đã điều chỉnh XP và ghi nhật ký');
      void qc.invalidateQueries({ queryKey: gamificationKeys.userAll(vars.userId) });
      // Hồ sơ người dùng + nhật ký (tab "Nhật ký" của ngăn kéo). Khoá viết thẳng, KHÔNG import `features/user`: user đã import gamification
      // (tab Gamification) nên import ngược khép vòng `check:cycles`. Khớp `userKeys.detail` (`['user','detail',id]`).
      void qc.invalidateQueries({ queryKey: ['user', 'detail', vars.userId] });
      void qc.invalidateQueries({ queryKey: auditLogKeys.all });
    },
  });
};

/** `POST /admin/badges/preview` — chỉ đọc (cần `gamification:view`), không làm mới gì. */
export const usePreviewBadge = () =>
  useMutation({
    mutationFn: gamificationService.previewBadge,
  });

/** `POST /admin/badges/:id/backfill` → 202 (job nền). */
export const useBackfillBadge = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: gamificationService.backfillBadge,
    onSuccess: () => {
      showToast('success', 'Đang xử lý, người dùng sẽ nhận thông báo');
      void qc.invalidateQueries({ queryKey: auditLogKeys.all });
    },
  });
};

/** `DELETE /admin/users/:id/badges/:badgeId` — làm mới tổng quan gamification của người đó. */
export const useRevokeUserBadge = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: gamificationService.revokeUserBadge,
    onSuccess: (_res, vars) => {
      showToast('success', 'Đã thu hồi huy hiệu và ghi nhật ký');
      void qc.invalidateQueries({ queryKey: gamificationKeys.userAll(vars.userId) });
      void qc.invalidateQueries({ queryKey: gamificationKeys.badgesAll() });
      void qc.invalidateQueries({ queryKey: auditLogKeys.all });
    },
  });
};

/** `GET /admin/gamification/levels`. */
export const useLevelConfig = () =>
  useQuery({
    queryKey: gamificationKeys.levels(),
    queryFn: gamificationService.getLevels,
    select: (res) => res.data,
  });

/** `PUT /admin/gamification/levels` — làm mới cả khi lỗi (CAS `RES_003` cần `version` mới). */
export const useUpdateLevels = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: gamificationService.updateLevels,
    onSuccess: () => showToast('success', 'Đã lưu cấu hình cấp độ và ghi nhật ký'),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: gamificationKeys.levels() });
      void qc.invalidateQueries({ queryKey: auditLogKeys.all });
    },
  });
};

/** `GET /admin/gamification/leaderboard` — chỉ chạy khi đã chọn workspace. */
export const useAdminLeaderboard = (params: LeaderboardParams | null) =>
  useQuery({
    queryKey: gamificationKeys.leaderboard(params?.workspaceId ?? '', params?.period ?? 'WEEK'),
    queryFn: () => gamificationService.leaderboard(params as LeaderboardParams),
    select: (res) => res.data,
    enabled: !!params,
    placeholderData: keepPreviousData,
  });

/** `GET /admin/badges/:id` — cho ngăn kéo theo URL; `enabled` khi có `badgeId`. Không thử lại 404 (huy hiệu không tồn tại). */
export const useAdminBadge = (id: string | undefined) =>
  useQuery({
    queryKey: gamificationKeys.badge(id ?? ''),
    queryFn: () => gamificationService.getBadge(id as string),
    select: (res) => res.data,
    enabled: !!id,
    retry: false,
  });

/**
 * URL ký ảnh huy hiệu. Hết hạn ngắn ⇒ `staleTime` 30 giây; lỗi (asset không đọc được) không
 * thử lại và không toast: `BadgeIcon` tự rơi về emoji.
 */
export const useBadgeIconUrl = (assetId: string | null | undefined) =>
  useQuery({
    queryKey: gamificationKeys.badgeIcon(assetId ?? ''),
    queryFn: () => gamificationService.assetUrl(assetId as string),
    select: (res) => res.url,
    enabled: !!assetId,
    staleTime: 30_000,
    retry: false,
  });
