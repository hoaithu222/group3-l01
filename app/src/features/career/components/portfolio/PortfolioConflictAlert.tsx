import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';

export interface PortfolioConflictAlertProps {
  /** Đang tải lại — khoá nút để không bấm đôi. */
  loading?: boolean;
  onReload: () => void;
  /** Tên thứ vừa bị đổi ở nơi khác ("Hồ sơ" / "Dự án"). */
  subject?: string;
}

/**
 * Banner `RES_003` dùng chung cho form Thông tin, Giao diện và Sửa dự án (app.md p6-07 §3: "409 RES_003 → banner 'Có thay đổi mới, tải lại' giữ form").
 * ⚠️ Nói rõ nội dung đang nhập vẫn CÒN — người dùng sợ nhất là bấm "Tải lại" rồi mất những gì vừa gõ; thực tế nút chỉ lấy `version` mới để lần lưu sau thắng.
 */
export function PortfolioConflictAlert({
  loading = false,
  onReload,
  subject = 'Hồ sơ',
}: PortfolioConflictAlertProps) {
  return (
    <Alert
      actions={
        <Button
          disabled={loading}
          label="Tải lại"
          size="xs"
          variant="secondary"
          onPress={onReload}
        />
      }
      description="Nội dung bạn đang nhập vẫn được giữ. Tải lại để lưu tiếp trên bản mới."
      title={`${subject} vừa được thay đổi ở nơi khác`}
      tone="warning"
    />
  );
}
