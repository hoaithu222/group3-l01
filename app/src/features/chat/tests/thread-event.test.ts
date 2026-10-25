import { applyThreadUpdated } from '../cache/apply-thread-event';
import { makeData, makeMessage } from '../cache/apply-socket-event.fixtures';

describe('applyThreadUpdated — thread:updated vào cache luồng chính', () => {
  const event = {
    threadId: 't-1',
    parentMessageId: 'root-1',
    replyCount: 3,
    lastReplyAt: '2026-09-19T02:00:00.000Z',
    lastReplierIds: ['u2', 'u1'],
    lastReplySeq: 3,
  };

  it('cập nhật tóm tắt trên TIN GỐC (kể cả khi tin đó chưa có replyCount)', () => {
    const data = makeData([
      { data: [makeMessage({ id: 'root-1' }), makeMessage({ id: 'm-2', seq: 2 })] },
    ]);
    const next = applyThreadUpdated(data, event);
    const root = next?.pages[0]?.data.find((m) => m.id === 'root-1');
    expect(root).toMatchObject({ replyCount: 3, lastReplierIds: ['u2', 'u1'], lastReplySeq: 3 });
    expect(next?.pages[0]?.data.find((m) => m.id === 'm-2')?.replyCount).toBeUndefined();
  });

  it('bỏ sự kiện CŨ: lastReplySeq ≤ cache; không seq thì so replyCount', () => {
    const withSeq = makeData([
      { data: [makeMessage({ id: 'root-1', replyCount: 5, lastReplySeq: 5 })] },
    ]);
    expect(applyThreadUpdated(withSeq, event)).toEqual(withSeq);

    const noSeq = makeData([{ data: [makeMessage({ id: 'root-1', replyCount: 5 })] }]);
    expect(applyThreadUpdated(noSeq, event)).toEqual(noSeq);
  });

  it('tin gốc không nằm trong cache → không đổi; chưa có cache → undefined', () => {
    const data = makeData([{ data: [makeMessage({ id: 'khac' })] }]);
    expect(applyThreadUpdated(data, event)).toBe(data);
    expect(applyThreadUpdated(undefined, event)).toBeUndefined();
  });
});
