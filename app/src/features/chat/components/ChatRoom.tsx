import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';

import { ChatRoomHostSlot, ComposerTopSlot, MessageExtensionScopeContext, type MessageExtensionFacts } from '@/shared/message-extensions';
import { EmptyState } from '@/shared/ui/empty-state';

import type { ChatScopeRef, ForwardTargetOption, MessageView, ResolveChatAuthor } from '../api/chat.types';
import { MentionRenderContext } from '../mentions/mention-render.context';
import { EmojiPickerSheet } from './actions/EmojiPickerSheet';
import { MessageActionSheet } from './actions/MessageActionSheet';
import { WhoReactedSheet } from './actions/WhoReactedSheet';
import type { ComposerCapabilities } from './composer/Composer';
import { Composer } from './composer/Composer';
import { ChatRoomLoadError } from './ChatRoomLoadError';
import { ForwardSheet } from './forward/ForwardSheet';
import { MessageList, MessageListSkeleton } from './list/MessageList';
import { NewMessagesPill } from './list/NewMessagesPill';
import { TypingRow } from './list/TypingRow';
import { PinnedBar } from './pinned/PinnedBar';
import type { ChatReadOptions } from '../hooks/useChatReadMarker';
import { useChatRoomState } from './useChatRoomState';

export interface ChatRoomProps {
  scope: ChatScopeRef;
  /** Chỉ dựng khi ChatRoom KHÔNG nằm trong `Screen` đã có header riêng — màn kênh (p1-03) đặt `header` qua `Screen`, không truyền prop này (tránh hai header chồng nhau). */
  header?: ReactNode;
  capabilities: ComposerCapabilities;
  /** Chữ rỗng do MÀN CHA quyết — `chat` không tự bịa tin giả (app.md §3). */
  emptyHint: string;
  resolveAuthor?: ResolveChatAuthor;
  searchForwardTargets?: (query: string) => Promise<ForwardTargetOption[]>;
  /** `?m=` — mở quanh tin này thay vì tin mới nhất. */
  initialMessageId?: string;
  /**
   * Mở màn luồng của một tin gốc (p1-06). CHỈ có nghĩa ở kênh, luồng chính — truyền vào cũng bị bỏ qua ở
   * hội thoại (BE `MSG_018`) và bên trong màn luồng (BE `MSG_019` cấm luồng lồng). `chat` không biết route
   * của kênh (cần `wsId` mà scope không có), nên màn cha nối điều hướng — không truyền thì không có luồng
   * nào: cả hàng tóm tắt lẫn mục "Trả lời trong luồng" cùng ẩn.
   */
  onOpenThread?: (message: MessageView) => void;
  /** Chạm chip nhắc tên → màn cha mở thẻ người dùng nếu có cơ chế đó; không truyền thì chip không bấm được. */
  onPressMention?: (userId: string) => void;
  /** p1-07: mốc đã đọc màn cha biết lúc mở (vd `detail.lastReadSeq`) — không gửi lại tin cũ hơn nó. */
  knownLastReadSeq?: ChatReadOptions['knownLastReadSeq'];
  /** p1-07: sau khi server nhận mốc đọc — màn cha vá cache của mình (danh sách hội thoại, chi tiết…). */
  onMarkedRead?: ChatReadOptions['onMarked'];
  /**
   * p5-04: dữ kiện ĐẶC THÙ KÊNH cho khe mở rộng tin nhắn (`@/shared/message-extensions`, vd "Yêu cầu xác nhận đã đọc" chỉ có ở
   * kênh `ADMINS_ONLY` với người quản lý) — màn cha nạp, `chat` không tự suy. Không truyền ⇒ các khe coi như không áp dụng.
   */
  extension?: MessageExtensionFacts;
  /** Dải phụ của MÀN CHA giữa danh sách và ô soạn (vd "Đã xem"). ⛔ Đừng xếp dưới `<ChatRoom>`: ô soạn nâng theo bàn phím bằng `transform` nên dải đó ở lại chỗ cũ, thành khoảng trống (≈ chiều cao dải, ~20dp với "Đã xem") giữa ô soạn và bàn phím. */
  belowList?: ReactNode;
  /** Truyền ⇒ hiện thanh tin đã ghim ở đầu phòng (`PinnedBar`); chạm "N ghim" gọi nó — `chat` không biết route danh sách. Không truyền ⇒ không có thanh (luồng, khung chat phòng họp). */
  onOpenPinned?: () => void;
}

