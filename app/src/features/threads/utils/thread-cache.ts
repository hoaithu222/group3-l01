import type { MessageMention, ThreadUpdatedEvent } from '@/features/chat';

import type {
  ThreadRootResult,
  ThreadSubscriptionState,
  ThreadSubscriptionUpdatedEvent,
} from '../api';

/** Theo dõi = `AUTO_ON` (tự trả lời) hoặc `EXPLICIT_ON`; `EXPLICIT_OFF` và chưa có lựa chọn (`null`) là KHÔNG theo dõi. */
export function isFollowing(state: ThreadSubscriptionState | null | undefined): boolean {
  return state === 'AUTO_ON' || state === 'EXPLICIT_ON';
}

/**
 * `thread:updated` → cache `byRoot`. Bỏ sự kiện CŨ (socket không đảm bảo thứ tự): so `lastReplySeq` khi tin
 * gốc đã có, chưa có thì so `replyCount` — số phản hồi CHỈ TĂNG (thu hồi reply không giảm, be.md p1-06 §2).
 * Luồng CHƯA có trong cache (`thread: null` — reply đầu tiên vừa tạo nó) thì hàm này không đủ dữ liệu
 * (thiếu `mySubscription`): caller phải `invalidate` để tải lại đủ.
 */
export function applyThreadUpdatedToRoot(
  data: ThreadRootResult | undefined,
  event: ThreadUpdatedEvent,
): ThreadRootResult | undefined {
  if (!data?.thread || data.thread.id !== event.threadId) return data;
  const knownSeq = data.root.lastReplySeq;
  if (
    knownSeq !== undefined
      ? event.lastReplySeq <= knownSeq
      : event.replyCount < data.thread.replyCount
  )
    return data;
  return {
    root: {
      ...data.root,
      replyCount: event.replyCount,
      lastReplyAt: event.lastReplyAt,
      lastReplierIds: event.lastReplierIds,
      lastReplySeq: event.lastReplySeq,
    },
    thread: {
      ...data.thread,
      replyCount: event.replyCount,
      lastReplyAt: event.lastReplyAt,
      lastReplierIds: event.lastReplierIds,
    },
  };
}

/** Ghi trạng thái theo dõi mới vào `thread.mySubscription` — dùng cho cả cập nhật lạc quan lẫn socket. */
export function setMySubscription(
  data: ThreadRootResult | undefined,
  state: ThreadSubscriptionState,
): ThreadRootResult | undefined {
  if (!data?.thread) return data;
  return { ...data, thread: { ...data.thread, mySubscription: state } };
}

/** `thread:subscription-updated` từ MÁY KHÁC của cùng tài khoản — chỉ áp khi đúng luồng đang mở. */
export function applySubscriptionUpdated(
  data: ThreadRootResult | undefined,
  event: ThreadSubscriptionUpdatedEvent,
): ThreadRootResult | undefined {
  if (data?.thread?.id !== event.threadId) return data;
  return setMySubscription(data, event.state);
}

/** Tin gốc được SỬA (`message:updated`) — chỉ áp bản có `version` mới hơn. */
export function applyRootUpdated(
  data: ThreadRootResult | undefined,
  event: {
    id: string;
    content: string | null;
    mentions: MessageMention[];
    editedAt: string;
    version: number;
  },
): ThreadRootResult | undefined {
  if (!data || data.root.id !== event.id || event.version <= data.root.version) return data;
  const { content, mentions, editedAt, version } = event;
  return { ...data, root: { ...data.root, content, mentions, editedAt, version } };
}

/**
 * Tin gốc bị THU HỒI (`message:deleted`) → tombstone TẠI CHỖ; luồng và số phản hồi giữ nguyên
 * (MSG-35 "Tombstone vẫn mở thread, replyCount giữ nguyên").
 */
export function applyRootDeleted(
  data: ThreadRootResult | undefined,
  event: { id: string; deletedAt: string },
): ThreadRootResult | undefined {
  if (!data || data.root.id !== event.id) return data;
  return {
    ...data,
    root: {
      ...data.root,
      deleted: true,
      deletedAt: event.deletedAt,
      content: null,
      attachments: [],
      mentions: [],
      links: [],
      linkPreview: null,
      reactions: [],
    },
  };
}
