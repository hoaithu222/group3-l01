import type { ConversationListItem } from '../api/conversations.types';
import type { ConversationListData } from './conversation-list-pages';
import type { ConversationActivityEvent } from './conversation-socket-events.types';

export function makeItem(overrides: Partial<ConversationListItem> = {}): ConversationListItem {
  return {
    id: 'cv-1',
    kind: 'DIRECT',
    status: 'ACTIVE',
    workspaceId: 'ws-1',
    title: null,
    avatarUrl: null,
    peer: { userId: 'u-2', name: 'An', avatarUrl: null, presence: 'ONLINE' },
    memberCount: 2,
    lastMessage: null,
    unreadCount: 0,
    hasMention: false,
    markedUnread: false,
    pinnedAt: null,
    archivedAt: null,
    muted: false,
    notifyMode: 'INHERIT',
    readOnly: false,
    readOnlyReason: null,
    activityAt: '2026-09-18T00:00:00.000Z',
    isMeetingGroup: false,
    ...overrides,
  };
}

export function makeListData(pages: ConversationListItem[][]): ConversationListData {
  return {
    pages: pages.map((data) => ({ data, meta: { nextCursor: null, hasMore: false, limit: 30 } })),
    pageParams: pages.map(() => undefined),
  };
}

export function makeActivityEvent(overrides: Partial<ConversationActivityEvent> = {}): ConversationActivityEvent {
  return {
    v: 1,
    conversationId: 'cv-1',
    workspaceId: 'ws-1',
    seq: 5,
    authorId: 'u-2',
    authorName: 'An',
    createdAt: '2026-09-18T00:05:00.000Z',
    ...overrides,
  };
}
