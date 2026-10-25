import { ConfirmWithReasonModal } from '@/shared/ui';

export interface ReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Mô tả tác động của thao tác (vd "Buổi sẽ ẩn khỏi app, học viên không xem được"). */
  impact: React.ReactNode;
  confirmLabel?: string;
  confirmTone?: 'danger' | 'primary';
  onConfirm: (reason: string) => Promise<void> | void;
}

/**
 * Hộp thoại lý do (10–500 ký tự) cho các thao tác nhạy cảm của Lộ trình học — gỡ xuất bản/lưu trữ/xoá
 * môn·tháng·buổi (be.md §4 `reasonSchema`, README §7). Mirror `ConfirmWithReasonModal` (kit2 dùng chung
 * toàn app, xem `features/moderation` — `StudySetHideActions` là mẫu) thay vì tự viết lại modal + form;
 * tồn tại như component riêng của `roadmap` chỉ để khớp file tree admin.md §3 và cho call-site đọc rõ ý
 * định ("ReasonDialog của lộ trình") thay vì import thẳng tên chung chung ở mọi nơi.
 */
export default function ReasonDialog({
  open,
  onOpenChange,
  title,
  impact,
  confirmLabel,
  confirmTone,
  onConfirm,
}: ReasonDialogProps) {
  return (
    <ConfirmWithReasonModal
      confirmLabel={confirmLabel}
      confirmTone={confirmTone}
      impact={impact}
      open={open}
      title={title}
      onConfirm={onConfirm}
      onOpenChange={onOpenChange}
    />
  );
}
