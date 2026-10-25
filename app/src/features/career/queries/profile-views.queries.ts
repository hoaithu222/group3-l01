import { useInfiniteQuery } from '@tanstack/react-query';

import { profileViewsService } from '../api/profile-views.service';
import { offerKeys } from './offers.keys';

/**
 * "Ai đã xem hồ sơ của tôi" (cursor, mới nhất trước). Không thử lại: lỗi hiện trên màn, và 404 (`CFG_005` — cờ `career` hoặc
 * bảng tin nhà tuyển dụng tắt) thử lại chỉ kéo dài màn "đang tải". Không có socket cho lượt xem ⇒ màn dùng `useRefetchOnFocus`.
 */
export function useProfileViews() {
  return useInfiniteQuery({
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      profileViewsService.list(pageParam),
    queryKey: offerKeys.profileViews(),
    retry: false,
  });
}
