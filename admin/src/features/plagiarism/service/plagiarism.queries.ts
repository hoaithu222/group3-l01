import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';

import { plagiarismService } from './plagiarism.service';
import type { PlagiarismRange, ReindexPayload, UpdatePlagiarismConfigPayload } from './plagiarism.types';

export const plagiarismKeys = {
  all: ['plagiarism'] as const,
  overview: (range: PlagiarismRange) => ['plagiarism', 'overview', range] as const,
  config: ['plagiarism', 'config'] as const,
};

export const usePlagiarismOverview = (range: PlagiarismRange) =>
  useQuery({
    queryKey: plagiarismKeys.overview(range),
    queryFn: () => plagiarismService.getOverview(range),
    select: (res) => res.data,
  });

export const usePlagiarismConfig = () =>
  useQuery({
    queryKey: plagiarismKeys.config,
    queryFn: () => plagiarismService.getConfig(),
    select: (res) => res.data,
  });

/** Lưu cấu hình — CAS theo `expectedVersion`; 409 `RES_003` do form giữ nguyên dữ liệu + banner (đọc lỗi ở nơi gọi). */
export const useUpdatePlagiarismConfig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdatePlagiarismConfigPayload) => plagiarismService.updateConfig(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: plagiarismKeys.config });
      void qc.invalidateQueries({ queryKey: ['audit-log'] });
      showToast('success', 'Đã lưu cấu hình');
    },
  });
};

/** BE chỉ đếm nhanh + xếp MỘT job nền — số liệu chỉ mục cập nhật dần sau đó. */
export const useReindexPlagiarism = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReindexPayload) => plagiarismService.reindex(payload),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: plagiarismKeys.all });
      void qc.invalidateQueries({ queryKey: ['audit-log'] });
      showToast('success', `Đã xếp hàng ${res.data.queued} tệp`);
    },
  });
};
