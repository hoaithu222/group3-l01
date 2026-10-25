import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { devicesService, notificationKeys } from '@/core/notifications';
import { showToast } from '@/shared/utils/toast.utils';

/**
 * Danh sách thiết bị nhận thông báo (p0-06 `app.md` §3 "Thiết bị").
 *
 * `staleTime: 0` — cùng lý do `useSessions`: gỡ ở máy khác hoặc BE tự thu hồi (quá số thiết bị, token chết)
 * phải hiện ngay khi mở lại màn, không phải hiện lại danh sách cũ.
 */
export function useDevices() {
  return useQuery({
    queryFn: () => devicesService.list(),
    queryKey: notificationKeys.devices,
    staleTime: 0,
  });
}

/**
 * Gỡ MỘT thiết bị. Lỗi do `apiClient` toast (không `silent`) — không toast thêm ở đây.
 */
export function useRemoveDevice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (deviceId: string) => devicesService.remove(deviceId),
    onSuccess: () => {
      showToast('success', 'Đã gỡ thiết bị.');
      void queryClient.invalidateQueries({ queryKey: notificationKeys.devices });
    },
  });
}
