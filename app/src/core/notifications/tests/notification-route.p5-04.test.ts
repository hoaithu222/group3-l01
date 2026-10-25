import { hrefForTarget, hrefOrActivity } from '../notification-route';

/**
 * p5-04 (`app.md` §"Thông báo"): `announcement.required` / `announcement.reminder` mở ĐÚNG tin cần xác nhận trong kênh (`?m=`), nơi có
 * nút "Tôi đã đọc" ngay dưới tin. Tên loại theo `be/src/modules/announcements/announcement.notification-types.ts`.
 *
 * Hai loại đi qua đường tin nhắn sẵn có (`MESSAGE_TYPES` → `messageHref`): BE gửi `scopeType='CHANNEL'` + `scopeId` = id kênh +
 * `workspaceId` ở CẢ push (`firebase-push.sender.ts`) lẫn hộp thư — cùng bộ khoá như `mention`.
 */
const CHANNEL_ROUTE = '/workspaces/[wsId]/channels/[chId]';

describe.each(['announcement.required', 'announcement.reminder'])('hrefForTarget — %s', (type) => {
  it('kênh + workspace + messageId → vào kênh, mở đúng tin bằng `m`', () => {
    expect(
      hrefForTarget({
        messageId: 'm-1',
        scopeId: 'ch-1',
        scopeType: 'CHANNEL',
        type,
        workspaceId: 'ws-1',
      }),
    ).toEqual({
      params: { chId: 'ch-1', m: 'm-1', wsId: 'ws-1' },
      pathname: CHANNEL_ROUTE,
    });
  });

  it('thiếu messageId → vẫn vào kênh (không có `m`), không dựng tham số rỗng', () => {
    const href = hrefForTarget({
      scopeId: 'ch-1',
      scopeType: 'CHANNEL',
      type,
      workspaceId: 'ws-1',
    });

    expect(href).toEqual({ params: { chId: 'ch-1', wsId: 'ws-1' }, pathname: CHANNEL_ROUTE });
    expect(href).not.toHaveProperty('params.m');
  });

  it('thiếu workspaceId → null (rơi về hộp thư /activity), không dựng đường dẫn thiếu tham số', () => {
    const target = { messageId: 'm-1', scopeId: 'ch-1', scopeType: 'CHANNEL', type };

    expect(hrefForTarget(target)).toBeNull();
    expect(hrefOrActivity(target)).toBe('/activity');
  });

  it('thiếu phạm vi kênh (scopeId/scopeType) → null', () => {
    expect(hrefForTarget({ messageId: 'm-1', type, workspaceId: 'ws-1' })).toBeNull();
    expect(
      hrefForTarget({ messageId: 'm-1', scopeType: 'CHANNEL', type, workspaceId: 'ws-1' }),
    ).toBeNull();
  });

  it('không có rootMessageId (BE không gửi cho loại này) → không đi vào màn luồng', () => {
    expect(
      hrefForTarget({
        messageId: 'm-1',
        scopeId: 'ch-1',
        scopeType: 'CHANNEL',
        type,
        workspaceId: 'ws-1',
      }),
    ).toMatchObject({ pathname: CHANNEL_ROUTE });
  });
});

describe('hrefForTarget — loại tin nhắn cũ không bị ảnh hưởng', () => {
  it('message.new vẫn vào kênh KHÔNG có `m`; mention vẫn có `m`', () => {
    const base = { scopeId: 'ch-1', scopeType: 'CHANNEL', workspaceId: 'ws-1' };

    expect(hrefForTarget({ ...base, messageId: 'm-1', type: 'message.new' })).toEqual({
      params: { chId: 'ch-1', wsId: 'ws-1' },
      pathname: CHANNEL_ROUTE,
    });
    expect(hrefForTarget({ ...base, messageId: 'm-1', type: 'mention' })).toEqual({
      params: { chId: 'ch-1', m: 'm-1', wsId: 'ws-1' },
      pathname: CHANNEL_ROUTE,
    });
  });

  it('loại `announcement.` lạ (chưa có màn đích) → null, không đoán đích', () => {
    expect(
      hrefForTarget({
        messageId: 'm-1',
        scopeId: 'ch-1',
        scopeType: 'CHANNEL',
        type: 'announcement.unknown',
        workspaceId: 'ws-1',
      }),
    ).toBeNull();
  });
});
