import { apiClient } from '../client';

/**
 * "Ảnh đại diện tài khoản" (đổi ảnh ở `MeProfileCard`) và "Tên hiển thị" (màn "Sửa hồ sơ") — `PATCH /users/:id`, KHÔNG
 * phải `/me/*`: tách khỏi `account.service.ts` (file đó gom đúng nhóm endpoint `/me/*` — xem đầu file đó) vì đây là route
 * của module `users` (be `user.routes.ts`/`user.controller.ts`). Tự sửa hồ sơ mình (không có quyền `user:update`) chỉ được
 * đổi `name`/`avatarAssetId` — field khác trong body bị BE lọc bỏ ÂM THẦM (`SELF_EDITABLE_FIELDS`), nên mỗi hàm ở đây
 * cố tình chỉ nhận đúng MỘT field của mình, không mở rộng thêm field nào khác. (SĐT là route riêng `PATCH /me/phone` —
 * `account.service.ts`.)
 *
 * ⚠️ Phản hồi PATCH trả `user` đã sanitize CỦA MODULE USERS (`avatarUrl`, KHÔNG PHẢI `avatar`) — khác hình dạng
 * `AuthUser` mà `useAuthStore` đang giữ (`avatar`, từ `/auth/me`). Vì vậy hàm này bỏ luôn phản hồi (trả `void`) —
 * nơi gọi (`useAvatarUpload`) gọi lại `authService.me()` để lấy đúng hình dạng `AuthUser` rồi mới ghi vào store,
 * tránh phải tự map hai DTO khác nhau của cùng một khái niệm "hồ sơ người dùng".
 */
export const profileAuthService = {
  async updateAvatar(userId: string, avatarAssetId: string | null): Promise<void> {
    await apiClient.patch(`/users/${encodeURIComponent(userId)}`, { avatarAssetId });
  },

  /**
   * Đổi TÊN HIỂN THỊ của chính mình (màn "Sửa hồ sơ") — cùng route `PATCH /users/:id`, cùng lý do bỏ phản hồi như trên.
   * BE (`updateUserSchema`) trim và giới hạn 1–80 ký tự (400 `VAL_001` nếu vi phạm; app đã chặn trước ở schema form).
   *
   * ⛔ `skipErrorToast`: lỗi hiện TRONG form (`Alert` dưới ô nhập), không phải toast tự tắt sau 4 giây.
   * ⛔ Chỉ gửi `name`: tự sửa hồ sơ mình (không có `user:update`) bị BE lọc còn `name`/`avatarAssetId` — còn `email`/
   * `password` đòi `currentPassword` và THU HỒI MỌI PHIÊN, không thuộc màn này.
   */
  async updateName(userId: string, name: string): Promise<void> {
    await apiClient.patch(
      `/users/${encodeURIComponent(userId)}`,
      { name },
      { skipErrorToast: true },
    );
  },
};
