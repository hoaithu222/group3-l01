import { applyMessageCreated, applyMessageDeleted, applyMessageUpdated } from './apply-socket-event';
import { makeCreatedEvent, makeData, makeMessage, SCOPE } from './apply-socket-event.fixtures';

describe('applyMessageCreated', () => {
  it('bỏ qua khi scope không khớp', () => {
    const data = makeData([{ data: [makeMessage({ seq: 1 })] }]);
    const result = applyMessageCreated(data, SCOPE, 'u-1', makeCreatedEvent({ scopeId: 'ch-khác' }));
    expect(result).toEqual({ outcome: 'ignored' });
  });

  it('chèn tin khi seq liền mạch và đã tải trang mới nhất (TX-02: socket trước HTTP)', () => {
    const data = makeData([{ data: [makeMessage({ seq: 1 })] }]);
    const result = applyMessageCreated(data, SCOPE, 'u-2', makeCreatedEvent({ clientMessageId: 'client-abc' }));
    expect(result.outcome).toBe('inserted');
    if (result.outcome !== 'inserted') throw new Error('unreachable');
    expect(result.clientMessageId).toBe('client-abc');
    expect(result.data.pages[0]?.data.map((m) => m.id)).toEqual(['m-1', 'm-2']);
    // Tác giả của tin mới là chính người xem ⇒ suy `canEdit/canRecall = true`.
    expect(result.data.pages[0]?.data[1]?.myPermissions.canEdit).toBe(true);
  });

  it('báo lỗ seq (gap) để gọi gap-fill khi seq nhảy cóc', () => {
    const data = makeData([{ data: [makeMessage({ seq: 1 })] }]);
    const result = applyMessageCreated(data, SCOPE, 'u-2', makeCreatedEvent({ seq: 5 }));
    expect(result).toEqual({ outcome: 'gap', fromSeq: 1 });
  });

  it('không chèn khi chưa tải tới trang mới nhất (đang ở around) — chỉ báo buffered', () => {
    const data = makeData([{ data: [makeMessage({ seq: 1 })], hasMoreAfter: true }]);
    const result = applyMessageCreated(data, SCOPE, 'u-2', makeCreatedEvent({ seq: 2 }));
    expect(result).toEqual({ outcome: 'buffered' });
  });
});

describe('applyMessageUpdated', () => {
  it('bỏ qua bản cập nhật CŨ hơn version đang có', () => {
    const data = makeData([{ data: [makeMessage({ version: 3, content: 'mới nhất' })] }]);
    const result = applyMessageUpdated(data, SCOPE, {
      id: 'm-1',
      scopeType: 'CHANNEL',
      scopeId: 'ch-1',
      content: 'bản cũ tới trễ',
      mentions: [],
      links: [],
      editedAt: '2026-09-18T00:02:00.000Z',
      version: 2,
      reason: 'EDIT',
    });
    expect(result?.pages[0]?.data[0]?.content).toBe('mới nhất');
  });

  it('áp bản mới hơn version', () => {
    const data = makeData([{ data: [makeMessage({ version: 1 })] }]);
    const result = applyMessageUpdated(data, SCOPE, {
      id: 'm-1',
      scopeType: 'CHANNEL',
      scopeId: 'ch-1',
      content: 'đã sửa',
      mentions: [],
      links: [],
      editedAt: '2026-09-18T00:02:00.000Z',
      version: 2,
      reason: 'EDIT',
    });
    expect(result?.pages[0]?.data[0]?.content).toBe('đã sửa');
    expect(result?.pages[0]?.data[0]?.version).toBe(2);
  });
});

describe('applyMessageDeleted', () => {
  it('chuyển tombstone tại chỗ và đánh dấu replyPreview.deleted của tin trả lời', () => {
    const reply = makeMessage({
      id: 'm-2',
      seq: 2,
      replyToId: 'm-1',
      replyPreview: { authorId: 'u-1', excerpt: 'xin chào', kind: 'text', deleted: false },
    });
    const data = makeData([{ data: [makeMessage({ seq: 1 }), reply] }]);
    const result = applyMessageDeleted(data, SCOPE, {
      id: 'm-1',
      scopeType: 'CHANNEL',
      scopeId: 'ch-1',
      seq: 1,
      deletedAt: '2026-09-18T00:03:00.000Z',
      mode: 'AUTHOR_RECALL',
    });
    const [tombstone, patchedReply] = result?.pages[0]?.data ?? [];
    expect(tombstone).toMatchObject({ deleted: true, content: null, seq: 1 });
    expect(patchedReply?.replyPreview?.deleted).toBe(true);
  });
});
