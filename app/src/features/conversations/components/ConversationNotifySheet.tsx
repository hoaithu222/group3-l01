import {
  NOTIFY_CHOICE_LABEL,
  NotifyModeSheet,
  useInheritedNotifyChoice,
  type NotifyChoice,
} from '@/shared/notifications';

import type { ConversationListItem } from '../api/conversations.types';
import { useMyConversationSettings } from '../hooks/useMyConversationSettings';

type NotifyTarget = Pick<ConversationListItem, 'id' | 'kind' | 'muted' | 'notifyMode' | 'workspaceId'>;

/**
 * Chế độ thông báo ĐANG áp dụng cho hội thoại. `muted` là cờ TỔNG HỢP của server (hết hạn `mutedUntil` → `false` dù
 * `notifyMode` còn `MUTED`) — tin `muted` chứ không tin `notifyMode` khi hai giá trị lệch nhau.
 */
export function currentNotifyChoice(target: Pick<NotifyTarget, 'muted' | 'notifyMode'>): NotifyChoice {
  if (target.muted) return 'MUTED';
  return target.notifyMode === 'MUTED' ? 'INHERIT' : target.notifyMode;
}

/** Nhãn ngắn của chế độ hiện tại — hiện ở dòng "Thông báo" trong thông tin hội thoại. */
export function currentNotifyLabel(target: Pick<NotifyTarget, 'muted' | 'notifyMode'>): string {
  return NOTIFY_CHOICE_LABEL[currentNotifyChoice(target)];
}

export interface ConversationNotifySheetProps {
  conversation: NotifyTarget;
  onClose: () => void;
  visible: boolean;
}

/**
 * Chọn chế độ thông báo của MỘT hội thoại (p1-07 `app.md` §3 `NotifyModeSheet`, dùng chung với nhóm làm việc/kênh):
 * Mọi tin · Chỉ nhắc tên · Tắt tiếng (1 giờ / 8 giờ / 24 giờ / tới khi bật lại) · Theo mặc định (giá trị kế thừa thực tế).
 * Tin 1-1 không có "Chỉ nhắc tên".
 */
export function ConversationNotifySheet({ conversation, onClose, visible }: ConversationNotifySheetProps) {
  const settings = useMyConversationSettings(conversation.id);
  const inherited = useInheritedNotifyChoice(conversation.kind, conversation.workspaceId);

  return (
    <NotifyModeSheet
      current={currentNotifyChoice(conversation)}
      inherited={inherited}
      showMentions={conversation.kind === 'GROUP'}
      supportsDuration
      title="Thông báo"
      visible={visible}
      onClose={onClose}
      onSelect={settings.setNotify}
    />
  );
}
