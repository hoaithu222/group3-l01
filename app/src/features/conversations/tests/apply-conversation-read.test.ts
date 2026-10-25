import { QueryClient } from '@tanstack/react-query';

import { conversationKeys } from '../api/conversations.keys';
import type { ConversationDetail, ConversationListItem } from '../api/conversations.types';
import {
  applyConversationRead,
  applyConversationReadInList,
  applyReadAllInList,
  patchConversationRead,
} from '../cache/apply-conversation-read';
import { makeItem, makeListData } from '../cache/apply-conversation-event.fixtures';
import type { ConversationListData } from '../cache/conversation-list-pages';

/**
 * p1-07 `app.md` §4.2–§4.3: hạ chấm/số chưa đọc của hội thoại theo mốc đọc — từ máy này (`POST /read-markers`, chỉ có
 * `lastReadSeq`) hoặc máy khác (`read:updated`, có `unreadCount`/`mentionCount` chuẩn). NT-11, NT-13.
 */

const lastMessage = (seq: number): ConversationListItem['lastMessage'] => ({
  attachmentKind: null,
  authorId: 'u-2',
  authorName: 'An',
  createdAt: '2026-09-18T00:05:00.000Z',
  deleted: false,
  id: 'm',
  kind: 'USER',
  preview: 'hi',
  seq,
  systemType: null,
});

describe('applyConversationRead', () => {
  it('mốc tới hết tin cuối đã biết → về 0, bỏ nhắc tên và "đánh dấu chưa đọc"', () => {
    const item = makeItem({ hasMention: true, lastMessage: lastMessage(10), markedUnread: true, unreadCount: 4 });
    expect(applyConversationRead(item, { lastReadSeq: 10 })).toMatchObject({
      hasMention: false,
      markedUnread: false,
      unreadCount: 0,
    });
  });

  it('mốc CHƯA tới tin cuối (tin mới đến trong lúc đọc) → giữ số cũ, không nuốt tin chưa đọc', () => {
    const item = makeItem({ hasMention: true, lastMessage: lastMessage(12), unreadCount: 4 });
    const next = applyConversationRead(item, { lastReadSeq: 10 });
    expect(next.unreadCount).toBe(4);
    expect(next.hasMention).toBe(true);
  });

  it('read:updated mang số chuẩn của server → tin số đó (kể cả còn > 0)', () => {
    const item = makeItem({ hasMention: true, lastMessage: lastMessage(12), unreadCount: 4 });
    expect(applyConversationRead(item, { lastReadSeq: 10, mentionCount: 0, unreadCount: 2 })).toMatchObject({
      hasMention: false,
      unreadCount: 2,
    });
  });

  it('không có gì đổi → trả NGUYÊN tham chiếu (không vẽ lại danh sách)', () => {
    const item = makeItem({ lastMessage: lastMessage(3) });
    expect(applyConversationRead(item, { lastReadSeq: 3 })).toBe(item);
  });
});

describe('applyConversationReadInList', () => {
  it('đọc xong thì hàng rời tab "Chưa đọc" nhưng vẫn ở "Tất cả"', () => {
    const data = makeListData([[makeItem({ id: 'a', lastMessage: lastMessage(5), unreadCount: 2 })]]);
    const unread = applyConversationReadInList(data, 'unread', 'a', { lastReadSeq: 5 });
    const all = applyConversationReadInList(data, 'all', 'a', { lastReadSeq: 5 });
    expect(unread?.pages[0]?.data).toHaveLength(0);
    expect(all?.pages[0]?.data[0]?.unreadCount).toBe(0);
  });

  it('không có hàng đó trong cache → giữ nguyên tham chiếu', () => {
    const data = makeListData([[makeItem({ id: 'a' })]]);
    expect(applyConversationReadInList(data, 'all', 'khong-co', { lastReadSeq: 1 })).toBe(data);
  });
});

describe('applyReadAllInList (NT-13)', () => {
  const data = makeListData([
    [
      makeItem({ activityAt: '2026-09-18T10:00:00.000Z', id: 'cu', unreadCount: 3 }),
      makeItem({ activityAt: '2026-09-18T12:05:00.000Z', hasMention: true, id: 'moi', unreadCount: 1 }),
      makeItem({ activityAt: '2026-09-18T09:00:00.000Z', id: 'da-doc' }),
      makeItem({ activityAt: '2026-09-18T09:30:00.000Z', id: 'danh-dau', markedUnread: true }),
    ],
  ]);
  const BEFORE = '2026-09-18T12:00:00.000Z';

  it('chỉ hàng có activityAt ≤ before về đã đọc; hàng tới SAU bấm vẫn chưa đọc', () => {
    const rows = applyReadAllInList(data, 'all', BEFORE)?.pages[0]?.data ?? [];
    expect(rows.find((r) => r.id === 'cu')).toMatchObject({ hasMention: false, markedUnread: false, unreadCount: 0 });
    expect(rows.find((r) => r.id === 'danh-dau')?.markedUnread).toBe(false);
    expect(rows.find((r) => r.id === 'moi')).toMatchObject({ hasMention: true, unreadCount: 1 });
  });

  it('tab "Chưa đọc": hàng đã đọc biến mất, hàng mới hơn `before` ở lại', () => {
    const ids = applyReadAllInList(data, 'unread', BEFORE)?.pages[0]?.data.map((r) => r.id);
    expect(ids).toEqual(['moi', 'da-doc']);
  });

  it('không hàng nào cần đổi → NGUYÊN tham chiếu', () => {
    const clean = makeListData([[makeItem({ id: 'x' })]]);
    expect(applyReadAllInList(clean, 'all', BEFORE)).toBe(clean);
  });
});

describe('patchConversationRead — vá mọi nơi giữ hội thoại', () => {
  it('mọi danh sách (theo filter đọc từ khoá) + ghim + chi tiết (lastReadSeq chỉ tăng)', () => {
    const queryClient = new QueryClient();
    const row = makeItem({ id: 'a', lastMessage: lastMessage(5), unreadCount: 2 });
    queryClient.setQueryData(conversationKeys.list({ filter: 'all' }), makeListData([[row]]));
    queryClient.setQueryData(conversationKeys.list({ filter: 'unread' }), makeListData([[row]]));
    queryClient.setQueryData(conversationKeys.pinned(), [row]);
    queryClient.setQueryData(conversationKeys.detail('a'), { ...row, lastReadSeq: 9 } as ConversationDetail);

    patchConversationRead(queryClient, 'a', { lastReadSeq: 5 });

    const all = queryClient.getQueryData<ConversationListData>(conversationKeys.list({ filter: 'all' }));
    const unread = queryClient.getQueryData<ConversationListData>(conversationKeys.list({ filter: 'unread' }));
    expect(all?.pages[0]?.data[0]?.unreadCount).toBe(0);
    expect(unread?.pages[0]?.data).toHaveLength(0);
    expect(queryClient.getQueryData<ConversationListItem[]>(conversationKeys.pinned())?.[0]?.unreadCount).toBe(0);
    const detail = queryClient.getQueryData<ConversationDetail>(conversationKeys.detail('a'));
    expect(detail?.unreadCount).toBe(0);
    expect(detail?.lastReadSeq).toBe(9); // không lùi
    queryClient.clear();
  });
});
