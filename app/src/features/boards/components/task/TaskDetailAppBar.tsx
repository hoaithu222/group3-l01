import { Button } from '@/shared/ui/button';
import { AppBar } from '@/shared/ui/navigation';

export interface TaskDetailAppBarProps {
  /** Đã có dữ liệu thẻ chưa — chưa có (đang tải/404) thì chưa có gì để mở trong menu "…". */
  hasTask: boolean;
  onBack: () => void;
  onOpenMenu: () => void;
}

/**
 * Thanh tiêu đề màn chi tiết thẻ. Menu "…" của thẻ (Giao cho tôi · Sao chép link · Xoá) ở khe phải — chỗ quen thuộc của
 * menu tràn — thay cho một nút icon lẻ nằm dưới tiêu đề thẻ.
 */
export function TaskDetailAppBar({ hasTask, onBack, onOpenMenu }: TaskDetailAppBarProps) {
  return (
    <AppBar
      actions={
        hasTask ? (
          <Button
            accessibilityLabel="Tuỳ chọn thẻ"
            iconLeft="more"
            iconOnly
            size="sm"
            variant="tertiary"
            onPress={onOpenMenu}
          />
        ) : undefined
      }
      title="Chi tiết thẻ"
      onBack={onBack}
    />
  );
}
