import dayjs from 'dayjs';
import { Pressable, Text, View } from 'react-native';

import { useIsUserBlocked } from '@/shared/hooks/useBlockedIds';
import {
  MessageBubbleFooterSlot,
  renderMessageBody,
  useMessageExtensionScope,
} from '@/shared/message-extensions';
import { Avatar } from '@/shared/ui/avatar';
import { hapticTap } from '@/shared/utils/haptics';
import { cn } from '@/shared/utils/style/cn';

import type { ResolveChatAuthor } from '../../api/chat.types';
import { useBlockedRevealStore } from '../../store/blocked-reveal.store';
import { previewText } from '../../utils/preview-text';
import type { BubbleItem } from '../list/buildRows';
import { BlockedMessagePlaceholder } from './BlockedMessagePlaceholder';
import { BubbleContent } from './BubbleContent';
import type { BubbleHandlers } from './bubble-handlers.types';
import { ForwardedLabel } from './ForwardedLabel';
import { PendingBubble } from './PendingBubble';
import { ReactionsRow } from './ReactionsRow';
import { ReplyQuote } from './ReplyQuote';
import { Tombstone } from './Tombstone';
import { ThreadSummary } from '../thread/ThreadSummary';

export interface MessageBubbleProps extends BubbleHandlers {
  item: BubbleItem;
  isOwn: boolean;
  grouped: boolean;
  resolveAuthor?: ResolveChatAuthor;
  /** Vừa nhảy tới (`?m=`/quote/pin/kết quả tìm) — nền tĩnh 2s, KHÔNG nhấp nháy (app.md §3, §7 "reduce motion"). */
  highlighted?: boolean;
}

const A11Y_ACTIONS = [
  { name: 'reply', label: 'Trả lời' },
  { name: 'react', label: 'Thả cảm xúc' },
  { name: 'magicTap', label: 'Thêm' },
];

