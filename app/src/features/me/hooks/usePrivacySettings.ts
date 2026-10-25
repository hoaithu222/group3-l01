import { useMutation } from '@tanstack/react-query';

import { authService } from '@/core/api/auth';
import type { UpdatePrivacyPayload } from '@/core/api/auth';
import { toErrorMessage } from '@/core/api/client.helpers';
import { showToast } from '@/shared/utils/toast.utils';
import { useAuthStore } from '@/shell/store/slices/auth';

/**
 * `useUpdatePrivacy()` — "Quyền riêng tư" (p0-01 mục 10, card trong
 * `MeSettingsScreen`): đổi tức thì, không có nút Lưu riêng.
 *
 * ⛔ KHÔNG optimistic-update: `PrivacySettingsCard` đọc `value` THẲNG từ
 * `user?.privacy` trong store (cùng cách `BiometricSettingRow` đọc `binding`),
 * nên công tắc chỉ đổi SAU KHI BE xác nhận. Không cần code "rollback" riêng —
 * lỗi thì store không đổi, công tắc tự đứng nguyên ở giá trị cũ, và toast báo
 * lỗi để người dùng biết vì sao không thấy gì đổi.
 */
export function useUpdatePrivacy() {
  const mutation = useMutation({
    mutationFn: (payload: UpdatePrivacyPayload) => authService.updatePrivacy(payload),
    onSuccess: (privacy) => {
      const user = useAuthStore.getState().user;
      if (user) useAuthStore.getState().setAuth({ user: { ...user, privacy } });
    },
    onError: (error) => showToast('error', toErrorMessage(error)),
  });

  return { isPending: mutation.isPending, updatePrivacy: mutation.mutate };
}
