import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';

import type { AdminOrdersParams } from '../types/o2o.types';
import { o2oKeys, useInvalidateO2o } from './o2o.keys';
import { o2oService } from './o2o.service';

/** `GET /admin/print-orders` (phân trang server) — không PIN, không URL tệp. */
export const useAdminOrders = (params: AdminOrdersParams) =>
  useQuery({
    queryKey: o2oKeys.orders(params),
    queryFn: () => o2oService.listOrders(params),
    placeholderData: keepPreviousData,
  });

/** `GET /admin/print-orders/:id` — chỉ tải khi ngăn kéo mở. */
export const useAdminOrder = (id: string | undefined) =>
  useQuery({
    queryKey: o2oKeys.order(id ?? ''),
    queryFn: () => o2oService.getOrder(id ?? ''),
    select: (res) => res.data,
    enabled: !!id,
    retry: false,
  });

/** Huỷ đơn khi khiếu nại (`print.order-cancel-admin`) — lỗi `O2O_004` (đơn vừa đổi trạng thái) cũng làm mới để nút khớp BE. */
export const useCancelOrder = () => {
  const invalidate = useInvalidateO2o();
  return useMutation({
    mutationFn: o2oService.cancelOrder,
    onSuccess: () => showToast('success', 'Đã huỷ đơn in, thông báo khách/tiệm và ghi nhật ký'),
    onSettled: invalidate,
  });
};
