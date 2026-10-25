import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import type { OrderGroup, PrintSettings } from '../api/o2o.types';
import { printService } from '../api/print.service';
import { COUNT_PAGES_POLL_MS } from '../constants/o2o.constants';
import { isCountingPages } from '../utils/order-status';
import { o2oKeys } from './o2o.keys';

export function usePrintShop(shopId: string | undefined) {
  return useQuery({
    queryKey: o2oKeys.shop(shopId ?? ''),
    queryFn: () => printService.shop(shopId as string),
    enabled: Boolean(shopId),
    staleTime: 30_000,
    // 404 = tiệm chưa duyệt/không còn — câu trả lời dứt khoát.
    retry: false,
  });
}

/**
 * Báo giá THỬ theo bảng giá hiện tại của tiệm (không lưu). Chỉ chạy khi đã biết số trang và khoảng trang hợp lệ (`enabled` do nơi gọi tính).
 * `keepPreviousData`: đổi cấu hình thì số cũ còn đó (mờ đi) tới khi có số mới — không nháy trống giữa lúc người dùng bấm Stepper liên tục.
 * `retry: false` vì lỗi thường gặp (`O2O_002`/`O2O_012`) là câu trả lời dứt khoát, không phải sự cố mạng.
 */
export function useQuote(
  shopId: string | undefined,
  pages: number | null,
  settings: PrintSettings,
  enabled: boolean,
) {
  return useQuery({
    queryKey: o2oKeys.quote(shopId ?? '', pages ?? 0, settings),
    queryFn: () => printService.quote(shopId as string, pages as number, settings),
    enabled: enabled && Boolean(shopId) && pages !== null,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
  });
}

/**
 * Chi tiết một đơn của tôi. Socket `print-order:updated` là đường cập nhật CHÍNH; hỏi lại mỗi 3 giây chỉ khi còn đang đếm trang (đơn nháp,
 * chưa có số trang) — phòng khi socket rớt đúng lúc đó thì màn cấu hình không kẹt ở "Đang đếm trang…" mãi.
 */
export function usePrintOrder(orderId: string | undefined) {
  return useQuery({
    queryKey: o2oKeys.order(orderId ?? ''),
    queryFn: () => printService.get(orderId as string),
    enabled: Boolean(orderId),
    staleTime: 15_000,
    retry: false,
    refetchInterval: (query) =>
      query.state.data && isCountingPages(query.state.data) ? COUNT_PAGES_POLL_MS : false,
  });
}

/** "Đơn của tôi" theo nhóm trạng thái, phân trang cursor. */
export function useMyPrintOrders(group: OrderGroup) {
  return useInfiniteQuery({
    queryKey: o2oKeys.orders(group),
    queryFn: ({ pageParam }) => printService.list(group, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined,
    staleTime: 15_000,
  });
}
