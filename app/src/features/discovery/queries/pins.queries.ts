import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';

import { chatKeys } from '@/features/chat';
import { showToast } from '@/shared/utils/toast.utils';

import { discoveryKeys } from '../api/discovery.keys';
import { discoveryService } from '../api/discovery.service';
import type { DiscoveryScope, PinsPage } from '../api/discovery.types';

type PinsData = InfiniteData<PinsPage>;
type ScopeRef = Pick<DiscoveryScope, 'scopeId' | 'scopeType'>;

/**
 * Danh sách ghim của phạm vi (app.md p1-09 §4). `refetchOnMount: 'always'`: ghim/bỏ ghim ở màn chat chỉ làm mới khoá
 * của `chat`, không phải khoá này — mở lại danh sách phải luôn lấy bản mới (≤ 20 tin, rẻ).
 */
export function usePins(scope: ScopeRef) {
  return useInfiniteQuery({
    queryKey: discoveryKeys.pins(scope),
    queryFn: ({ pageParam }) => discoveryService.listPins(scope, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined,
    staleTime: 60_000,
    refetchOnMount: 'always',
    retry: false,
  });
}

/** Bỏ một tin khỏi mọi trang + trừ `total` — dùng cho gỡ ghim lạc quan. */
export function removePinned(data: PinsData | undefined, messageId: string): PinsData | undefined {
  if (!data?.pages.some((page) => page.data.some((item) => item.id === messageId))) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      data: page.data.filter((item) => item.id !== messageId),
      meta: { ...page.meta, total: Math.max(0, page.meta.total - 1) },
    })),
  };
}

/**
 * Gỡ ghim từ danh sách: xoá dòng NGAY, lỗi thì khôi phục bản cũ (interceptor đã toast lý do — `MSG_012`, mất quyền…).
 * Thành công vẫn `invalidate` để `total/max` khớp server; socket `pin:updated` (`usePinsSocket`) làm mới tiếp nếu máy khác ghim.
 */
export function useUnpin(scope: ScopeRef) {
  const queryClient = useQueryClient();
  const queryKey = discoveryKeys.pins(scope);

  return useMutation({
    mutationFn: (messageId: string) => discoveryService.unpin(messageId),
    onMutate: async (messageId) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<PinsData>(queryKey);
      queryClient.setQueryData<PinsData | undefined>(queryKey, (data) =>
        removePinned(data, messageId),
      );
      return { previous };
    },
    onError: (_error, _messageId, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSuccess: () => showToast('success', 'Đã bỏ ghim tin nhắn'),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
      // Thanh ghim đầu phòng chat (`chat`, khoá riêng) — làm mới ngay, không đợi socket `pin:updated` (phòng đang mở nằm dưới màn này).
      void queryClient.invalidateQueries({ queryKey: chatKeys.pins({ scopeType: scope.scopeType, scopeId: scope.scopeId }) });
    },
  });
}
