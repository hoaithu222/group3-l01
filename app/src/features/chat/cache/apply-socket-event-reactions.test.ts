import { applyMessageHidden, applyPinUpdated, applyReactionUpdated } from './apply-socket-event';
import { makeData, makeMessage, SCOPE } from './apply-socket-event.fixtures';

describe('applyMessageHidden', () => {
  it('hidden=true loại tin khỏi trang', () => {
    const data = makeData([{ data: [makeMessage({ id: 'm-1' }), makeMessage({ id: 'm-2', seq: 2 })] }]);
    const result = applyMessageHidden(data, SCOPE, { messageId: 'm-1', scopeType: 'CHANNEL', scopeId: 'ch-1', hidden: true });
    expect(result.outcome).toBe('removed');
    if (result.outcome !== 'removed') throw new Error('unreachable');
    expect(result.data.pages[0]?.data.map((m) => m.id)).toEqual(['m-2']);
  });

  it('hidden=false báo caller tự invalidate (không đủ dữ liệu để chèn lại)', () => {
    const result = applyMessageHidden(undefined, SCOPE, { messageId: 'm-1', scopeType: 'CHANNEL', scopeId: 'ch-1', hidden: false });
    expect(result).toEqual({ outcome: 'invalidate' });
  });
});

describe('applyReactionUpdated', () => {
  it('cập nhật count; `me` chỉ đổi cho đúng người dùng hiện tại (thiết bị khác của người khác không đổi `me` của mình)', () => {
    const data = makeData([{ data: [makeMessage({ reactions: [{ emoji: '👍', count: 1, me: true }] })] }]);
    const result = applyReactionUpdated(data, 'u-1', { messageId: 'm-1', emoji: '👍', count: 2, userId: 'u-9', action: 'ADD' });
    const reaction = result?.pages[0]?.data[0]?.reactions.find((r) => r.emoji === '👍');
    expect(reaction).toEqual({ emoji: '👍', count: 2, me: true });
  });

  it('loại chip khi count về 0', () => {
    const data = makeData([{ data: [makeMessage({ reactions: [{ emoji: '👍', count: 1, me: true }] })] }]);
    const result = applyReactionUpdated(data, 'u-1', { messageId: 'm-1', emoji: '👍', count: 0, userId: 'u-1', action: 'REMOVE' });
    expect(result?.pages[0]?.data[0]?.reactions).toEqual([]);
  });
});

describe('applyPinUpdated', () => {
  it('gán pinnedAt/pinnedBy khi ghim', () => {
    const data = makeData([{ data: [makeMessage({})] }]);
    const result = applyPinUpdated(data, SCOPE, {
      messageId: 'm-1',
      scopeType: 'CHANNEL',
      scopeId: 'ch-1',
      pinned: true,
      pinnedAt: '2026-09-18T00:04:00.000Z',
      pinnedBy: 'u-1',
    });
    expect(result?.pages[0]?.data[0]).toMatchObject({ pinnedAt: '2026-09-18T00:04:00.000Z', pinnedBy: 'u-1' });
  });
});
