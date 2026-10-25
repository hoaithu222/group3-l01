import { useAuthStore } from '@/app/store';
import { authService } from '@/core/api/auth';

/**
 * Làm mới hồ sơ + QUYỀN của người đang đăng nhập (`GET /auth/me`) rồi ghi vào store. BE cấp `recruiter:view|create|update` theo DỮ LIỆU (thành viên doanh nghiệp, cache 60 s) nên ngay sau
 * khi đăng ký doanh nghiệp, store còn quyền CŨ — `resolveAudience` chỉ chuyển sang layout recruiter và `PermissionGuard` chỉ cho vào `/recruiter/portal` khi có quyền mới.
 * Lỗi (mất mạng…) bị nuốt: việc làm mới quyền không được phá luồng đăng ký đã thành công — quyền mới sẽ tới ở lần làm mới phiên kế tiếp.
 */
export async function refreshAuthUser(): Promise<void> {
  try {
    const me = await authService.me();
    useAuthStore.getState().setAuth({ user: me.data });
  } catch {
    // Xem chú thích trên.
  }
}
