import {
  applyConversationActivity,
  applyConversationRemoved,
  applyMemberUpdatedSelfInList,
  shouldClearChatCache,
} from './apply-conversation-event';
import { makeActivityEvent, makeItem, makeListData } from './apply-conversation-event.fixtures';

describe('applyConversationActivity', () => {
  it('CV-22: đưa hội thoại lên đầu trang 1, không để lại bản trùng ở trang khác', () => {
    const data = makeListData([
      [makeItem({ id: 'cv-a' }), makeItem({ id: 'cv-b' })],
      [makeItem({ id: 'cv-1' }), makeItem({ id: 'cv-c' })],
    ]);
    const result = applyConversationActivity(data, 'all', makeActivityEvent(), {
      currentUserId: 'me',
      isOpenForeground: false,
    });

    expect(result.outcome).toBe('updated');
    if (result.outcome !== 'updated') throw new Error('unreachable');
    expect(result.data.pages[0]?.data.map((i) => i.id)).toEqual(['cv-1', 'cv-a', 'cv-b']);
    expect(result.data.pages[1]?.data.map((i) => i.id)).toEqual(['cv-c']);
  });

  it('không tăng unreadCount khi hội thoại đang mở ở foreground', () => {
    const data = makeListData([[makeItem({ id: 'cv-1', unreadCount: 2 })]]);
    const result = applyConversationActivity(data, 'all', makeActivityEvent(), {
      currentUserId: 'me',
      isOpenForeground: true,
    });

    expect(result.outcome).toBe('updated');
    if (result.outcome !== 'updated') throw new Error('unreachable');
    expect(result.data.pages[0]?.data[0]?.unreadCount).toBe(2);
  });

  it('tăng unreadCount khi tin của người khác và hội thoại KHÔNG đang mở', () => {
    const data = makeListData([[makeItem({ id: 'cv-1', unreadCount: 2 })]]);
    const result = applyConversationActivity(data, 'all', makeActivityEvent(), {
      currentUserId: 'me',
      isOpenForeground: false,
    });

    expect(result.outcome).toBe('updated');
    if (result.outcome !== 'updated') throw new Error('unreachable');
    expect(result.data.pages[0]?.data[0]?.unreadCount).toBe(3);
  });

  it('không tăng unreadCount khi tin là của chính mình (đồng bộ đa thiết bị)', () => {
    const data = makeListData([[makeItem({ id: 'cv-1', unreadCount: 0 })]]);
    const result = applyConversationActivity(data, 'all', makeActivityEvent({ authorId: 'me' }), {
      currentUserId: 'me',
      isOpenForeground: false,
    });

    expect(result.outcome).toBe('updated');
    if (result.outcome !== 'updated') throw new Error('unreachable');
    expect(result.data.pages[0]?.data[0]?.unreadCount).toBe(0);
  });

  it('hội thoại đã lưu trữ tự hiện lại (bỏ archivedAt) khi KHÔNG tắt tiếng', () => {
    const data = makeListData([[makeItem({ id: 'cv-1', archivedAt: '2026-09-17T00:00:00.000Z', muted: false })]]);
    const result = applyConversationActivity(data, 'all', makeActivityEvent(), {
      currentUserId: 'me',
      isOpenForeground: false,
    });

    expect(result.outcome).toBe('updated');
    if (result.outcome !== 'updated') throw new Error('unreachable');
    expect(result.data.pages[0]?.data[0]?.archivedAt).toBeNull();
  });

  it('hội thoại đã lưu trữ VẪN lưu trữ nếu đang tắt tiếng (trừ muted)', () => {
    const data = makeListData([[makeItem({ id: 'cv-1', archivedAt: '2026-09-17T00:00:00.000Z', muted: true })]]);
    const result = applyConversationActivity(data, 'archived', makeActivityEvent(), {
      currentUserId: 'me',
      isOpenForeground: false,
    });

    expect(result.outcome).toBe('updated');
    if (result.outcome !== 'updated') throw new Error('unreachable');
    // Vẫn lưu trữ ⇒ không thuộc filter "archived"? — filter 'archived' đòi archivedAt !== null, còn true ở đây.
    expect(result.data.pages[0]?.data[0]?.archivedAt).toBe('2026-09-17T00:00:00.000Z');
  });

  it('báo invalidate khi hội thoại chưa có trong cache', () => {
    const data = makeListData([[makeItem({ id: 'cv-khac' })]]);
    const result = applyConversationActivity(data, 'all', makeActivityEvent(), {
      currentUserId: 'me',
      isOpenForeground: false,
    });
    expect(result).toEqual({ outcome: 'invalidate' });
  });

  it('bỏ qua khi chưa có cache nào', () => {
    const result = applyConversationActivity(undefined, 'all', makeActivityEvent(), {
      currentUserId: 'me',
      isOpenForeground: false,
    });
    expect(result).toEqual({ outcome: 'ignored' });
  });
});

describe('applyMemberUpdatedSelfInList', () => {
  it('gỡ khỏi trang khi bị lưu trữ và đang xem filter "all"', () => {
    const data = makeListData([[makeItem({ id: 'cv-1', archivedAt: null })]]);
    const result = applyMemberUpdatedSelfInList(data, 'all', {
      v: 1,
      conversationId: 'cv-1',
      archivedAt: '2026-09-18T00:00:00.000Z',
    });
    expect(result?.pages[0]?.data).toHaveLength(0);
  });
});

describe('applyConversationRemoved', () => {
  it('dọn hội thoại khỏi mọi trang đang cache', () => {
    const data = makeListData([[makeItem({ id: 'cv-1' }), makeItem({ id: 'cv-2' })]]);
    const result = applyConversationRemoved(data, 'cv-1');
    expect(result?.pages[0]?.data.map((i) => i.id)).toEqual(['cv-2']);
  });
});

describe('shouldClearChatCache', () => {
  it('true khi hiddenBeforeSeq tăng', () => {
    expect(shouldClearChatCache(0, 12)).toBe(true);
  });

  it('false khi không đổi hoặc giảm', () => {
    expect(shouldClearChatCache(12, 12)).toBe(false);
    expect(shouldClearChatCache(12, undefined)).toBe(false);
  });
});
