import { ComposerAttachRowsSlot, useMessageExtensionScope } from '@/shared/message-extensions';
import type { ComposerDraftSnapshot } from '@/shared/message-extensions';

export interface ComposerAttachExtrasProps {
  draft: ComposerDraftSnapshot;
  /** Đóng menu "+" (tấm khác do tiện ích mở phải hiện SAU khi menu đã đóng). */
  onDone: () => void;
}

/**
 * Các dòng tiện ích thêm vào menu "+" (khe `attachRows`, p7-04: Khảo sát, Hẹn giờ gửi). Đứng NGOÀI `ChatRoom` (không có phạm vi mở rộng — vd
 * `DraftDirectScreen`, chưa có hội thoại thật) ⇒ không vẽ gì: khảo sát/hẹn giờ cần một phạm vi đã tồn tại ở server.
 */
export function ComposerAttachExtras({ draft, onDone }: ComposerAttachExtrasProps) {
  const scope = useMessageExtensionScope();
  if (!scope) return null;
  return <ComposerAttachRowsSlot draft={draft} scope={scope} onDone={onDone} />;
}
