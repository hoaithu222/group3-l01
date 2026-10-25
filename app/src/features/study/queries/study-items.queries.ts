import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { studyService } from '../api/study.service';
import type { PutItemsPayload, StudySetDetailDto } from '../api/study.types';
import { srKeys } from './sr.queries';
import { studyKeys } from './study.keys';

/**
 * Mục của bộ KÈM đáp án (≤ 500, một lượt). Dùng cho cả trình soạn lẫn chế độ học — `SetOverviewScreen` prefetch để
 * "Học thẻ" mở tức thì và chạy lại được từ cache khi mất mạng (app.md p4-01 §3).
 */
export function useStudyItems(setId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: studyKeys.items(setId ?? ''),
    queryFn: () => studyService.items(setId as string),
    enabled: enabled && Boolean(setId),
    retry: false,
    staleTime: 60_000,
  });
}

/**
 * `PUT items` (một transaction phía BE). Lỗi KHÔNG toast: `STUDY_001` gắn theo mục, `RES_003` mở hộp thoại xung đột,
 * `STUDY_002/004` hiện banner — màn soạn đọc `mutation.error`. Thành công: cập nhật `version`/`itemCount` của bộ ngay
 * (khỏi chờ refetch) và làm cũ `items`.
 */
export function useSaveItems(setId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PutItemsPayload) => studyService.putItems(setId, payload),
    onSuccess: (result) => {
      queryClient.setQueryData<StudySetDetailDto>(studyKeys.detail(setId), (detail) =>
        detail ? { ...detail, itemCount: result.itemCount, version: result.version } : detail,
      );
      // ⚠️ Vá tay chỉ có `itemCount`/`version`; trường server TÍNH từ mục (`hasQuiz`, `itemTypesMask`…) quyết định lối vào
      // Trắc nghiệm/Thi thử ở màn tổng quan (nằm DƯỚI trình soạn, vẫn mounted) — không lấy lại thì lối vào sai tới khi tải lại app.
      void queryClient.invalidateQueries({ queryKey: studyKeys.detail(setId) });
      void queryClient.invalidateQueries({ queryKey: ['study-sets', 'list'] });
      // Thẻ ôn theo lịch của mục đã sửa/xoá đổi theo; bộ luyện tập hiện trong buổi Lộ trình (tên/số mục) — tiền tố của
      // `roadmapKeys.lesson(id)` (`roadmap.keys.ts`), ghi tay để file query không kéo cả barrel UI của `roadmap` vào.
      void queryClient.invalidateQueries({ queryKey: srKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['roadmap', 'lesson'] });
    },
  });
}