/**
 * Ghép List + Composer + banner — feature NỀN dùng chung cho kênh (p1-03),
 * hội thoại (p1-05), luồng (p1-06). KHÔNG nhận dữ liệu đặc thù scope (tên
 * kênh, quyền quản trị…) — chỉ `scope`/`capabilities`/`resolveAuthor` chung.
 */
export function ChatRoom({
  scope,
  header,
  capabilities,
  emptyHint,
  resolveAuthor,
  searchForwardTargets,
  initialMessageId,
  onOpenThread,
  onPressMention,
  knownLastReadSeq,
  onMarkedRead,
  extension,
  belowList,
  onOpenPinned,
}: ChatRoomProps) {
  const {
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
    draftRestoreNonce,
    onVisibleMaxSeq,
  } = useChatRoomState(scope, initialMessageId, { knownLastReadSeq, onMarked: onMarkedRead });

  const openThread = scope.scopeType === 'CHANNEL' && scope.threadId === undefined ? onOpenThread : undefined;
  const mentionContext = useMemo(
    () => ({ resolveName: (userId: string) => resolveAuthor?.(userId)?.name, currentUserId, onPressMention }),
    [resolveAuthor, currentUserId, onPressMention],
  );

  // Cấp cho `MessageBubble`/`MessageActionSheet` qua context (không chuyền prop xuyên `MessageList`).
  const { canManage, postingPolicy, workspaceId } = extension ?? {};
  const extensionScope = useMemo(
    () => ({ ...scope, canManage, postingPolicy, workspaceId }),
    [scope, canManage, postingPolicy, workspaceId],
  );

  return (
    <MentionRenderContext.Provider value={mentionContext}>
      <MessageExtensionScopeContext.Provider value={extensionScope}>
        <View className="flex-1">
          {header}
          {onOpenPinned ? <PinnedBar resolveAuthor={resolveAuthor} scope={scope} onJump={jumpTo} onOpenList={onOpenPinned} /> : null}

          {query.isLoading ? (
            <MessageListSkeleton />
          ) : query.isError ? (
            <ChatRoomLoadError error={query.error} onRetry={() => void query.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState description={emptyHint} fullscreen icon="chat-bubble" />
          ) : (
            <View className="flex-1">
              <MessageList
                currentUserId={currentUserId}
                hasMoreAfter={query.hasNextPage}
                hasMoreBefore={query.hasPreviousPage}
                highlightMessageId={highlightId}
                isFetchBeforeError={query.isFetchPreviousPageError}
                isFetchingAfter={query.isFetchingNextPage}
                isFetchingBefore={query.isFetchingPreviousPage}
                listRef={scrollAnchor.listRef}
                resolveAuthor={resolveAuthor}
                rows={rows}
                onLoadAfter={() => void query.fetchNextPage()}
                onLoadBefore={() => void query.fetchPreviousPage()}
                onScroll={scrollAnchor.onScroll}
                onVisibleMaxSeq={onVisibleMaxSeq}
                {...handlers}
                onOpenThread={openThread}
              />
              <NewMessagesPill className="absolute bottom-2 self-center" count={scrollAnchor.newCount} onPress={scrollAnchor.scrollToBottom} />
              <TypingRow resolveAuthor={resolveAuthor} scope={scope} />
            </View>
          )}

          {belowList}
          <ComposerTopSlot scope={extensionScope} />
          <Composer
            capabilities={capabilities}
            draftRestoreNonce={draftRestoreNonce}
            findMessage={findMessage}
            resolveAuthor={resolveAuthor}
            scope={scope}
          />

          <MessageActionSheet
            {...actions}
            isSaved={isActionMessageSaved}
            message={actionMessage}
            visible={actionMessage !== undefined}
            onClose={() => setActionMessage(undefined)}
            onOpenThread={openThread}
          />
          <EmojiPickerSheet
            message={emojiPickerMessage}
            visible={emojiPickerMessage !== undefined}
            onClose={() => setEmojiPickerMessage(undefined)}
            onSelect={actions.onToggleReaction}
          />
          <ForwardSheet
            message={forwardMessage}
            searchTargets={searchForwardTargets}
            visible={forwardMessage !== undefined}
            onClose={() => setForwardMessage(undefined)}
          />
          <WhoReactedSheet
            emoji={whoReacted?.emoji}
            listReactors={(emoji, cursor) => listReactors(whoReacted?.messageId ?? '', emoji, cursor)}
            resolveAuthor={resolveAuthor}
            visible={whoReacted !== undefined}
            onClose={() => setWhoReacted(undefined)}
          />
          <ChatRoomHostSlot scope={extensionScope} />
        </View>
      </MessageExtensionScopeContext.Provider>
    </MentionRenderContext.Provider>
  );
}
