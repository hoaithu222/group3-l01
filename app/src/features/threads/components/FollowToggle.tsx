import { Button } from '@/shared/ui/button';

export interface FollowToggleProps {
  following: boolean;
  loading?: boolean;
  onToggle: () => void;
}

/**
 * "Đang theo dõi" ↔ "Theo dõi" (app.md p1-06 §3 `FollowToggle`). Nhãn nói TRẠNG THÁI HIỆN TẠI chứ không nói
 * việc sắp làm, và luôn hiện rõ (§7 "nhãn 'Đang theo dõi' luôn hiển thị rõ"): người dùng được tag KHÔNG bị
 * tự theo dõi luồng, nên phải nhìn ra ngay mình đang ở phía nào. Nhãn trợ năng nói thêm việc chạm sẽ làm gì.
 * Icon đổi (chuông ↔ chuông gạch) để màu/chữ không là tín hiệu duy nhất.
 */
export function FollowToggle({ following, loading = false, onToggle }: FollowToggleProps) {
  return (
    <Button
      accessibilityLabel={
        following
          ? 'Đang theo dõi luồng. Chạm để bỏ theo dõi'
          : 'Theo dõi luồng. Chạm để nhận thông báo'
      }
      iconLeft={following ? 'notification' : 'noti-off'}
      label={following ? 'Đang theo dõi' : 'Theo dõi'}
      loading={loading}
      size="sm"
      variant={following ? 'secondary' : 'primary'}
      onPress={onToggle}
    />
  );
}
