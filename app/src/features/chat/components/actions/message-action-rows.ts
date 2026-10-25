import * as Clipboard from 'expo-clipboard';

import type { ModerationActions } from '@/shared/hooks/useModerationActions';
import type { IconName, IconVariant } from '@/shared/ui/icon';
import { formatDateTime } from '@/shared/utils/format/date.utils';
import { showToast } from '@/shared/utils/toast.utils';

import type { MessageView } from '../../api/chat.types';
import { mentionsToPlainText } from '../../mentions/mention-markup';

/** Một hàng của menu tin nhắn. `hidden` = không đủ quyền/không áp dụng — khai ĐỦ rồi lọc, để kẻ ngăn tính theo hàng THẬT sự hiện. */
export interface MessageActionRow {
  danger?: boolean;
  hidden?: boolean;
  icon: IconName;
  iconVariant?: IconVariant;
  key: string;
  label: string;
  onPress: () => void;
}

type MessageHandler = (message: MessageView) => void;

export interface MessageActionRowsInput {
  /** "Đóng tấm rồi mới chạy" của `MessageActionSheet` — mọi hàng đi qua nó, trừ "Thu hồi" (hộp xác nhận mở TRÊN tấm). */
  act: (fn: () => void) => () => void;
  /** Mở hộp xác nhận thu hồi — thu hồi thật chỉ chạy khi bấm nút trong hộp đó. */
  confirmRecall: () => void;
  isSaved: boolean;
  onEdit: MessageHandler;
  onForward: MessageHandler;
  onHide: MessageHandler;
  onOpenThread?: MessageHandler;
  onPin: MessageHandler;
  onReply: MessageHandler;
  onToggleSave?: MessageHandler;
  onUnpin: MessageHandler;
  reportMessage: ModerationActions['reportMessage'];
}

/**
 * Tin gốc mới có luồng: tin USER, không phải reply (`threadId === null` — BE `MSG_019` cấm luồng lồng). Tin đã thu hồi chỉ mở
 * được khi luồng ĐÃ có (MSG-35); tin thu hồi chưa có luồng thì BE `MSG_006`. Chưa có luồng mà người xem không gửi được (kênh
 * `ADMINS_ONLY`, CH-06) thì không có gì để xem lẫn để trả lời — ẩn hẳn thay vì mở một màn khoá.
 */
function canOpenThread(message: MessageView): boolean {
  if (message.kind !== 'USER' || message.threadId !== null) return false;
  const hasThread = (message.replyCount ?? 0) > 0;
  return hasThread || (!message.deleted && message.myPermissions.canReply);
}

/**
 * Hai nhóm hàng của `MessageActionSheet` theo `myPermissions` (app.md §3), ĐÃ bỏ hàng ẩn — đứng hai bên khe dòng thao tác do feature
 * khác đăng ký (`MessageActionRowsSlot`). Tách khỏi file tấm để file đó giữ dưới trần 200 dòng. Thứ tự: việc thường trước; "Thu hồi"
 * (`danger` — phá huỷ, không hoàn tác: chữ + icon đỏ) LUÔN cuối. "Lưu"/"Bỏ lưu" (p1-09) chỉ khi có `onToggleSave` và tin là tin NGƯỜI
 * DÙNG chưa thu hồi (BE: tin hệ thống → 404, tin thu hồi → `MSG_006`); "Báo cáo" (p1-08) theo `canReport` (BE: tin USER chưa thu hồi,
 * KHÔNG phải của chính mình).
 */
export function buildMessageActionRows(
  message: MessageView,
  input: MessageActionRowsInput,
): { lower: MessageActionRow[]; upper: MessageActionRow[] } {
  const { act } = input;
  const perms = message.myPermissions;
  const pinned = Boolean(message.pinnedAt);
  const saveable = Boolean(input.onToggleSave) && message.kind === 'USER' && !message.deleted;

  const upper: MessageActionRow[] = [
    {
      hidden: !perms.canReply,
      icon: 'arrow-left',
      key: 'reply',
      label: 'Trả lời',
      onPress: act(() => input.onReply(message)),
    },
    {
      hidden: !(input.onOpenThread && canOpenThread(message)),
      icon: 'chat-bubble',
      key: 'thread',
      label: (message.replyCount ?? 0) > 0 ? 'Xem luồng' : 'Trả lời trong luồng',
      onPress: act(() => input.onOpenThread?.(message)),
    },
    {
      hidden: !perms.canForward,
      icon: 'share-02',
      key: 'forward',
      label: 'Chuyển tiếp',
      onPress: act(() => input.onForward(message)),
    },
    {
      icon: 'copy',
      key: 'copy',
      label: 'Sao chép',
      onPress: act(() => {
        void Clipboard.setStringAsync(mentionsToPlainText(message.content ?? '', message.mentions));
        showToast('success', 'Đã sao chép');
      }),
    },
    {
      hidden: !perms.canEdit,
      icon: 'edit',
      key: 'edit',
      label: 'Sửa',
      onPress: act(() => input.onEdit(message)),
    },
    {
      hidden: !saveable,
      icon: 'favorite',
      iconVariant: input.isSaved ? 'twotone' : 'linear',
      key: 'save',
      label: input.isSaved ? 'Bỏ lưu' : 'Lưu',
      onPress: act(() => input.onToggleSave?.(message)),
    },
    {
      hidden: !perms.canPin,
      icon: 'location',
      key: 'pin',
      label: pinned ? 'Bỏ ghim' : 'Ghim',
      onPress: act(() => (pinned ? input.onUnpin(message) : input.onPin(message))),
    },
  ];

  const lower: MessageActionRow[] = [
    { icon: 'hide', key: 'hide', label: 'Ẩn phía tôi', onPress: act(() => input.onHide(message)) },
    {
      icon: 'clock',
      key: 'time',
      label: 'Xem chi tiết giờ',
      onPress: act(() => showToast('info', formatDateTime(message.createdAt))),
    },
    {
      hidden: !perms.canReport,
      icon: 'alert-warning',
      key: 'report',
      label: 'Báo cáo',
      onPress: act(() => input.reportMessage({ id: message.id, authorId: message.authorId })),
    },
    {
      danger: true,
      hidden: !perms.canRecall,
      icon: 'delete',
      key: 'recall',
      label: 'Thu hồi',
      onPress: input.confirmRecall,
    },
  ];

  const shown = (rows: MessageActionRow[]) => rows.filter((row) => !row.hidden);
  return { lower: shown(lower), upper: shown(upper) };
}
