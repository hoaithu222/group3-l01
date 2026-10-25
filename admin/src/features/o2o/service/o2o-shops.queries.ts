import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';

import type { AdminShopsParams } from '../types/o2o.types';
import { o2oKeys, useInvalidateO2o } from './o2o.keys';
import { o2oService } from './o2o.service';

/** `GET /admin/print-shops` (phân trang server). */
export const useAdminShops = (params: AdminShopsParams) =>
  useQuery({
    queryKey: o2oKeys.shops(params),
    queryFn: () => o2oService.listShops(params),
    placeholderData: keepPreviousData,
  });

/** `GET /admin/print-shops/:id` (kèm số đơn PENDING) — chỉ tải khi ngăn kéo mở. */
export const useAdminShop = (id: string | undefined) =>
  useQuery({
    queryKey: o2oKeys.shop(id ?? ''),
    queryFn: () => o2oService.getShop(id ?? ''),
    select: (res) => res.data,
    enabled: !!id,
    retry: false,
  });

/** Tạo tiệm (PENDING) — lỗi `O2O_009`/`O2O_013` để form tự gắn vào ô, interceptor vẫn toast thông điệp mã lỗi. */
export const useCreateShop = () => {
  const invalidate = useInvalidateO2o();
  return useMutation({
    mutationFn: o2oService.createShop,
    onSuccess: () => {
      showToast('success', 'Đã tạo tiệm in (chờ duyệt) và ghi nhật ký');
      invalidate();
    },
  });
};

/** PATCH bảng giá/năng lực/nhận đơn — làm mới cả khi lỗi (`RES_003`: vừa bị sửa ở nơi khác). */
export const useUpdateShop = () => {
  const invalidate = useInvalidateO2o();
  return useMutation({
    mutationFn: o2oService.updateShop,
    onSuccess: () => showToast('success', 'Đã lưu tiệm in và ghi nhật ký'),
    onSettled: invalidate,
  });
};

export const useApproveShop = () => {
  const invalidate = useInvalidateO2o();
  return useMutation({
    mutationFn: o2oService.approveShop,
    onSuccess: () =>
      showToast('success', 'Đã duyệt tiệm — chủ tiệm có quyền vào cổng trong ≤ 60 giây'),
    onSettled: invalidate,
  });
};

/** Tạm ngưng: BE tự từ chối đơn PENDING ("Tiệm tạm ngưng") và trả `rejectedOrders`. */
export const useSuspendShop = () => {
  const invalidate = useInvalidateO2o();
  return useMutation({
    mutationFn: o2oService.suspendShop,
    onSuccess: (res) =>
      showToast(
        'success',
        res.data.rejectedOrders > 0
          ? `Đã tạm ngưng tiệm — ${res.data.rejectedOrders} đơn chờ nhận đã bị từ chối`
          : 'Đã tạm ngưng tiệm và ghi nhật ký',
      ),
    onSettled: invalidate,
  });
};
