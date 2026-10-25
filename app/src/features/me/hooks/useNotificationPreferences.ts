import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  notificationKeys,
  notificationPreferencesService,
  type AccountNotificationPreference,
  type UpdateAccountNotificationPreferencePayload,
} from '@/core/notifications';

/**
 * Tuỳ chọn thông báo cấp tài khoản cho màn Cài đặt thông báo (p0-06 `app.md` §4 "Preference").
 *
 * Hàm thuần: áp bản vá lên giá trị đang có — dùng cho cập nhật lạc quan. `isDefault` của trường vừa đổi
 * chuyển `false` (người dùng đã chọn), khớp `AccountPreferenceView.isDefault` của BE.
 */
export function applyPreferencePatch(
  current: AccountNotificationPreference,
  patch: UpdateAccountNotificationPreferencePayload,
): AccountNotificationPreference {
  const isDefault = { ...current.isDefault };
  for (const key of Object.keys(isDefault) as (keyof typeof isDefault)[]) {
    if (patch[key] !== undefined) isDefault[key] = false;
  }
  return {
    ...current,
    ...(patch.channelMode !== undefined && { channelMode: patch.channelMode }),
    ...(patch.directMode !== undefined && { directMode: patch.directMode }),
    ...(patch.groupMode !== undefined && { groupMode: patch.groupMode }),
    ...(patch.lockScreenPreview !== undefined && { lockScreenPreview: patch.lockScreenPreview }),
    ...(patch.sound !== undefined && { sound: patch.sound }),
    ...(patch.dndUntil !== undefined && { dndUntil: patch.dndUntil }),
    isDefault,
  };
}

export function useAccountNotificationPreference() {
  return useQuery({
    queryFn: () => notificationPreferencesService.getAccount(),
    queryKey: notificationKeys.prefs,
    // Cài đặt đổi hiếm; 1 phút đủ để mở lại màn không nháy skeleton mà vẫn thấy thay đổi từ máy khác.
    staleTime: 60_000,
  });
}

/**
 * Đổi tuỳ chọn — LẠC QUAN, lỗi thì hoàn về giá trị cũ (`app.md` §3 "toast + rollback").
 *
 * ⛔ KHÔNG tự toast lỗi: `apiClient` đã toast đúng MỘT lần (`preferences.service.ts` không đặt
 * `skipErrorToast`) — thêm ở đây là toast đôi.
 */
export function useUpdateAccountNotificationPreference() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patch: UpdateAccountNotificationPreferencePayload) =>
      notificationPreferencesService.updateAccount(patch),

    // ⚠️ `onMutate` PHẢI đứng TRƯỚC `onError`: TypeScript suy kiểu `context` của `onError` từ giá trị trả
    // về của `onMutate` theo thứ tự khai báo — đảo lại thì `context.previous` thành lỗi kiểu `{}`.
    onMutate: async (patch) => {
      // Huỷ lượt tải đang bay, không nó ghi đè lên giá trị lạc quan bằng dữ liệu cũ.
      await queryClient.cancelQueries({ queryKey: notificationKeys.prefs });
      const previous = queryClient.getQueryData<AccountNotificationPreference>(
        notificationKeys.prefs,
      );
      if (previous) {
        queryClient.setQueryData(notificationKeys.prefs, applyPreferencePatch(previous, patch));
      }
      return { previous };
    },

    onError: (_error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(notificationKeys.prefs, context.previous);
    },

    // Bản BE trả về là giá trị HIỆU LỰC (đã điền mặc định) — ghi thẳng thay vì tải lại.
    onSuccess: (saved) => {
      queryClient.setQueryData(notificationKeys.prefs, saved);
      // Tuỳ chọn cấp NHÓM mang `effective` (giá trị kế thừa từ tài khoản, server tính) — nhãn "Theo mặc định (…)" ở màn nhóm,
      // Thông tin kênh, hội thoại đọc nó với `staleTime` 5 phút. Tiền tố của `notificationKeys.workspacePrefs(id)`.
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'preferences', 'WORKSPACE'] });
    },
  });
}
