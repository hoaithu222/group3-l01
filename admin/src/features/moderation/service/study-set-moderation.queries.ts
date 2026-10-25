import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';

import {
  STUDY_HIDDEN_CODE,
  STUDY_ITEMS_PAGE_SIZE,
  STUDY_ITEMS_STALE_MS,
} from '../constants/study-set-moderation.constants';
import type { AdminReportedStudySetsParams } from '../types/study-set-moderation.types';
import { errorCodeOf } from '../utils/report-errors';
import { refreshModeration } from './moderation.queries';
import { studySetModerationService } from './study-set-moderation.service';

/** Cùng gốc `['moderation']` với `moderationKeys` (p4-01 admin.md §3). */
export const studySetModerationKeys = {
  /** Tiền tố — mọi bộ lọc/trang của tab `content`. */
  reportedAll: () => ['moderation', 'study-sets'] as const,
  reported: (p: AdminReportedStudySetsParams) => ['moderation', 'study-sets', p] as const,
  /** Khớp gốc `['user', …]` của các tab trong ngăn kéo người dùng (`['user','gamification',id]`). */
  userSummary: (userId: string) => ['user', 'study-summary', userId] as const,
  detail: (setId: string) => ['moderation', 'study-set', setId] as const,
  /** Tiền tố — mọi trang mục của một bộ. */
  itemsAll: (setId: string) => ['moderation', 'study-set-items', setId] as const,
  items: (setId: string, page: number) => ['moderation', 'study-set-items', setId, page] as const,
};

/** Làm mới bộ học + hàng đợi/chi tiết báo cáo + nhật ký (ẩn bộ cũng đóng báo cáo mở của nó). */
function refreshAfterDecision(qc: QueryClient, setId: string): void {
  void qc.invalidateQueries({ queryKey: studySetModerationKeys.detail(setId) });
  void qc.invalidateQueries({ queryKey: studySetModerationKeys.reportedAll() });
  void qc.invalidateQueries({ queryKey: studySetModerationKeys.itemsAll(setId) });
  refreshModeration(qc);
}

/**
 * Tab `content` — bộ PUBLIC có ≥ `minReports` báo cáo mở. `retry: false`: cờ `study` tắt (`404 CFG_005`) không tự khỏi khi gọi lại.
 * `keepPreviousData`: đổi trang/lọc không nháy trắng bảng.
 */
export const useReportedStudySets = (params: AdminReportedStudySetsParams) =>
  useQuery({
    queryKey: studySetModerationKeys.reported(params),
    queryFn: () => studySetModerationService.listReported(params),
    placeholderData: keepPreviousData,
    retry: false,
  });

/** Số liệu học tập của một người (tab "Học tập" ở ngăn kéo người dùng) — không có người dùng → 404, không thử lại. */
export const useUserStudySummary = (userId: string | undefined) =>
  useQuery({
    queryKey: studySetModerationKeys.userSummary(userId ?? ''),
    queryFn: () => studySetModerationService.userSummary(userId as string),
    select: (res) => res.data,
    enabled: !!userId,
    retry: false,
  });

/** Metadata bộ học. `enabled` để tắt khi đích báo cáo không phải `STUDY_SET`. */
export const useAdminStudySet = (setId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: studySetModerationKeys.detail(setId ?? ''),
    queryFn: () => studySetModerationService.detail(setId as string),
    select: (res) => res.data,
    enabled: enabled && !!setId,
    // 404 (riêng tư/đã xoá/cờ tắt) không tự khỏi khi gọi lại — vẽ trạng thái ngay, không đợi thử lại.
    retry: false,
  });

/**
 * Nội dung mục — CHỈ gọi khi bộ PUBLIC (`enabled` do nơi gọi quyết định theo `canViewContent`);
 * bộ WORKSPACE không có route này (BE trả 403).
 */
export const useAdminStudyItems = (setId: string, page: number, enabled: boolean) =>
  useQuery({
    queryKey: studySetModerationKeys.items(setId, page),
    queryFn: () => studySetModerationService.items(setId, { page, limit: STUDY_ITEMS_PAGE_SIZE }),
    enabled,
    placeholderData: keepPreviousData,
    retry: false,
    // Thumbnail trong trang là URL KÝ sống ≤ 60 s: giữ cache ngắn để mở lại/quay lại tab luôn lấy URL còn hạn thay vì ảnh đã hết hạn.
    staleTime: STUDY_ITEMS_STALE_MS,
    gcTime: STUDY_ITEMS_STALE_MS * 2,
  });

/**
 * `STUDY_004` (bộ đã ẩn — người khác vừa ẩn) không phải lỗi nên làm mới cho khối chuyển sang trạng
 * thái đúng; lỗi khác để interceptor toast và giữ modal mở để thử lại.
 */
function onDecisionError(qc: QueryClient, setId: string, err: unknown): void {
  if (errorCodeOf(err) === STUDY_HIDDEN_CODE) refreshAfterDecision(qc, setId);
}

/** `POST /admin/study-sets/:id/hide` (`moderation:update`) — ghi audit + đóng báo cáo mở của bộ. */
export const useHideStudySet = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: studySetModerationService.hide,
    onSuccess: (_res, { setId }) => {
      refreshAfterDecision(qc, setId);
      showToast('success', 'Đã ẩn bộ học và ghi nhật ký');
    },
    onError: (err, { setId }) => onDecisionError(qc, setId, err),
  });
};

/** `POST /admin/study-sets/:id/restore` (`moderation:update`). */
export const useRestoreStudySet = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: studySetModerationService.restore,
    onSuccess: (_res, { setId }) => {
      refreshAfterDecision(qc, setId);
      showToast('success', 'Đã khôi phục bộ học và ghi nhật ký');
    },
    onError: (err, { setId }) => onDecisionError(qc, setId, err),
  });
};
