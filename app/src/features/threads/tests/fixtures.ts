import type { MessageView } from '@/features/chat';

import type { ThreadRootResult, ThreadView } from '../api';

/** Tin gốc tối thiểu cho test `threads` — dựng lại thay vì import fixture nội bộ của `chat` (không đào sâu vào feature khác). */
export function makeRootMessage(overrides: Partial<MessageView> = {}): MessageView {
  return {
    id: 'root-1',
    scopeType: 'CHANNEL',
    scopeId: 'ch-1',
    threadId: null,
    seq: 1,
    kind: 'USER',
    systemType: null,
    systemPayload: null,
    authorId: 'u-1',
    clientMessageId: null,
    content: 'Tin gốc cần bàn',
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
    createdAt: '2026-09-19T00:00:00.000Z',
    deleted: false,
    deletedAt: null,
    myPermissions: {
      canEdit: false,
      canRecall: false,
      canPin: false,
      canReact: true,
      canReply: true,
      canForward: true,
      canReport: true,
      canModerate: false,
    },
    ...overrides,
  };
}

export function makeThread(overrides: Partial<ThreadView> = {}): ThreadView {
  return {
    id: 't-1',
    channelId: 'ch-1',
    parentMessageId: 'root-1',
    replyCount: 2,
    lastReplyAt: '2026-09-19T01:00:00.000Z',
    lastReplierIds: ['u1'],
    mySubscription: 'AUTO_ON',
    myLastReadSeq: null,
    unreadReplies: 0,
    ...overrides,
  };
}

export function makeRootResult(overrides: Partial<ThreadRootResult> = {}): ThreadRootResult {
  return { root: makeRootMessage({ replyCount: 2 }), thread: makeThread(), ...overrides };
}
