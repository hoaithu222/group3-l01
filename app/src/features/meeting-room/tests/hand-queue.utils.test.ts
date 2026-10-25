import { raisedHandOrder } from '../utils/hand-queue.utils';

/** Hàng đợi phát biểu: số thứ tự theo giờ giơ tay (server), người không giơ tay không có số. */
describe('raisedHandOrder', () => {
  it('đánh số 1..n theo giờ giơ tay sớm nhất trước, bỏ người không giơ tay', () => {
    const order = raisedHandOrder([
      { handRaisedAt: '2026-10-01T09:02:00.000Z', userId: 'b' },
      { handRaisedAt: null, userId: 'x' },
      { handRaisedAt: '2026-10-01T09:01:00.000Z', userId: 'a' },
      { handRaisedAt: '2026-10-01T09:03:00.000Z', userId: 'c' },
    ]);

    expect([...order.entries()]).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    expect(order.has('x')).toBe(false);
  });

  it('trùng giờ thì giữ thứ tự gốc của danh sách; không ai giơ tay ⇒ rỗng', () => {
    const at = '2026-10-01T09:00:00.000Z';

    expect(
      raisedHandOrder([
        { handRaisedAt: at, userId: 'first' },
        { handRaisedAt: at, userId: 'second' },
      ]).get('second'),
    ).toBe(2);
    expect(raisedHandOrder([{ handRaisedAt: null, userId: 'a' }]).size).toBe(0);
  });
});
