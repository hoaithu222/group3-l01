import type { ChatScopeRef, MessagePermissions, MessageView } from '../api/chat.types';
import type { MessageCreatedEvent } from './chat-socket-events.types';
import type { MessagesData } from './message-pages';

/** Fixture dùng chung cho `apply-socket-event*.test.ts` — tách riêng để mỗi file test giữ dưới trần 150 dòng. */
export const SCOPE: ChatScopeRef = { scopeType: 'CHANNEL', scopeId: 'ch-1' };

export const PERMS: MessagePermissions = {
  canEdit: false,
  canRecall: false,
  canPin: true,
  canReact: true,
  canReply: true,
  canForward: true,
  canReport: true,
  canModerate: false,
};

export function makeMessage(overrides: Partial<MessageView>): MessageView {
  return {
    id: 'm-1',
    scopeType: 'CHANNEL',
    scopeId: 'ch-1',
    threadId: null,
    seq: 1,
    kind: 'USER',
    systemType: null,
    systemPayload: null,
    authorId: 'u-1',
    clientMessageId: null,
    content: 'xin chào',
    mentions: [],
    attachments: [],
    links: [],
    linkPreview: null,
    replyToId: null,
    replyPreview: null,
    forwardedFrom: null,
    reactions: [],
    pinnedAt: null,
    pinnedBy: null,
    editedAt: null,
    version: 1,
    createdAt: '2026-09-18T00:00:00.000Z',
    deleted: false,
    deletedAt: null,
    myPermissions: PERMS,
    ...overrides,
  };
}

export function makeData(pages: { data: MessageView[]; hasMoreAfter?: boolean; hasMoreBefore?: boolean }[]): MessagesData {
  return {
    pageParams: pages.map(() => ({ kind: 'latest' as const })),
    pages: pages.map((p) => ({
      data: p.data,
      meta: {
        nextBeforeSeq: null,
        nextAfterSeq: null,
        hasMoreBefore: p.hasMoreBefore ?? false,
        hasMoreAfter: p.hasMoreAfter ?? false,
        limit: 30,
      },
    })),
  };
}

export function makeCreatedEvent(overrides: Partial<MessageCreatedEvent>): MessageCreatedEvent {
  return {
    id: 'm-2',
    scopeType: 'CHANNEL',
    scopeId: 'ch-1',
    threadId: null,
    seq: 2,
    kind: 'USER',
    systemType: null,
    systemPayload: null,
    authorId: 'u-2',
    clientMessageId: null,
    content: 'chào bạn',
    mentions: [],
    attachments: [],
    links: [],
    linkPreview: null,
    replyToId: null,
    replyPreview: null,
    forwardedFrom: null,
    reactions: [],
    pinnedAt: null,
    pinnedBy: null,
    editedAt: null,
    version: 1,
    createdAt: '2026-09-18T00:01:00.000Z',
    ...overrides,
  };
}