/** Khung + meta (giờ, "đã chỉnh sửa") của MỘT dòng chat — app.md §3. */
export function MessageBubble({
  item,
  isOwn,
  grouped,
  resolveAuthor,
  highlighted = false,
  onPressReplyQuote,
  onToggleReaction,
  onLongPressReaction,
  onOpenMedia,
  onOpenActions,
  onOpenThread,
  onRetryPending,
  onEditPending,
  onDiscardPending,
}: MessageBubbleProps) {
  // p1-08: tin của người MÌNH đã chặn thu gọn tới khi bấm "Xem". Hook gọi TRƯỚC nhánh `pending` (Rules of Hooks);
  // selector trả boolean nên chỉ đúng bong bóng liên quan vẽ lại khi tập chặn/tập đã-xem đổi.
  const authorBlocked = useIsUserBlocked(item.kind === 'sent' ? item.message.authorId : null);
  const revealed = useBlockedRevealStore((s) => (item.kind === 'sent' ? s.ids.has(item.message.id) : false));
  const revealBlocked = useBlockedRevealStore((s) => s.reveal);
  const extensionScope = useMessageExtensionScope(); // p5-04: khe hàng phụ do feature khác đăng ký (xem `@/shared/message-extensions`)

  if (item.kind === 'pending') {
    return (
      <PendingBubble
        pending={item.pending}
        onDiscard={onDiscardPending}
        onEdit={onEditPending}
        onRetry={onRetryPending}
      />
    );
  }

  const m = item.message;
  if (authorBlocked && !isOwn && !m.deleted && !revealed) {
    return <BlockedMessagePlaceholder onReveal={() => revealBlocked(m.id)} />;
  }
  const author = m.authorId ? resolveAuthor?.(m.authorId) : undefined;
  const timeLabel = dayjs(m.createdAt).format('HH:mm');
  const authorLabel = isOwn ? 'Bạn' : (author?.name ?? 'Thành viên');
  const a11yLabel = `${authorLabel}, ${timeLabel}, ${m.deleted ? 'Tin nhắn đã bị thu hồi' : previewText(m)}`;
  // p7-04: loại tin riêng (khảo sát) do feature khác vẽ thay thân chữ; có thân riêng thì bong bóng dùng nền trung tính (thẻ có màu/tiến độ riêng, không nằm trên nền nút của tin mình).
  const customBody = extensionScope && !m.deleted ? renderMessageBody({ isOwn, message: m, scope: extensionScope }) : null;
  // Bong bóng của mình (nền `action-base`) ⇒ nhãn chuyển tiếp + trích dẫn trả lời cũng phải dùng `action-fg`, không chỉ thân chữ.
  const onActionTone = isOwn && !customBody;

  return (
    <Pressable
      accessibilityActions={A11Y_ACTIONS}
      accessibilityLabel={a11yLabel}
      className={cn(
        'px-md',
        grouped ? 'py-3xs' : 'pt-xs pb-3xs',
        isOwn ? 'items-end' : 'items-start',
        highlighted && 'bg-action-tint',
      )}
      onAccessibilityAction={() => onOpenActions?.(m)}
      // Rung nhẹ khi NHẤN GIỮ mở menu — dấu hiệu "đã giữ đủ lâu" quen thuộc của mọi app nhắn tin. Chỉ là một lời gọi hàm (không
      // hook/state thêm cho mỗi hàng của danh sách ảo).
      onLongPress={() => {
        if (!onOpenActions) return;
        hapticTap();
        onOpenActions(m);
      }}
    >
      {!isOwn && !grouped ? (
        <View className="mb-3xs flex-row items-center gap-2xs">
          <Avatar name={author?.name} size="xs" source={author?.avatarUrl ? { uri: author.avatarUrl } : undefined} />
          <Text className="text-label-xs font-semibold text-fg-2">{author?.name ?? 'Thành viên'}</Text>
        </View>
      ) : null}

      <View className={cn('max-w-[80%] gap-3xs rounded-xs px-sm py-2xs tablet:max-w-[60%]', onActionTone ? 'bg-action-base' : 'bg-bg-2')}>
        {m.forwardedFrom ? (
          <ForwardedLabel forwardedFrom={m.forwardedFrom} resolveAuthor={resolveAuthor} tone={onActionTone ? 'onAction' : 'default'} />
        ) : null}
        {m.replyPreview ? (
          <ReplyQuote
            replyPreview={m.replyPreview}
            resolveAuthor={resolveAuthor}
            tone={onActionTone ? 'onAction' : 'default'}
            onPress={() => (m.replyToId ? onPressReplyQuote?.(m.replyToId) : undefined)}
          />
        ) : null}
        {m.deleted ? (
          <Tombstone tone={onActionTone ? 'onAction' : 'default'} />
        ) : customBody ? (
          customBody
        ) : (
          <BubbleContent
            attachments={m.attachments}
            content={m.content}
            mentions={m.mentions}
            tone={isOwn ? 'onAction' : 'default'}
            onOpenMedia={(i) => onOpenMedia?.(m, i)}
          />
        )}
      </View>

      {extensionScope && !m.deleted ? (
        <MessageBubbleFooterSlot isOwn={isOwn} message={m} scope={extensionScope} />
      ) : null}

      <Text className="mt-3xs text-label-xs text-fg-2">
        {timeLabel}
        {m.editedAt ? ' · đã chỉnh sửa' : ''}
      </Text>

      {!m.deleted && m.reactions.length > 0 ? (
        <ReactionsRow
          className="mt-3xs"
          reactions={m.reactions}
          onLongPress={(emoji) => onLongPressReaction?.(m.id, emoji)}
          onToggle={(emoji) => onToggleReaction?.(m.id, emoji)}
        />
      ) : null}

      {onOpenThread ? <ThreadSummary message={m} resolveAuthor={resolveAuthor} onPress={() => onOpenThread(m)} /> : null}
    </Pressable>
  );
}
