import { parsePushPayload, PUSH_TYPES, type PushPayload } from '../push-payload.types';
import { decidePushTap, resolvePushHref } from '../push-router';

/**
 * `app.md` §8: 13 loại → điều hướng đúng. Đây là bản thay thế TẠM cho resolver p0-12 — khi p0-12 xong,
 * test này đổi thành kiểm lời gọi resolver, nhưng bảng "loại → đích" vẫn là hợp đồng.
 */

function make(overrides: Record<string, string>): PushPayload {
  const parsed = parsePushPayload({ targetUserId: 'user-me', ...overrides });
  if (!parsed) throw new Error('payload dựng sai');
  return parsed;
}

describe('resolvePushHref', () => {
  it('message.new trong hội thoại → mở hội thoại, KHÔNG nhảy tới tin (tin gộp)', () => {
    expect(
      resolvePushHref(
        make({
          messageId: 'm1',
          scopeId: 'conv-1',
          scopeType: 'CONVERSATION',
          type: 'message.new',
        }),
      ),
    ).toEqual({ params: { conversationId: 'conv-1' }, pathname: '/messages/[conversationId]' });
  });

  it('mention trong hội thoại → mở hội thoại và cuộn tới tin (m)', () => {
    expect(
      resolvePushHref(
        make({ messageId: 'm1', scopeId: 'conv-1', scopeType: 'CONVERSATION', type: 'mention' }),
      ),
    ).toEqual({
      params: { conversationId: 'conv-1', m: 'm1' },
      pathname: '/messages/[conversationId]',
    });
  });

  it('message.new trong kênh → mở kênh của workspace', () => {
    expect(
      resolvePushHref(
        make({ scopeId: 'ch-1', scopeType: 'CHANNEL', type: 'message.new', workspaceId: 'ws-1' }),
      ),
    ).toEqual({
      params: { chId: 'ch-1', wsId: 'ws-1' },
      pathname: '/workspaces/[wsId]/channels/[chId]',
    });
  });

  it('mention trong kênh → mở kênh, cuộn tới tin', () => {
    expect(
      resolvePushHref(
        make({
          messageId: 'm9',
          scopeId: 'ch-1',
          scopeType: 'CHANNEL',
          type: 'mention',
          workspaceId: 'ws-1',
        }),
      ),
    ).toEqual({
      params: { chId: 'ch-1', m: 'm9', wsId: 'ws-1' },
      pathname: '/workspaces/[wsId]/channels/[chId]',
    });
  });

  it('kênh thiếu workspaceId → về /activity thay vì dựng đường dẫn thiếu tham số', () => {
    expect(resolvePushHref(make({ scopeId: 'ch-1', scopeType: 'CHANNEL', type: 'mention' }))).toBe(
      '/activity',
    );
  });

  it.each(['call.incoming', 'call.cancelled', 'call.answered-elsewhere', 'call.missed'])(
    '%s → màn cuộc gọi',
    (type) => {
      expect(resolvePushHref(make({ callId: 'c1', type }))).toBe('/messages/calls');
    },
  );

  it.each(['system.test'])('%s (loại lạ) → /activity', (type) => {
    expect(resolvePushHref(make({ meetingId: 'mt-1', type }))).toBe('/activity');
  });

  // Họp (p2-04) đã có màn chi tiết: `notification-route.meeting-gamification.test.ts` khoá đích của từng loại `meeting.*`.
  it('meeting.* có meetingId → chi tiết cuộc họp (không còn rơi về hộp thư)', () => {
    expect(resolvePushHref(make({ meetingId: 'mt-1', type: 'meeting.invited' }))).toEqual({
      params: { meetingId: 'mt-1' },
      pathname: '/meetings/[meetingId]',
    });
  });

  it('mọi loại trong bảng be.md §6.2 đều cho ra một đích (không ném, không undefined)', () => {
    for (const type of PUSH_TYPES) {
      expect(resolvePushHref(make({ scopeId: 'x', scopeType: 'CONVERSATION', type }))).toBeTruthy();
    }
  });
});

describe('decidePushTap', () => {
  const payload = make({ scopeId: 'conv-1', scopeType: 'CONVERSATION', type: 'message.new' });

  it('điều hướng khi đã đăng nhập đúng người', () => {
    const outcome = decidePushTap(payload, { authenticated: true, userId: 'user-me' });
    expect(outcome.kind).toBe('navigate');
  });

  it('bỏ khi targetUserId lệch người đang đăng nhập (NT-07)', () => {
    expect(decidePushTap(payload, { authenticated: true, userId: 'other' })).toEqual({
      kind: 'ignored',
      reason: 'other-user',
    });
  });

  it('không điều hướng khi chưa đăng nhập, hoặc chưa biết user.id', () => {
    expect(decidePushTap(payload, { authenticated: false, userId: 'user-me' })).toEqual({
      kind: 'ignored',
      reason: 'not-authenticated',
    });
    expect(decidePushTap(payload, { authenticated: true, userId: undefined })).toEqual({
      kind: 'ignored',
      reason: 'not-authenticated',
    });
  });

  it('bỏ payload không nhận diện được', () => {
    expect(decidePushTap(null, { authenticated: true, userId: 'user-me' })).toEqual({
      kind: 'ignored',
      reason: 'unrecognized',
    });
  });
});
