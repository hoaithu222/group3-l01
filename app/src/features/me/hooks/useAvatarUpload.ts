import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { authService } from '@/core/api/auth';
import { useDisplayImageUpload, type DisplayImageUpload } from '@/core/uploads/use-display-image-upload';
import { useAuthStore } from '@/shell/store/slices/auth';

/**
 * Đổi ảnh đại diện TÀI KHOẢN (`MeAvatarPicker`, hiện ở `MeProfileCard`) — chọn/tải ảnh (`useDisplayImageUpload`,
 * scope `AVATAR`, khoá `me-avatar`) rồi PATCH `avatarAssetId` lên `/users/:id` (be `SELF_EDITABLE_FIELDS`).
 *
 * ⚠️ KHÔNG dùng phản hồi PATCH để ghi store: nó trả hình dạng khác (`avatarUrl`, xem `profile.service.ts`). Thành
 * công thì gọi lại `authService.me()` (đúng hình `AuthUser`, có `avatar`) rồi `setAuth` — avatar đổi NGAY ở mọi nơi
 * đọc `user.avatar` (kể cả `MeProfileCard` lẫn các màn khác), không cần tải lại app.
 *
 * `reset()` (bỏ ảnh cục bộ khỏi hàng đợi) gọi ở CẢ HAI nhánh khi PATCH xong — đúng hợp đồng của
 * `useDisplayImageUpload.reset`: thắng thì `user.avatar` mới đã có trong store, thua thì store giữ nguyên ảnh cũ,
 * ảnh cục bộ hết vai trò ở cả hai trường hợp. Lỗi PATCH (mạng, quyền, asset không hợp lệ) không tự toast ở đây —
 * `apiClient` đã toast chung MỘT LẦN, thêm nhánh nữa là toast trùng (xem skill `api-data`).
 *
 * `uploadRef`: `mutation` cần gọi `upload.reset()`, nhưng `upload` lại cần `mutation.mutate` làm `onReady` ⇒ vòng
 * phụ thuộc hai chiều trong cùng một hàm. Dùng ref để phá vòng mà không phải định nghĩa lại `useDisplayImageUpload`.
 * ⛔ Ghi `ref.current` PHẢI nằm trong `useEffect` — ghi thẳng lúc render bị `react-hooks/refs` chặn (ESLint), vì
 * refs vốn để đọc/ghi NGOÀI lượt render (effect/handler), không phải trong thân hàm component/hook.
 */
export function useAvatarUpload(): DisplayImageUpload {
  const uploadRef = useRef<DisplayImageUpload | null>(null);

  const mutation = useMutation({
    mutationFn: async (assetId: string) => {
      const userId = useAuthStore.getState().user?.id;
      if (!userId) throw new Error('Chưa đăng nhập');
      await authService.updateAvatar(userId, assetId);
      return authService.me();
    },
    onError: () => uploadRef.current?.reset(),
    onSuccess: (user) => {
      useAuthStore.getState().setAuth({ user });
      uploadRef.current?.reset();
    },
  });

  const upload = useDisplayImageUpload({
    onReady: (assetId) => mutation.mutate(assetId),
    slot: 'me-avatar',
  });
  useEffect(() => {
    uploadRef.current = upload;
  });

  // Vòng chờ phải phủ suốt từ lúc nén ảnh tới lúc PATCH xong — `upload.busy` tự tắt ngay khi tệp lên `ready`,
  // trước khi PATCH kịp chạy; thiếu `mutation.isPending` ở đây thì có một nhịp avatar cũ hiện lại rồi mới đổi.
  return { ...upload, busy: upload.busy || mutation.isPending };
}
