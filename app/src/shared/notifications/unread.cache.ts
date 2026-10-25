import type { InfiniteData } from '@tanstack/react-query';

import type {
  InboxItem,
  InboxPage,
  NotificationCreatedEvent,
  UnreadSummary,
  WorkspaceUnread,
} from '@/core/notifications';

/**
 * Reducer THUẦN vá cache số chưa đọc/hộp thư (p1-07 `app.md` §4.3). Vá chỉ là TỐI ƯU cho độ trễ cảm nhận — nguồn
 * chuẩn vẫn là server: mọi đường đều kèm một lần `invalidate` (debounce) để đối chiếu, nên sai lệch (vd: kênh tắt
 * tiếng không tính vào `unreadChannels`) tự về đúng.
 */

/** Trả NGUYÊN tham chiếu khi không đổi — `setQueryData` không render lại. */
export function bumpActivity(
  summary: UnreadSummary | undefined,
  event: Pick<NotificationCreatedEvent, 'kind'>,
): UnreadSummary | undefined {
  if (!summary) return summary;
  const isMention = event.kind === 'MENTION' || event.kind === 'MENTION_ROLE';
  return {
    ...summary,
    activity: {
      mentions: summary.activity.mentions + (isMention ? 1 : 0),
      unread: summary.activity.unread + 1,
    },
    badgeTotal: summary.badgeTotal + 1,
  };
}

/** `notification:read { ids }`: hạ số mục chưa đọc, không âm. `read` = số mục thực sự chuyển từ chưa đọc → đã đọc. */
export function dropActivity(
  summary: UnreadSummary | undefined,
  read: number,
): UnreadSummary | undefined {
  if (!summary || read <= 0) return summary;
  const drop = Math.min(read, summary.activity.unread);
  return {
    ...summary,
    activity: { ...summary.activity, unread: summary.activity.unread - drop },
    badgeTotal: Math.max(0, summary.badgeTotal - drop),
  };
}

/** Mục (đã tải) còn chưa đọc trong `ids` — để biết hạ bao nhiêu (id không có trong cache thì không đếm được). */
export function countUnreadIn(
  data: InfiniteData<InboxPage> | undefined,
  ids: ReadonlySet<string>,
): number {
  if (!data) return 0;
  let count = 0;
  for (const page of data.pages) {
    for (const item of page.data) if (ids.has(item.id) && item.readAt === null) count += 1;
  }
  return count;
}

/** Đặt `readAt` cho các mục trong `ids`. NGUYÊN tham chiếu nếu không mục nào đổi. */
export function markInboxItemsRead(
  data: InfiniteData<InboxPage> | undefined,
  ids: ReadonlySet<string>,
  readAt: string,
): InfiniteData<InboxPage> | undefined {
  return mapInbox(data, (item) => (ids.has(item.id) && item.readAt === null ? { ...item, readAt } : item));
}

/** "Đánh dấu tất cả": mọi mục đã tải có `createdAt ≤ before` (mục tới SAU `before` vẫn chưa đọc — NT-13). */
export function markInboxBefore(
  data: InfiniteData<InboxPage> | undefined,
  before: string,
  readAt: string,
): InfiniteData<InboxPage> | undefined {
  const limit = new Date(before).getTime();
  return mapInbox(data, (item) =>
    item.readAt === null && new Date(item.createdAt).getTime() <= limit ? { ...item, readAt } : item,
  );
}

function mapInbox(
  data: InfiniteData<InboxPage> | undefined,
  map: (item: InboxItem) => InboxItem,
): InfiniteData<InboxPage> | undefined {
  if (!data) return data;
  let anyChanged = false;
  const pages = data.pages.map((page) => {
    let pageChanged = false;
    const next = page.data.map((item) => {
      const mapped = map(item);
      if (mapped !== item) pageChanged = true;
      return mapped;
    });
    if (pageChanged) anyChanged = true;
    return pageChanged ? { ...page, data: next } : page;
  });
  return anyChanged ? { ...data, pages } : data;
}

/**
 * Đã đọc tới `lastReadSeq` của một KÊNH: tới hết `lastSeq` đã biết → số/chấm về 0 (kể cả nhắc tên); còn tin mới hơn mốc
 * thì giữ số — server sẽ đối chiếu ở lần làm mới sau.
 *
 * `lastReadSeq` của hàng LUÔN được nâng (mốc chỉ tăng) dù số chưa đọc không đổi: `ChannelChatScreen` đọc chính field này
 * làm `knownLastReadSeq` cho `useReadMarker` và làm điểm vẽ đường kẻ "Tin chưa đọc", nên bỏ sót ở đây là lần mở màn sau
 * gửi lại mốc cũ / kẻ sai chỗ.
 */
export function applyChannelRead(
  data: WorkspaceUnread | undefined,
  channelId: string,
  lastReadSeq: number,
): WorkspaceUnread | undefined {
  const channel = data?.channels[channelId];
  if (!data || !channel) return data;
  const mark = Math.max(channel.lastReadSeq, lastReadSeq);
  // Mốc phủ hết `lastSeq` đã biết ⇒ không còn gì chưa đọc ở kênh này.
  const clears = channel.unread > 0 && lastReadSeq >= channel.lastSeq;
  if (!clears && mark === channel.lastReadSeq) return data;
  return {
    ...data,
    channels: {
      ...data.channels,
      [channelId]: clears
        ? { ...channel, capped: false, lastReadSeq: mark, mentions: 0, unread: 0 }
        : { ...channel, lastReadSeq: mark },
    },
  };
}

/**
 * Một tin mới (không phải của mình, không đang xem) vào kênh: +1 chưa đọc, nâng `lastSeq`.
 *
 * `seq` không phải số hữu hạn (payload `channel:activity` cũ thiếu field `seq`) → KHÔNG đụng gì: không có `seq` thì
 * chốt chống cộng trùng vô nghĩa và `lastSeq` sẽ bị ghi thành `undefined`, làm hỏng cả `applyChannelRead` lẫn
 * `knownLastReadSeq`. Số đúng vẫn về sau `refreshSoon('summary')` (invalidate `/me/unread`).
 */
export function applyChannelMessage(
  data: WorkspaceUnread | undefined,
  channelId: string,
  seq: number,
): WorkspaceUnread | undefined {
  const channel = data?.channels[channelId];
  if (!data || !channel || !Number.isFinite(seq) || seq <= channel.lastSeq) return data;
  return {
    ...data,
    channels: { ...data.channels, [channelId]: { ...channel, lastSeq: seq, unread: channel.unread + 1 } },
  };
}

/**
 * Đã đọc một LUỒNG trả lời (`streamId` = `Thread.id` đã chuẩn hoá — `ReadMarkerResult.streamId`): bỏ mục khỏi `threads` (BE chỉ liệt kê
 * luồng còn chưa đọc). Vá LẠC QUAN: mở luồng là cuộn tới reply mới nhất nên mốc đọc thường phủ hết; nếu còn sót thì lần làm mới sau mốc đọc
 * (`SUMMARY_REFRESH_AFTER_READ_MS`) đưa số về đúng — chấm "N mới" của hàng tóm tắt hạ ngay khi người dùng quay lại kênh thay vì trễ vài giây.
 * NGUYÊN tham chiếu nếu luồng không có trong cache.
 */
export function applyThreadRead(
  data: WorkspaceUnread | undefined,
  threadId: string,
): WorkspaceUnread | undefined {
  if (!data || !(threadId in data.threads)) return data;
  return {
    ...data,
    threads: Object.fromEntries(Object.entries(data.threads).filter(([id]) => id !== threadId)),
  };
}
