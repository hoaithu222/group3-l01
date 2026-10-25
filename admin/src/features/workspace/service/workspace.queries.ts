import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { auditLogKeys } from '@/features/audit-log';
import { showToast } from '@/shared/utils/toast.utils';

import { WORKSPACE_IMAGE_LABEL } from '../constants/workspace.constants';
import type {
  RemoveWorkspaceImagePayload,
  WorkspaceListParams,
  WorkspaceStatsRange,
} from '../types/workspace.types';
import { workspaceService } from './workspace.service';
import { workspaceWalletService } from './workspace-wallet.service';

export const workspaceKeys = {
  all: ['workspace'] as const,
  /** Tiền tố — invalidate MỌI trang/bộ lọc của danh bạ. */
  lists: ['workspace', 'list'] as const,
  list: (p: WorkspaceListParams) => ['workspace', 'list', p] as const,
  detail: (id: string) => ['workspace', 'detail', id] as const,
  /** Gợi ý của ô chọn workspace theo từ khoá đã debounce. */
  options: (q: string) => ['workspace', 'options', q] as const,
  /** Gợi ý của ô lọc chủ sở hữu theo từ khoá đã debounce. */
  ownerOptions: (q: string) => ['workspace', 'owner-options', q] as const,
  stats: (id: string, range: WorkspaceStatsRange) => ['workspace', 'stats', id, range] as const,
  /** p6-04 admin.md §3 — thống kê ví tổng hợp ẩn danh. */
  walletStats: (id: string) => ['workspace', id, 'wallet-stats'] as const,
};

/** `placeholderData: keepPreviousData` — đổi trang/lọc không nháy trắng bảng. */
export const useAdminWorkspaces = (params: WorkspaceListParams) =>
  useQuery({
    queryKey: workspaceKeys.list(params),
    queryFn: () => workspaceService.list(params),
    placeholderData: keepPreviousData,
  });

/**
 * Gợi ý cho ô chọn workspace (`WorkspacePicker`): tìm phía server theo `q` (đã debounce ở nơi gọi), tải thêm theo trang.
 * Chỉ chạy khi hộp gợi ý đang mở (`enabled`); giữ danh sách cũ trong lúc gõ tiếp — không nháy trống giữa hai lần gọi.
 * Không thử lại: lỗi thường là thiếu quyền, thử lại chỉ tốn thêm một lượt gọi.
 */
export const useWorkspaceOptionSearch = (q: string, enabled: boolean) =>
  useInfiniteQuery({
    queryKey: workspaceKeys.options(q),
    queryFn: ({ pageParam }) => workspaceService.searchOptions(q, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasNext ? last.page + 1 : undefined),
    enabled,
    staleTime: 60_000,
    retry: false,
    placeholderData: keepPreviousData,
  });

/** Gợi ý cho ô lọc chủ sở hữu (`WorkspaceOwnerFilter`) — cùng khuôn `useWorkspaceOptionSearch`: tìm phía server, tải thêm theo trang. */
export const useOwnerOptionSearch = (q: string, enabled: boolean) =>
  useInfiniteQuery({
    queryKey: workspaceKeys.ownerOptions(q),
    queryFn: ({ pageParam }) => workspaceService.searchOwnerOptions(q, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasNext ? last.page + 1 : undefined),
    enabled,
    staleTime: 60_000,
    retry: false,
    placeholderData: keepPreviousData,
  });

export const useAdminWorkspace = (id: string | undefined) =>
  useQuery({
    queryKey: workspaceKeys.detail(id ?? ''),
    queryFn: () => workspaceService.detail(id as string),
    enabled: !!id,
  });

export const useWorkspaceStats = (id: string | undefined, range: WorkspaceStatsRange) =>
  useQuery({
    queryKey: workspaceKeys.stats(id ?? '', range),
    queryFn: () => workspaceService.stats(id as string, range),
    enabled: !!id,
  });

/** Chỉ mount khi cờ `wallet` bật (xem `WorkspaceDetailPage`); dữ liệu chỉ là số đếm + dải, không số tiền. */
export const useWorkspaceWalletStats = (id: string | undefined) =>
  useQuery({
    queryKey: workspaceKeys.walletStats(id ?? ''),
    queryFn: () => workspaceWalletService.stats(id as string),
    enabled: !!id,
  });

export const useArchiveWorkspace = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => workspaceService.archive({ id, reason }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: workspaceKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: workspaceKeys.all });
      showToast('success', 'Đã lưu trữ workspace và ghi nhật ký');
    },
  });
};

export const useRestoreWorkspace = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => workspaceService.restore({ id, reason }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: workspaceKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: workspaceKeys.all });
      showToast('success', 'Đã khôi phục workspace và ghi nhật ký');
    },
  });
};

/**
 * Gỡ ảnh đại diện / ảnh bìa VI PHẠM (`POST /admin/workspaces/:id/remove-image`). Làm mới chi tiết + danh bạ (URL ảnh cũ
 * đã bỏ) và nhật ký (dòng `workspace.image-remove` vừa ghi). `removed: false` = ảnh đã được gỡ ở nơi khác — báo đúng
 * thay vì "Đã gỡ". Lỗi do interceptor toast; mutation reject nên `ConfirmWithReasonModal` giữ mở.
 */
export const useRemoveWorkspaceImage = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, reason }: RemoveWorkspaceImagePayload) =>
      workspaceService.removeImage({ id, kind, reason }),
    onSuccess: (res, { kind }) => {
      void qc.invalidateQueries({ queryKey: workspaceKeys.detail(id) });
      void qc.invalidateQueries({ queryKey: workspaceKeys.lists });
      void qc.invalidateQueries({ queryKey: auditLogKeys.all });
      const label = WORKSPACE_IMAGE_LABEL[kind];
      if (res.data.removed) showToast('success', `Đã gỡ ${label} và ghi nhật ký`);
      else showToast('info', `Nhóm không còn ${label} — không có gì để gỡ`);
    },
  });
};
