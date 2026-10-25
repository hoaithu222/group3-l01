import type { MessageView } from '../../api/chat.types';

/**
 * Callback dùng chung cho MỘT bong bóng — gộp lại để `MessageList`/`ChatRoom`
 * chỉ cần truyền QUA (`{...handlers}`) thay vì tám prop rời từng cấp.
 */
export interface BubbleHandlers {
  onPressReplyQuote?: (replyToId: string) => void;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  onLongPressReaction?: (messageId: string, emoji: string) => void;
  onOpenMedia?: (message: MessageView, index: number) => void;
  /** Nhấn giữ HOẶC accessibility action (Trả lời/Thả cảm xúc/Thêm) — mở `MessageActionSheet`. */
  onOpenActions?: (message: MessageView) => void;
  /**
   * Chạm hàng tóm tắt luồng dưới tin gốc → mở màn luồng. VẮNG MẶT = phạm vi này không có luồng
   * (hội thoại — BE `MSG_018`) hoặc màn cha chưa nối route: cả hàng tóm tắt lẫn mục
   * "Trả lời trong luồng" cùng biến mất, không có nút chết.
   */
  onOpenThread?: (message: MessageView) => void;
  onRetryPending?: (clientMessageId: string) => void;
  onEditPending?: (clientMessageId: string) => void;
  onDiscardPending?: (clientMessageId: string) => void;
}
