import {
  applyRootDeleted,
  applyRootUpdated,
  applySubscriptionUpdated,
  applyThreadUpdatedToRoot,
  isFollowing,
  setMySubscription,
} from '../utils/thread-cache';
import { makeRootMessage, makeRootResult, makeThread } from './fixtures';

const cached = makeRootResult;
const thread = makeThread;

const event = {
  threadId: 't-1',
  parentMessageId: 'root-1',
  replyCount: 3,
  lastReplyAt: '2026-09-19T02:00:00.000Z',
  lastReplierIds: ['u2', 'u1'],
  lastReplySeq: 3,
};

describe('isFollowing', () => {
  it('theo dõi = AUTO_ON hoặc EXPLICIT_ON; EXPLICIT_OFF và chưa có lựa chọn là KHÔNG (mention không tự theo dõi)', () => {
    expect(isFollowing('AUTO_ON')).toBe(true);
    expect(isFollowing('EXPLICIT_ON')).toBe(true);
    expect(isFollowing('EXPLICIT_OFF')).toBe(false);
    expect(isFollowing(null)).toBe(false);
    expect(isFollowing(undefined)).toBe(false);
  });
});

describe('applyThreadUpdatedToRoot — thread:updated', () => {
  it('cập nhật số phản hồi/người trả lời ở CẢ tin gốc lẫn thread', () => {
    const next = applyThreadUpdatedToRoot(cached(), event);
    expect(next?.thread).toMatchObject({ replyCount: 3, lastReplierIds: ['u2', 'u1'] });
    expect(next?.root).toMatchObject({ replyCount: 3, lastReplySeq: 3 });
  });

  it('bỏ sự kiện CŨ (lastReplySeq ≤ đã có; không seq thì so replyCount)', () => {
    const data = cached({
      root: makeRootMessage({ id: 'root-1', replyCount: 5, lastReplySeq: 5 }),
    });
    expect(applyThreadUpdatedToRoot(data, event)).toBe(data);
    const noSeq = cached({ thread: thread({ replyCount: 9 }) });
    expect(applyThreadUpdatedToRoot(noSeq, event)).toBe(noSeq);
  });

  it('luồng chưa có (thread null) hoặc sự kiện của luồng khác → không đổi (caller tự invalidate ca đầu)', () => {
    const empty = cached({ thread: null });
    expect(applyThreadUpdatedToRoot(empty, event)).toBe(empty);
    const other = cached();
    expect(applyThreadUpdatedToRoot(other, { ...event, threadId: 't-khac' })).toBe(other);
  });
});

describe('theo dõi', () => {
  it('setMySubscription đổi nhãn; chưa có luồng thì không làm gì', () => {
    expect(setMySubscription(cached(), 'EXPLICIT_OFF')?.thread?.mySubscription).toBe(
      'EXPLICIT_OFF',
    );
    const empty = cached({ thread: null });
    expect(setMySubscription(empty, 'EXPLICIT_ON')).toBe(empty);
  });

  it('thread:subscription-updated từ máy khác chỉ áp cho ĐÚNG luồng đang mở', () => {
    expect(
      applySubscriptionUpdated(cached(), { threadId: 't-1', state: 'EXPLICIT_OFF' })?.thread
        ?.mySubscription,
    ).toBe('EXPLICIT_OFF');
    const data = cached();
    expect(applySubscriptionUpdated(data, { threadId: 't-khac', state: 'EXPLICIT_OFF' })).toBe(
      data,
    );
  });
});

describe('tin gốc bị sửa / thu hồi khi màn luồng đang mở', () => {
  it('sửa: chỉ áp bản version MỚI HƠN', () => {
    const data = cached();
    const edit = {
      id: 'root-1',
      content: 'đã sửa',
      mentions: [],
      editedAt: '2026-09-19T03:00:00.000Z',
      version: 2,
    };
    expect(applyRootUpdated(data, edit)?.root).toMatchObject({ content: 'đã sửa', version: 2 });
    expect(applyRootUpdated(data, { ...edit, version: 1 })).toBe(data);
  });

  it('thu hồi: thành tombstone TẠI CHỖ, luồng và số phản hồi giữ nguyên (MSG-35)', () => {
    const next = applyRootDeleted(cached(), {
      id: 'root-1',
      deletedAt: '2026-09-19T03:00:00.000Z',
    });
    expect(next?.root).toMatchObject({ deleted: true, content: null, replyCount: 2 });
    expect(next?.thread?.replyCount).toBe(2);
  });

  it('sự kiện của tin khác không đụng gì', () => {
    const data = cached();
    expect(applyRootDeleted(data, { id: 'khac', deletedAt: 'x' })).toBe(data);
  });
});
