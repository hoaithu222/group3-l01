import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';

import { announcementKeys } from '../api/announcements.keys';
import { announcementsService } from '../api/announcements.service';
import type { ReceiptStatus } from '../api/announcements.types';

/**
 * Danh sách đã/chưa xác nhận (cursor). `keepPreviousData`: đổi tab thì `data` còn của tab cũ trong lúc tải tab mới — màn
 * dùng nó để GIỮ số đếm "12/40" (số đếm giống nhau ở cả hai tab), nhưng ẨN các dòng của tab cũ (`isPlaceholderData`).
 * `retry: false`: 403/404 phải hiện NGAY (màn quay lại), không đợi ba lượt thử.
 */
export function useAnnouncementReceipts(messageId: string, status: ReceiptStatus) {
  return useInfiniteQuery({
    queryKey: announcementKeys.receipts(messageId, status),
    queryFn: ({ pageParam }) =>
      announcementsService.listReceipts(messageId, { cursor: pageParam, status }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined,
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 15_000,
  });
}
