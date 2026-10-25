import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';

import { contributionService } from '../api/contribution.service';
import type { PeriodKey, PutContributionConfigInput } from '../api/contribution.types';
import { contributionKeys } from './contribution.keys';

/** Cache 60 giây (app.md §4) — số liệu tổng hợp, không cần tươi từng giây; kéo để làm mới khi muốn. */
export const REPORT_STALE_MS = 60_000;

/** Tên bảng, trạng thái lưu trữ và `myPermissions` — đọc từ `GET /boards/:id`, KHÔNG dùng khoá/kiểu của `features/boards`. */
export function useBoardMeta(boardId: string, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(boardId),
    queryFn: () => contributionService.board(boardId),
    queryKey: contributionKeys.boardMeta(boardId),
    staleTime: REPORT_STALE_MS,
  });
}

/**
 * Báo cáo của một kỳ. `placeholderData: keepPreviousData` giữ bảng điểm cũ MỜ trong lúc đổi kỳ (app.md §4) thay vì nháy về khung
 * chờ; `isPlaceholderData` cho màn biết đang hiện dữ liệu của kỳ trước.
 */
export function useContributionReport(boardId: string, period: PeriodKey, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(boardId),
    placeholderData: keepPreviousData,
    queryFn: () => contributionService.report(boardId, period),
    queryKey: contributionKeys.report(boardId, period),
    staleTime: REPORT_STALE_MS,
  });
}

/** Các tháng/tuần CÓ dữ liệu (mới nhất trước) + múi giờ của nhóm — nguồn của bộ chọn kỳ và của mốc "hôm nay" cho biểu đồ hoạt động. */
export function useContributionPeriods(boardId: string, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(boardId),
    queryFn: () => contributionService.periods(boardId),
    queryKey: contributionKeys.periods(boardId),
    staleTime: REPORT_STALE_MS,
  });
}

/** Công thức + `version` (CAS) — chỉ tải khi cần sửa (`enabled` = tấm "Đổi trọng số" đang mở). */
export function useContributionConfig(boardId: string, enabled: boolean) {
  return useQuery({
    enabled: enabled && Boolean(boardId),
    queryFn: () => contributionService.config(boardId),
    queryKey: contributionKeys.config(boardId),
    staleTime: 0,
  });
}

/**
 * Lưu công thức: thành công → ghi bản mới vào cache `config` và làm mới báo cáo MỌI kỳ + danh sách thẻ được tính của bảng (server đã
 * xếp tính lại ngay). Lỗi để nguyên cho tấm tự hiện (`RES_003` giữ form, `CONTRIB_002` ở dòng tổng) — không toast ở đây.
 */
export function usePutContributionConfig(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PutContributionConfigInput) => contributionService.putConfig(boardId, input),
    onSuccess: (config) => {
      queryClient.setQueryData(contributionKeys.config(boardId), config);
      void queryClient.invalidateQueries({ queryKey: contributionKeys.reportsAll(boardId) });
      void queryClient.invalidateQueries({ queryKey: contributionKeys.memberTasksAll(boardId) });
      showToast('success', 'Đã lưu, báo cáo đang được tính lại');
    },
  });
}
