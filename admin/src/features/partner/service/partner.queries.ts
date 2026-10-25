import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { openInNewTab } from '@/shared/utils/browser/link.utils';
import { showToast } from '@/shared/utils/toast.utils';

import {
  QUEUE_PAGE_LIMIT,
  QUEUE_REFETCH_MS,
  QUEUE_STATUS_PARAM,
} from '../constants/partner.constants';
import type { PartnerOrderStep } from '../types/partner.types';
import { partnerKeys } from './partner.keys';
import { partnerService } from './partner.service';

/** `GET /partner/shops/me` — tiệm của tôi (trạng thái duyệt, nhận đơn, bảng giá chỉ đọc). */
export const usePartnerShops = () =>
  useQuery({
    queryKey: partnerKeys.shops(),
    queryFn: partnerService.myShops,
    select: (res) => res.data,
  });

/**
 * Hàng đợi (bốn trạng thái đang xử lý), cursor + "Tải thêm". Socket `partner:order` làm mới ngay khi có đơn; định kỳ 60 giây là
 * đường lùi khi socket rớt (tab ẩn thì React Query không làm mới nền).
 */
export const usePartnerQueue = () =>
  useInfiniteQuery({
    queryKey: partnerKeys.orders(QUEUE_STATUS_PARAM),
    queryFn: ({ pageParam }) =>
      partnerService.listOrders({
        status: QUEUE_STATUS_PARAM,
        cursor: pageParam,
        limit: QUEUE_PAGE_LIMIT,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? (last.meta.nextCursor ?? undefined) : undefined,
    refetchInterval: QUEUE_REFETCH_MS,
  });

/** `GET /partner/orders/:id` — 404 (đơn của tiệm khác/không tồn tại) không tự khỏi khi gọi lại → không retry. */
export const usePartnerOrder = (id: string | undefined) =>
  useQuery({
    queryKey: partnerKeys.order(id ?? ''),
    queryFn: () => partnerService.getOrder(id ?? ''),
    select: (res) => res.data,
    enabled: !!id,
    retry: false,
  });

/** Làm mới hàng đợi + chi tiết + tiệm — dùng sau MỌI thao tác ghi (kể cả khi lỗi: đơn có thể vừa đổi trạng thái ở nơi khác). */
const useRefreshPartner = () => {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: partnerKeys.all });
};

const STEP_TOAST: Record<PartnerOrderStep, string> = {
  accept: 'Đã nhận đơn — có thể tải tệp để in',
  printing: 'Đã chuyển sang đang in',
  ready: 'Đã báo sẵn sàng — khách nhận thông báo',
};

/** Nhận đơn / bắt đầu in / đã in xong (`O2O_004` khi đơn vừa đổi trạng thái → làm mới cho nút khớp BE). */
export const usePartnerStep = () => {
  const refresh = useRefreshPartner();
  return useMutation({
    mutationFn: partnerService.step,
    onSuccess: (_res, vars) => showToast('success', STEP_TOAST[vars.step]),
    onSettled: refresh,
  });
};

export const usePartnerReject = () => {
  const refresh = useRefreshPartner();
  return useMutation({
    mutationFn: partnerService.reject,
    onSuccess: () => showToast('success', 'Đã từ chối đơn — khách nhận thông báo kèm lý do'),
    onSettled: refresh,
  });
};

/** Lấy URL ký rồi mở ở TAB MỚI (tệp tải về ở đó). Lỗi `O2O_006` (chưa nhận đơn) do interceptor toast. */
export const usePartnerDownload = () =>
  useMutation({
    mutationFn: partnerService.file,
    onSuccess: (res) => openInNewTab(res.data.url),
  });

/** Giao hàng bằng PIN — KHÔNG toast lỗi (hộp thoại tự hiện); luôn làm mới vì sai PIN đổi số lần còn lại và đơn có thể đã đổi. */
export const usePartnerPickup = () => {
  const refresh = useRefreshPartner();
  return useMutation({
    mutationFn: partnerService.pickup,
    onSuccess: () => showToast('success', 'Đã giao tài liệu cho khách'),
    onSettled: refresh,
  });
};

export const usePartnerMarkPaid = () => {
  const refresh = useRefreshPartner();
  return useMutation({
    mutationFn: partnerService.markPaid,
    onSuccess: () => showToast('success', 'Đã ghi nhận thu tiền'),
    onSettled: refresh,
  });
};

export const usePartnerAccepting = () => {
  const refresh = useRefreshPartner();
  return useMutation({
    mutationFn: partnerService.setAccepting,
    onSuccess: (res) =>
      showToast('success', res.data.acceptingOrders ? 'Đã bật nhận đơn' : 'Đã tắt nhận đơn'),
    onSettled: refresh,
  });
};
