import { useQuery } from '@tanstack/react-query';

import { useDebounce } from '@/shared/hooks';

import { roadmapService } from '../service/roadmap.service';
import type { PreviewResult } from '../types/roadmap.types';

/** Gõ xong 600 ms mới gọi (admin.md p4-07 §2 tab "Nội dung"). */
const PREVIEW_DEBOUNCE_MS = 600;

export interface UseDebouncedPreviewResult {
  preview: PreviewResult | undefined;
  isLoading: boolean;
  isError: boolean;
}

/**
 * `POST /admin/roadmap/preview` — xem trước khối khi soạn markdown, debounce 600 ms để không gọi mỗi
 * phím gõ. Dùng `useQuery` (không phải `useMutation`): giá trị đầu vào là "state hiện tại của ô soạn",
 * đúng ngữ nghĩa "dữ liệu suy ra từ input", react-query tự dedupe/huỷ request cũ khi gõ tiếp.
 */
export function useDebouncedPreview(bodyMd: string): UseDebouncedPreviewResult {
  const debounced = useDebounce(bodyMd, PREVIEW_DEBOUNCE_MS);
  const trimmed = debounced.trim();

  const { data, isFetching, isError } = useQuery({
    queryKey: ['roadmap-admin', 'preview', debounced],
    queryFn: () => roadmapService.preview(debounced),
    select: (res) => res.data,
    enabled: trimmed.length > 0,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

  return { preview: trimmed.length > 0 ? data : undefined, isLoading: isFetching, isError };
}
