import { useCallback, useMemo, useState } from 'react';
import { router } from 'expo-router';

import { scopeKeyOf } from '@/core/socket';
import { useIsSavedMessage, useSaveActions } from '@/shared/saved';
import { showToast } from '@/shared/utils/toast.utils';
import { useAuthStore } from '@/shell/store/slices/auth';

import type { ChatScopeRef, MessageView } from '../api/chat.types';
import { useChatReadMarker, type ChatReadOptions } from '../hooks/useChatReadMarker';
import { useChatRoomSocket } from '../hooks/useChatRoomSocket';
import { useMessageActions } from '../hooks/useMessageActions';
import type { MessagesAnchor } from '../hooks/useMessages';
import { useMessages } from '../hooks/useMessages';
import { useReactions } from '../hooks/useReactions';
import { useComposerRestore } from '../hooks/useComposerRestore';
import { useScrollAnchor } from '../hooks/useScrollAnchor';
import { useSendMessage } from '../hooks/useSendMessage';
import { useComposerStore } from '../store/composer.store';
import { useOutboxStore } from '../store/outbox.store';
import { buildRows, type ChatRow } from './list/buildRows';
import { useJumpToMessage } from './useJumpToMessage';

/** Tham chiếu ỔN ĐỊNH cho scope chưa có bản tạm nào — `?? []` tại chỗ dùng tạo mảng MỚI mỗi render, phá `useMemo` bên dưới. */
const NO_PENDING: never[] = [];

/** Gộp mọi hook/handler của `ChatRoom` — tách khỏi JSX để cả hai file giữ dưới trần dòng. */
export function useChatRoomState(
  scope: ChatScopeRef,
  initialMessageId: string | undefined,
  read?: ChatReadOptions,
) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const scopeKey = scopeKeyOf(scope.scopeType, scope.scopeId, scope.threadId);
  const scrollAnchor = useScrollAnchor<ChatRow>();
  const [actionMessage, setActionMessage] = useState<MessageView>();
  const [forwardMessage, setForwardMessage] = useState<MessageView>();
  const [whoReacted, setWhoReacted] = useState<{ messageId: string; emoji: string }>();
  /** Tin đang chọn cảm xúc NGOÀI bộ nhanh (`EmojiPickerSheet`). */
  const [emojiPickerMessage, setEmojiPickerMessage] = useState<MessageView>();

  const initialAnchor: MessagesAnchor = initialMessageId ? { mode: 'around', messageId: initialMessageId } : { mode: 'latest' };
  const query = useMessages(scope, initialAnchor);
  useChatRoomSocket(scope, { onMessageInserted: scrollAnchor.notifyAppended });
  const { onVisibleMaxSeq } = useChatReadMarker(scope, read);
  const [openedLastReadSeq] = useState(read?.knownLastReadSeq); // đóng băng lúc MỞ màn: "Tin chưa đọc" không dịch khi đọc tiếp
  const unreadDividerBeforeSeq = openedLastReadSeq === undefined ? undefined : openedLastReadSeq + 1;

  const { retry: retryPending, discard: discardPending } = useSendMessage(scope);
  const { editMessage, recallMessage, hideMessage, pinMessage, unpinMessage } = useMessageActions(scope);
  const { toggleReaction, listReactors } = useReactions(scope);
  const { editPending, draftRestoreNonce } = useComposerRestore(scope);
  const setComposerTarget = useComposerStore((s) => s.setTarget);
  const pending = useOutboxStore((s) => s.byScope[scopeKey] ?? NO_PENDING);

  const rows = useMemo(
    () => buildRows({ messages: query.messages, pending: query.anchor.mode === 'latest' ? pending : [], currentUserId, unreadDividerBeforeSeq }),
    [query.messages, pending, currentUserId, query.anchor.mode, unreadDividerBeforeSeq],
  );
  const findMessage = useCallback((id: string) => query.messages.find((m) => m.id === id), [query.messages]);

  // Nhảy tới tin (thanh ghim, trích dẫn, `?m=`): cả nhánh tin CHƯA tải (mở lô `around` rồi mới cuộn) nằm trong hook này.
  const { highlightId, jumpTo } = useJumpToMessage({ rows, listRef: scrollAnchor.listRef, reanchor: query.jumpTo, initialMessageId });

  // p1-09: `MessageView` chưa có `isSaved` — nhãn "Lưu"/"Bỏ lưu" theo tập cờ `@/shared/saved` (không import `discovery`).
  const isActionMessageSaved = useIsSavedMessage(actionMessage?.id);
  const { toggle: toggleSave } = useSaveActions();

  const handlers = {
    onPressReplyQuote: jumpTo,
    onToggleReaction: (messageId: string, emoji: string) => {
      const mine = findMessage(messageId)?.reactions.find((r) => r.emoji === emoji)?.me ?? false;
      void toggleReaction(messageId, emoji, mine);
    },
    onLongPressReaction: (messageId: string, emoji: string) => setWhoReacted({ messageId, emoji }),
    onOpenActions: (message: MessageView) => setActionMessage(message),
    onOpenMedia: (message: MessageView, index: number) =>
      router.push({ params: { index: String(index), messageId: message.id }, pathname: '/media-viewer' }),
    onRetryPending: retryPending,
    onEditPending: editPending,
    onDiscardPending: discardPending,
  };

  const actions = {
    onReply: (m: MessageView) => setComposerTarget(scopeKey, { type: 'reply', messageId: m.id }),
    onForward: (m: MessageView) => setForwardMessage(m),
    onEdit: (m: MessageView) =>
      setComposerTarget(scopeKey, { type: 'edit', messageId: m.id, content: m.content ?? '', mentions: m.mentions, expectedVersion: m.version }),
    onMoreReactions: (m: MessageView) => setEmojiPickerMessage(m),
    onRecall: (m: MessageView) => void recallMessage(m.id),
    onHide: (m: MessageView) => void hideMessage(m.id),
    onPin: (m: MessageView) =>
      void pinMessage(m.id).then((result) => {
        if (result === 'LIMIT') showToast('error', 'Đã đạt số tin ghim tối đa, hãy bỏ ghim một tin cũ trước.');
      }),
    onUnpin: (m: MessageView) => void unpinMessage(m.id),
    onToggleSave: (m: MessageView) => void toggleSave(m.id),
    onToggleReaction: (m: MessageView, emoji: string) => {
      const mine = m.reactions.find((r) => r.emoji === emoji)?.me ?? false;
      void toggleReaction(m.id, emoji, mine);
    },
  };

  return {
    query,
    rows,
    currentUserId,
    scrollAnchor,
    highlightId,
    findMessage,
    jumpTo,
    handlers,
    actionMessage,
    isActionMessageSaved,
    setActionMessage,
    actions,
    forwardMessage,
    setForwardMessage,
    whoReacted,
    setWhoReacted,
    emojiPickerMessage,
    setEmojiPickerMessage,
    listReactors,
    editMessage,
    draftRestoreNonce,
    onVisibleMaxSeq,
  };
}
