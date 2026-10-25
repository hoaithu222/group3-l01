import type { InfiniteData } from '@tanstack/react-query';

import type { InboxItem, InboxPage, UnreadSummary, WorkspaceUnread } from '@/core/notifications';

import {
  applyChannelMessage,
  applyChannelRead,
  applyThreadRead,
  bumpActivity,
  countUnreadIn,
  dropActivity,
  markInboxBefore,
  markInboxItemsRead,
} from '../unread.cache';

function item(id: string, createdAt: string, readAt: string | null = null): InboxItem {
  return {
    actorId: null,
    createdAt,
    id,
    kind: 'MENTION',
    muted: false,
    readAt,
    refs: null,
    scopeId: null,
    scopeType: 'CHANNEL',
    type: 'mention',
    unavailable: false,
    workspaceId: null,
  };
}

function inbox(...pages: InboxItem[][]): InfiniteData<InboxPage> {
  return {
    pageParams: pages.map(() => undefined),
    pages: pages.map((data) => ({ data, meta: { hasMore: false, limit: 30, nextCursor: null } })),
  };
}

const SUMMARY: UnreadSummary = {
  activity: { mentions: 1, unread: 3 },
  badgeTotal: 5,
  computedAt: '2026-09-21T00:00:00.000Z',
  conversations: { mentions: 0, unreadConversations: 2, unreadMessages: 7 },
  workspaces: [],
};

describe('tóm tắt chưa đọc', () => {
  it('bumpActivity: +1 mục và +1 huy hiệu; nhắc tên tăng thêm mentions; chưa có dữ liệu thì để nguyên', () => {
    expect(bumpActivity(undefined, { kind: 'MENTION' })).toBeUndefined();
    expect(bumpActivity(SUMMARY, { kind: 'THREAD_REPLY' })).toMatchObject({
      activity: { mentions: 1, unread: 4 },
      badgeTotal: 6,
    });
    expect(bumpActivity(SUMMARY, { kind: 'MENTION' })?.activity).toEqual({ mentions: 2, unread: 4 });
  });

  it('dropActivity: hạ theo số mục thực sự chuyển đọc, KHÔNG xuống dưới 0, 0 mục thì giữ tham chiếu', () => {
    expect(dropActivity(SUMMARY, 0)).toBe(SUMMARY);
    expect(dropActivity(SUMMARY, 2)).toMatchObject({ activity: { unread: 1 }, badgeTotal: 3 });
    expect(dropActivity(SUMMARY, 99)).toMatchObject({ activity: { unread: 0 }, badgeTotal: 2 });
  });
});

describe('hộp thư', () => {
  const data = inbox(
    [item('a', '2026-09-21T10:00:00.000Z'), item('b', '2026-09-21T09:00:00.000Z', '2026-09-21T09:30:00.000Z')],
    [item('c', '2026-09-21T08:00:00.000Z')],
  );

  it('countUnreadIn chỉ đếm mục CHƯA đọc trong ids', () => {
    expect(countUnreadIn(data, new Set(['a', 'b', 'zzz']))).toBe(1);
    expect(countUnreadIn(undefined, new Set(['a']))).toBe(0);
  });

  it('markInboxItemsRead đặt readAt đúng mục, giữ nguyên mục đã đọc và tham chiếu khi không đổi', () => {
    const next = markInboxItemsRead(data, new Set(['a', 'b']), 'NOW');
    expect(next?.pages[0]?.data.map((i) => i.readAt)).toEqual(['NOW', '2026-09-21T09:30:00.000Z']);
    expect(next?.pages[1]).toBe(data.pages[1]); // trang không đổi giữ tham chiếu
    expect(markInboxItemsRead(data, new Set(['zzz']), 'NOW')).toBe(data);
  });

  it('markInboxBefore: mục tới SAU `before` vẫn chưa đọc (NT-13)', () => {
    const next = markInboxBefore(data, '2026-09-21T08:30:00.000Z', 'NOW');
    const flat = next?.pages.flatMap((p) => p.data) ?? [];
    expect(flat.find((i) => i.id === 'a')?.readAt).toBeNull(); // 10:00 > 08:30
    expect(flat.find((i) => i.id === 'c')?.readAt).toBe('NOW'); // 08:00 ≤ 08:30
  });
});

describe('số chưa đọc theo kênh', () => {
  const data: WorkspaceUnread = {
    channels: {
      c1: { capped: true, lastReadSeq: 10, lastSeq: 20, mentions: 2, unread: 100 },
      c2: { capped: false, lastReadSeq: 5, lastSeq: 5, mentions: 0, unread: 0 },
    },
    threads: {},
  };

  it('applyChannelRead: đọc tới hết lastSeq → về 0 (kể cả "100+"); còn tin mới hơn mốc thì chỉ nâng lastReadSeq', () => {
    expect(applyChannelRead(data, 'c1', 20)?.channels.c1).toEqual({ capped: false, lastReadSeq: 20, lastSeq: 20, mentions: 0, unread: 0 });
    // Mốc tiến nhưng chưa phủ hết `lastSeq`: giữ số chưa đọc, vẫn ghi mốc mới (nguồn của `knownLastReadSeq` + đường kẻ "Tin chưa đọc").
    expect(applyChannelRead(data, 'c1', 15)?.channels.c1).toEqual({ capped: true, lastReadSeq: 15, lastSeq: 20, mentions: 2, unread: 100 });
    expect(applyChannelRead(data, 'c1', 10)).toBe(data); // mốc không tiến
    expect(applyChannelRead(data, 'khong-co', 99)).toBe(data);
    expect(applyChannelRead(data, 'c2', 5)).toBe(data); // đã 0 và mốc không tiến
  });

  it('applyChannelMessage: +1 và nâng lastSeq; seq cũ/thiếu seq/kênh chưa có trong cache thì bỏ qua', () => {
    expect(applyChannelMessage(data, 'c2', 6)?.channels.c2).toMatchObject({ lastSeq: 6, unread: 1 });
    expect(applyChannelMessage(data, 'c2', 5)).toBe(data);
    expect(applyChannelMessage(data, 'khong-co', 9)).toBe(data);
    // Payload `channel:activity` cũ không có `seq` → KHÔNG được ghi `lastSeq: undefined` vào cache.
    expect(applyChannelMessage(data, 'c2', undefined as unknown as number)).toBe(data);
  });
});

describe('số chưa đọc theo luồng (chấm "N mới" ở ThreadSummaryRow)', () => {
  const data: WorkspaceUnread = {
    channels: { c1: { capped: false, lastReadSeq: 7, lastSeq: 9, mentions: 0, unread: 2 } },
    threads: {
      t1: { channelId: 'c1', lastReadSeq: 1, lastSeq: 4, unread: 3 },
      t2: { channelId: 'c1', lastReadSeq: 0, lastSeq: 100, unread: 100 },
    },
  };

  it('applyThreadRead bỏ ĐÚNG luồng đã đọc (BE chỉ liệt kê luồng còn chưa đọc), luồng khác và số theo kênh giữ nguyên', () => {
    const next = applyThreadRead(data, 't1');

    expect(next?.threads).toEqual({ t2: { channelId: 'c1', lastReadSeq: 0, lastSeq: 100, unread: 100 } });
    expect(next?.channels).toBe(data.channels);
  });

  it('luồng không có trong cache / chưa có dữ liệu → trả NGUYÊN tham chiếu (không vẽ lại thừa)', () => {
    expect(applyThreadRead(data, 'khong-co')).toBe(data);
    expect(applyThreadRead(undefined, 't1')).toBeUndefined();
  });
});
