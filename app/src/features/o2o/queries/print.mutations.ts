import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuthStore } from '@/shell/store/slices/auth';

import type {
  CreateOrderPayload,
  OrderWithPin,
  PrintOrderView,
  UpdateOrderPayload,
} from '../api/o2o.types';
import { printService } from '../api/print.service';
import { clearPin, savePin } from '../utils/pin-vault';
import { o2oKeys } from './o2o.keys';

/**
 * Các lượt GHI đơn in. Lỗi KHÔNG toast ở đây (service đã `skipErrorToast`) — nơi gọi hiện bằng `o2oErrorMessage` đúng chỗ (dưới ô, trong hộp
 * thoại…). Mỗi lượt thành công ghi thẳng đơn mới vào cache `['o2o','order',id]` để màn vé/cấu hình đổi ngay, không đợi lượt tải lại.
 */
function useOrderCache() {
  const queryClient = useQueryClient();
  return {
    put(order: PrintOrderView) {
      queryClient.setQueryData(o2oKeys.order(order.id), order);
      void queryClient.invalidateQueries({ queryKey: o2oKeys.ordersAll() });
    },
  };
}

export function useCreatePrintOrder() {
  const cache = useOrderCache();
  return useMutation({
    mutationFn: ({
      payload,
      idempotencyKey,
    }: {
      payload: CreateOrderPayload;
      idempotencyKey: string;
    }) => printService.create(payload, idempotencyKey),
    onSuccess: cache.put,
  });
}

export function useUpdatePrintOrder(orderId: string | undefined) {
  const cache = useOrderCache();
  return useMutation({
    mutationFn: (payload: UpdateOrderPayload) => printService.update(orderId as string, payload),
    onSuccess: cache.put,
  });
}

/**
 * ⚠️ Cất PIN vào kho khoá NGAY TRONG `mutationFn`, trước khi lời hứa hoàn tất: PIN chỉ có trong phản hồi này, mà nếu `onSuccess` của màn bị
 * huỷ (người dùng rời màn đúng lúc, màn bị gỡ) thì PIN mất vĩnh viễn — chỉ còn cách "Tạo PIN mới". Ghi ở đây thì màn nào cũng thấy PIN sau đó.
 */
async function withStoredPin(
  userId: string | undefined,
  result: OrderWithPin,
): Promise<OrderWithPin> {
  if (userId) await savePin(userId, result.order.id, result.pin);
  return result;
}

export function useSubmitPrintOrder() {
  const cache = useOrderCache();
  const userId = useAuthStore((state) => state.user?.id);
  return useMutation({
    // PIN nằm trong kết quả mutation — `gcTime: 0` để nó không ở lại bộ nhớ đệm 5 phút sau khi màn đã nhận (PIN chỉ sống trong kho khoá).
    gcTime: 0,
    mutationFn: async (orderId: string) =>
      withStoredPin(userId, await printService.submit(orderId)),
    onSuccess: ({ order }) => cache.put(order),
  });
}

export function useRegeneratePin() {
  const cache = useOrderCache();
  const userId = useAuthStore((state) => state.user?.id);
  return useMutation({
    gcTime: 0, // như `useSubmitPrintOrder`: kết quả mang PIN mới.
    mutationFn: async (orderId: string) =>
      withStoredPin(userId, await printService.regeneratePin(orderId)),
    onSuccess: ({ order }) => cache.put(order),
  });
}

export function useCancelPrintOrder() {
  const cache = useOrderCache();
  const userId = useAuthStore((state) => state.user?.id);
  return useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason?: string }) =>
      printService.cancel(orderId, reason),
    onSuccess: (order) => {
      if (userId) void clearPin(userId, order.id); // Đơn đã huỷ thì PIN vô dụng — không để PIN thừa nằm trong kho khoá.
      cache.put(order);
    },
  });
}
