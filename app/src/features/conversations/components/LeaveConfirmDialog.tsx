import { ConfirmSheet } from '@/shared/ui/bottom-sheet';

export interface LeaveConfirmDialogProps {
  visible: boolean;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * app.md §7 — "hậu quả bằng lời thường", không dùng "Kick/Ban". OWNER cần chuyển quyền TRƯỚC (ConversationInfoScreen tự mở TransferOwnerSheet, không dùng sheet này).
 *
 * ✅ `ConfirmSheet` (ô biểu tượng + tiêu đề + mô tả canh giữa, [Huỷ | Rời nhóm]) thay cho `BottomSheet` thân `{null}` + hai `Button fullWidth`
 * trần trong `flex-row`: hai khối `width: 100%` không co nên nút "Rời nhóm" bị đẩy ra ngoài mép tấm, và thân rỗng vẫn giữ mốc cao 229dp.
 * Đang rời (`loading`) thì "Huỷ" và nền mờ bị khoá — huỷ giữa lúc yêu cầu đang bay là đóng tấm mà việc vẫn xảy ra.
 */
export function LeaveConfirmDialog({
  visible,
  loading,
  onClose,
  onConfirm,
}: LeaveConfirmDialogProps) {
  return (
    <ConfirmSheet
      confirmLabel="Rời nhóm"
      description="Bạn sẽ không thấy tin nhắn mới của nhóm này nữa. Lịch sử cũ vẫn còn nếu quay lại được mời."
      icon="logout"
      loading={loading}
      title="Rời nhóm này?"
      tone="danger"
      visible={visible}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
