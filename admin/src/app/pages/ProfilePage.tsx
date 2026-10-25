import { memo } from 'react';

import { useAuthStore } from '@/app/store';
import { USER_ROLE_LABEL } from '@/features/user/constants/user.constants';
import { Avatar, Badge, BoxPanel, EmptyState, PageShell, Text } from '@/shared/ui';
import { PageHeader } from '@/shared/widgets/header';

/**
 * Hồ sơ người dùng — đích của mục "Hồ sơ cá nhân" trong menu Header.
 *
 * Cố ý chỉ ĐỌC: base không đoán trước dự án của bạn cho sửa những trường nào.
 * Cần cho sửa thì dựng form ở `features/profile/` rồi thay trang này.
 *
 * Tiêu đề nằm trên THANH HEADER (`<PageHeader>`) ở CẢ HAI nhánh — thanh header
 * không bao giờ trống tiêu đề chỉ vì chưa có phiên.
 */
const ProfilePage = memo(function ProfilePage() {
  const user = useAuthStore((s) => s.user);

  /**
   * ⛔ KHÔNG `return null`.
   *
   * Base xuất xưởng với `VITE_AUTH_ENABLED=false` (xem `env.config.ts`), nên
   * lần chạy đầu tiên KHÔNG có ai đăng nhập và `user` là `null`. `return null`
   * cho ra một trang TRẮNG HOÀN TOÀN: người thử bấm "Hồ sơ cá nhân" trong menu
   * và không thấy gì, không có chữ nào nói vì sao. Đo thực tế trước khi sửa:
   * `<main>` của `/profile` không có một phần tử con nào.
   *
   * Trạng thái rỗng phải TỰ GIẢI THÍCH. Đây cũng là trạng thái đúng khi cờ auth
   * đã bật mà phiên vừa hết hạn.
   */
  if (!user) {
    return (
      <PageShell variant="center">
        <PageHeader title="Thông tin cá nhân" tone="sky" />
        <EmptyState
          description="Bật VITE_AUTH_ENABLED=true rồi đăng nhập để xem hồ sơ. Base mặc định tắt kiểm đăng nhập nên chưa có phiên nào."
          icon="user-bold"
          iconColor="sky"
          title="Chưa đăng nhập"
        />
      </PageShell>
    );
  }

  return (
    <PageShell variant="flow">
      <PageHeader title="Thông tin cá nhân" tone="sky" />

      <BoxPanel className="max-w-2xl" title="TÀI KHOẢN">
        <div className="flex flex-col gap-3 p-2">
          <div className="flex items-center gap-3">
            <Avatar name={user.name} size="lg" src={user.avatar ?? undefined} />
            <div className="flex min-w-0 flex-col">
              <Text size="medium" weight="medium">
                {user.name}
              </Text>
              <Text size="tiny" skin="muted">
                {user.email}
              </Text>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Text size="tiny" skin="muted">
              Vai trò
            </Text>
            <div className="flex flex-wrap gap-1">
              {user.roles.length === 0 ? (
                <Text size="tiny" skin="muted">
                  Chưa được gán vai trò nào
                </Text>
              ) : (
                user.roles.map((role) => (
                  <Badge key={role} color="info" variant="tinted">
                    {/* Nhãn tiếng Việt như mọi màn khác; vai lạ (BE thêm sau) hiện nguyên mã. */}
                    {(USER_ROLE_LABEL as Record<string, string>)[role] ?? role}
                  </Badge>
                ))
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Text size="tiny" skin="muted">
              Quyền chi tiết ({user.permissions.length})
            </Text>
            <div className="flex flex-wrap gap-1">
              {user.permissions.length === 0 ? (
                <Text size="tiny" skin="muted">
                  Chưa có quyền chi tiết nào
                </Text>
              ) : (
                user.permissions.map((p) => (
                  <Badge key={p} color="neutral" variant="tinted">
                    {p}
                  </Badge>
                ))
              )}
            </div>
          </div>
        </div>
      </BoxPanel>
    </PageShell>
  );
});

export default ProfilePage;
