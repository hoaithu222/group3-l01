import { Avatar, type AvatarSize } from '@/shared/ui/avatar';
import type { IconName } from '@/shared/ui/icon';

export interface WorkspaceAvatarProps {
  name: string;
  avatarUrl: string | null | undefined;
  size?: AvatarSize;
  className?: string;
  /**
   * Hình khi CHƯA có cả ảnh lẫn tên (ô xem trước của form tạo nhóm lúc tên còn trống) — mặc định hình người của `Avatar`.
   * Tuỳ chọn, thêm sau: mọi nơi gọi cũ (thẻ danh sách, đầu trang tổng quan, cài đặt) không đổi gì.
   */
  fallbackIcon?: IconName;
}

/**
 * Ảnh đại diện nhóm (app.md p1-01 §2): ảnh thật khi có `avatarUrl`, còn lại chữ
 * viết tắt của TÊN nhóm. Truyền cả `source` lẫn `name` để ảnh lỗi tải thì chữ đỡ
 * lấy (`Avatar` tự dự phòng) — `avatarUrl` do BE ký sẵn từ `avatarAssetId`
 * (`avatarUrlOf`, `be/src/shared/media/display-image.ts`, dùng ở
 * `workspace.presenter.ts`) nên chỉ `null` khi nhóm CHƯA đặt ảnh, không phải
 * lúc nào cũng `null`.
 */
export function WorkspaceAvatar({
  name,
  avatarUrl,
  size = 'lg',
  className,
  fallbackIcon,
}: WorkspaceAvatarProps) {
  return (
    <Avatar
      className={className}
      fallbackIcon={fallbackIcon}
      name={name}
      size={size}
      source={avatarUrl ? { uri: avatarUrl } : undefined}
    />
  );
}
