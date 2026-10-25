import { ConfirmSheet } from '@/shared/ui/bottom-sheet';

export interface ClearHistoryConfirmSheetProps {
  visible: boolean;
  /** Đang xoá (`useMyConversationSettings().isPending`) — khoá nút "Huỷ" và nền mờ, nút "Xoá" hiện vòng quay. */
  loading?: boolean;
  onClose: () => void;
  /** Nơi gọi tự `settings.clear()` rồi đóng tấm (và đóng hàng vuốt/menu nếu có) — tấm này không gọi API. */
  onConfirm: () => void;
}

/**
 * Hỏi lại trước khi "Xoá cuộc trò chuyện" ở PHÍA MÌNH (mất khỏi danh sách của mình, người khác vẫn thấy tin) — dùng chung cho màn thông
 * tin hội thoại 1-1 (`DirectInfo`) và hàng danh sách (vuốt/nhấn giữ — `ConversationSwipeActions`), để hai nơi nói ĐÚNG một câu.
 *
 * ⚠️ Trước đây mỗi nơi chép tay cùng một `BottomSheet` thân `{null}` + hai `Button fullWidth` trần trong `flex-row` (nút "Xoá" bị đẩy ra
 * mép tấm, thân rỗng giữ mốc cao 229dp). Giờ là `ConfirmSheet` tông `danger` + ô biểu tượng `delete`.
 */
export function ClearHistoryConfirmSheet({
  visible,
  loading,
  onClose,
  onConfirm,
}: ClearHistoryConfirmSheetProps) {
  return (
    <ConfirmSheet
      confirmLabel="Xoá"
      description="Người khác vẫn thấy tin nhắn — chỉ phía bạn không còn thấy cuộc trò chuyện này."
      icon="delete"
      loading={loading}
      title="Xoá cuộc trò chuyện ở phía bạn?"
      tone="danger"
      visible={visible}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
