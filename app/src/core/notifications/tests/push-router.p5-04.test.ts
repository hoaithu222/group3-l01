import { parsePushPayload, PUSH_TYPES } from '../push-payload.types';
import { decidePushTap, resolvePushHref } from '../push-router';

/**
 * p5-04: push `announcement.required` / `announcement.reminder`. FCM `data` do BE dựng (`firebase-push.sender.ts` `buildCommonData`): khoá chung
 * `type/targetUserId/sentAt/notificationId/scopeType/scopeId/workspaceId` cộng `dataKeys` của loại (`workspaceId/channelId/messageId`).
 * Toàn chuỗi — đúng dạng app nhận, đi qua `parsePushPayload` (chỉ giữ khoá trong danh sách) trước khi tới router.
 */
const CHANNEL_ROUTE = '/workspaces/[wsId]/channels/[chId]';

function fcmData(
  type: string,
  overrides: Record<string, string> = {},
  omit: string[] = [],
): Record<string, string> {
  const data: Record<string, string> = {
    channelId: 'ch-1',
    messageId: 'm-1',
    notificationId: 'n-1',
    scopeId: 'ch-1',
    scopeType: 'CHANNEL',
    sentAt: '2026-09-25T07:00:00.000Z',
    targetUserId: 'user-me',
    type,
    workspaceId: 'ws-1',
    ...overrides,
  };
  for (const key of omit) delete data[key];
  return data;
}

function parse(data: Record<string, string>) {
  const payload = parsePushPayload(data);
  if (!payload) throw new Error('payload dựng sai');
  return payload;
}

describe('PUSH_TYPES', () => {
  it('khai cả hai loại của p5-04', () => {
    expect(PUSH_TYPES).toEqual(
      expect.arrayContaining(['announcement.required', 'announcement.reminder']),
    );
  });
});

describe('parsePushPayload — announcement.*', () => {
  it('giữ phạm vi kênh + messageId/workspaceId để router mở đúng tin', () => {
    expect(parse(fcmData('announcement.required'))).toMatchObject({
      channelId: 'ch-1',
      messageId: 'm-1',
      scopeId: 'ch-1',
      scopeType: 'CHANNEL',
      type: 'announcement.required',
      workspaceId: 'ws-1',
    });
  });

  it('bỏ khoá lạ (deadlineAt không nằm trong dataKeys của push; ai gửi FCM cũng điền được data)', () => {
    const payload = parse(
      fcmData('announcement.reminder', { deadlineAt: '2026-10-01T00:00:00.000Z', evil: 'x' }),
    );

    expect(payload).not.toHaveProperty('evil');
    expect(payload).not.toHaveProperty('deadlineAt');
  });
});

describe.each(['announcement.required', 'announcement.reminder'])(
  'resolvePushHref — %s',
  (type) => {
    it('chạm push → kênh chứa tin, `m` = tin cần xác nhận', () => {
      expect(resolvePushHref(parse(fcmData(type)))).toEqual({
        params: { chId: 'ch-1', m: 'm-1', wsId: 'ws-1' },
        pathname: CHANNEL_ROUTE,
      });
    });

    it('thiếu workspaceId → về hộp thư /activity (không dựng đường dẫn thiếu tham số)', () => {
      expect(resolvePushHref(parse(fcmData(type, {}, ['workspaceId'])))).toBe('/activity');
    });

    it('thiếu phạm vi kênh → về hộp thư /activity', () => {
      expect(resolvePushHref(parse(fcmData(type, {}, ['scopeId', 'scopeType'])))).toBe('/activity');
    });

    it('thiếu messageId → vẫn vào kênh, không có `m`', () => {
      expect(resolvePushHref(parse(fcmData(type, {}, ['messageId'])))).toEqual({
        params: { chId: 'ch-1', wsId: 'ws-1' },
        pathname: CHANNEL_ROUTE,
      });
    });
  },
);

describe('decidePushTap — announcement.*', () => {
  const session = { authenticated: true, userId: 'user-me' };

  it('đúng tài khoản → điều hướng tới tin', () => {
    expect(decidePushTap(parse(fcmData('announcement.required')), session)).toEqual({
      href: { params: { chId: 'ch-1', m: 'm-1', wsId: 'ws-1' }, pathname: CHANNEL_ROUTE },
      kind: 'navigate',
    });
  });

  it('push của tài khoản khác (máy vừa đổi người dùng) → bỏ, không mở kênh của người cũ', () => {
    expect(
      decidePushTap(parse(fcmData('announcement.reminder', { targetUserId: 'nguoi-cu' })), session),
    ).toEqual({ kind: 'ignored', reason: 'other-user' });
  });
});
