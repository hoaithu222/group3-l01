import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';

import { jobSettingsService } from '../api/career-settings.service';
import { companyBlocksService } from '../api/company-blocks.service';
import { offersService } from '../api/offers.service';
import { patchListFromDetail } from '../utils/offer-cache';
import { offerKeys } from './offers.keys';

/** Hồ sơ Tìm việc. Lỗi hiện trên màn (404 = cờ `career` tắt) nên không thử lại — thử lại 404 chỉ kéo dài màn "đang tải". */
export function useJobSettings() {
  return useQuery({
    queryFn: jobSettingsService.get,
    queryKey: offerKeys.jobSettings(),
    retry: false,
  });
}

/** Hộp thư lời mời (cursor). Một khoá cho mọi nhóm lọc — xem `offers.keys.ts`. `enabled = false` khi chưa nên hỏi (thẻ ở màn Nghề nghiệp chờ cờ). */
export function useMyOffers(enabled = true) {
  return useInfiniteQuery({
    enabled,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => offersService.list(pageParam),
    queryKey: offerKeys.list(),
    retry: false,
  });
}

/**
 * ⚠️ Lần đầu mở, server chuyển `SENT → READ` (tác dụng phụ của GET) — nên vá luôn dòng trong danh sách theo bản vừa tải (`patchListFromDetail`), không chờ socket.
 * 404 ⇒ "Lời mời không còn", không thử lại.
 */
export function useOffer(offerId: string) {
  const qc = useQueryClient();
  return useQuery({
    enabled: offerId.length > 0,
    queryFn: async () => {
      const detail = await offersService.get(offerId);
      patchListFromDetail(qc, detail);
      return detail;
    },
    queryKey: offerKeys.detail(offerId),
    retry: false,
  });
}

/** Tin trao đổi, MỚI nhất trước; trang kế là tin CŨ hơn. Chỉ tải khi thread đã mở (`enabled`). */
export function useOfferMessages(offerId: string, enabled = true) {
  return useInfiniteQuery({
    enabled: enabled && offerId.length > 0,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      offersService.messages(offerId, pageParam),
    queryKey: offerKeys.messages(offerId),
    retry: false,
  });
}

export function useCompanyBlocks() {
  return useQuery({
    queryFn: companyBlocksService.list,
    queryKey: offerKeys.blocks(),
    retry: false,
  });
}
