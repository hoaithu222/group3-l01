import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { authService } from '@/core/api/auth';
import { toErrorMessage } from '@/core/api/client.helpers';
import { useBusyGuard } from '@/shared/hooks/useBusyGuard';
import { hapticSuccess } from '@/shared/utils/haptics';
import { normalizePhone } from '@/shared/utils/phone.utils';
import { showToast } from '@/shared/utils/toast.utils';
import { useAuthStore, type AuthUser } from '@/shell/store/slices/auth';

import {
  EDIT_PROFILE_SAVED_MESSAGE,
  PHONE_INVALID_MESSAGE,
} from '../constants/edit-profile.messages';
import type { EditProfileFormValues } from '../schemas/edit-profile.schemas';

/**
 * `useEditProfile()` — màn "Sửa hồ sơ": đổi TÊN (`PATCH /users/:id { name }`) và SĐT (`PATCH /me/phone`), rồi cập nhật hồ sơ
 * trong `useAuthStore` để màn Tôi và mọi nơi đọc `user.name`/`user.phone` đổi NGAY, không cần tải lại app.
 *
 * ── Chỉ gọi lượt nào ĐÃ ĐỔI ─────────────────────────────────────────────────────
 * So với hồ sơ đang lưu: tên giữ nguyên thì không PATCH tên; SĐT giữ nguyên (sau chuẩn hoá E.164, nên `0912 345 678` và
 * `+84912345678` là MỘT số) thì không PATCH SĐT. Không đổi gì ⇒ hai lượt đều bỏ qua và màn chỉ đóng lại.
 *
 * ── Hai lượt, có thể lưu NỬA ─────────────────────────────────────────────────────
 * Hai endpoint khác nhau nên không có giao dịch chung: tên lưu được mà SĐT bị từ chối (429 `RATE_002`…) là ca thật. Khi đó ghi
 * PHẦN ĐÃ LƯU vào store trước rồi mới ném lỗi — nếu không, màn Tôi hiện tên CŨ trong khi BE đã đổi, và bấm "Lưu" lần nữa còn
 * ghi đè lại. Lỗi hiện TRONG form (`errorMessage`, cả hai service đã `skipErrorToast`), không phải toast tự tắt sau 4 giây.
 *
 * ── Vì sao gọi lại `authService.me()` ────────────────────────────────────────────
 * PATCH `/users/:id` trả hình dạng KHÁC `AuthUser` (`avatarUrl`, không phải `avatar` — xem `profile.service.ts`) và `/me/phone`
 * chỉ trả `{ phone }`. `GET /auth/me` là nguồn DUY NHẤT đúng hình `AuthUser` (BE còn `trim`/lọc HTML tên). Lấy hồ sơ hỏng thì
 * KHÔNG coi cả lượt là lỗi (dữ liệu đã lưu thật) — dùng bản đã gộp tại chỗ.
 */
export function useEditProfile() {
  const router = useRouter();
  const guard = useBusyGuard();

  const mutation = useMutation({
    mutationFn: async (values: EditProfileFormValues): Promise<AuthUser> => {
      const current = useAuthStore.getState().user;
      if (!current) throw new Error('Chưa đăng nhập');

      const nextName = values.name.trim();
      const rawPhone = values.phone.trim();
      const nextPhone = rawPhone === '' ? null : normalizePhone(rawPhone);
      // ⛔ Schema đã chặn — nhưng nếu hai bản `normalizePhone` (app/BE) lệch nhau thì `null` ở đây sẽ XOÁ số đang lưu. Chặn cứng.
      if (rawPhone !== '' && nextPhone === null) throw new Error(PHONE_INVALID_MESSAGE);

      let merged: AuthUser = current;
      try {
        if (nextName !== current.name) {
          await authService.updateName(current.id, nextName);
          merged = { ...merged, name: nextName };
        }
        if (nextPhone !== (current.phone ?? null)) {
          const { phone } = await authService.updatePhone(nextPhone);
          merged = { ...merged, phone };
        }
      } catch (error) {
        if (merged !== current) useAuthStore.getState().setAuth({ user: merged });
        throw error;
      }

      if (merged === current) return current;
      try {
        return await authService.me();
      } catch {
        return merged;
      }
    },

    onSuccess: (user) => {
      useAuthStore.getState().setAuth({ user });
      hapticSuccess();
      showToast('success', EDIT_PROFILE_SAVED_MESSAGE);
      router.back();
    },
  });

  const { mutate, reset } = mutation;
  // ⛔ Chống gửi đúp: "Xong" trên bàn phím + nút "Lưu" cùng bắn được hai lượt (`isPending` cập nhật bất đồng bộ — xem `useBusyGuard`).
  const save = useCallback(
    (values: EditProfileFormValues) => guard((release) => mutate(values, { onSettled: release })),
    [guard, mutate],
  );

  return {
    save,
    reset,
    isPending: mutation.isPending,
    errorMessage: mutation.error ? toErrorMessage(mutation.error) : null,
  };
}
