import { renderHook } from '@testing-library/react-native';

import { sortRaisedHands, useRaisedHandsQueue } from '../hooks/useRaisedHandsQueue';
import { makeParticipant } from './helpers';

/** VR-10: hàng đợi giơ tay theo giờ SERVER (`handRaisedAt`), bất kể thứ tự sự kiện tới máy này. */
describe('useRaisedHandsQueue', () => {
  const at = (s: number) => `2026-09-25T10:00:0${String(s)}.000Z`;

  it('sắp theo handRaisedAt tăng dần dù danh sách nhận theo thứ tự ngược/lộn xộn', () => {
    const list = [
      makeParticipant({ handRaisedAt: at(3), userId: 'd' }),
      makeParticipant({ handRaisedAt: at(1), userId: 'c' }),
      makeParticipant({ handRaisedAt: null, userId: 'x' }),
      makeParticipant({ handRaisedAt: at(2), userId: 'b' }),
    ];
    expect(sortRaisedHands(list).map((p) => p.userId)).toEqual(['c', 'b', 'd']);
  });

  it('chỉ người còn trong phòng (CONNECTED/JOINING/RECONNECTING) — người đã rời/bị mời ra không chiếm hàng đợi', () => {
    const list = [
      makeParticipant({ handRaisedAt: at(1), state: 'LEFT', userId: 'left' }),
      makeParticipant({ handRaisedAt: at(2), state: 'REMOVED', userId: 'removed' }),
      makeParticipant({ handRaisedAt: at(3), state: 'RECONNECTING', userId: 'ok' }),
    ];
    expect(sortRaisedHands(list).map((p) => p.userId)).toEqual(['ok']);
  });

  it('cùng mốc thời gian → theo userId để thứ tự ổn định giữa các lần vẽ', () => {
    const list = [makeParticipant({ handRaisedAt: at(1), userId: 'b' }), makeParticipant({ handRaisedAt: at(1), userId: 'a' })];
    expect(sortRaisedHands(list).map((p) => p.userId)).toEqual(['a', 'b']);
  });

  it('không sửa mảng đầu vào và giữ tham chiếu kết quả khi danh sách không đổi (hook)', async () => {
    const list = [makeParticipant({ handRaisedAt: at(2), userId: 'b' }), makeParticipant({ handRaisedAt: at(1), userId: 'a' })];
    const { rerender, result } = await renderHook(({ items }: { items: typeof list }) => useRaisedHandsQueue(items), {
      initialProps: { items: list },
    });
    const first = result.current;
    expect(first.map((p) => p.userId)).toEqual(['a', 'b']);
    expect(list.map((p) => p.userId)).toEqual(['b', 'a']);
    await rerender({ items: list });
    expect(result.current).toBe(first);
  });
});
