import type { InboxItem } from '@/core/notifications';
import { hrefForTarget } from '@/core/notifications';

import { describeActivity, UNAVAILABLE_TITLE } from '../utils/describe-item';
import { inboxItemTarget } from '../utils/inbox-target';

/**
 * p5-04: mục hộp thư `announcement.required` / `announcement.reminder`. BE ghi `refs = { workspaceId, channelId, messageId, deadlineAt? }`,
 * `scopeType: 'CHANNEL'` + `scopeId` = id kênh (`announcement-notify.service.ts` → `notify()`); tên kênh/trích đoạn do BE tính lúc đọc
 * (`context`) và bị xoá khi người nhận mất quyền.
 */
function make(overrides: Partial<InboxItem>): InboxItem {
  return {
    actor: { avatarUrl: null, name: 'Minh', userId: 'u1' },
    actorId: 'u1',
    context: { available: true, muted: false, scopeName: 'thong-bao' },
    createdAt: '2026-09-25T10:00:00.000Z',
    id: 'n1',
    kind: 'DEFAULT',
    muted: false,
    readAt: null,
    refs: {
      channelId: 'ch-1',
      deadlineAt: '2026-10-01T00:00:00.000Z',
      messageId: 'm-1',
      workspaceId: 'ws-1',
    },
    scopeId: 'ch-1',
    scopeType: 'CHANNEL',
    type: 'announcement.required',
    unavailable: false,
    workspaceId: 'ws-1',
    ...overrides,
  };
}

describe('describeActivity — announcement.*', () => {
  it('announcement.required: người yêu cầu + tên kênh, kèm trích đoạn của tin', () => {
    const item = make({
      context: {
        available: true,
        excerpt: 'Họp toàn công ty 9h',
        muted: false,
        scopeName: 'thong-bao',
      },
    });

    expect(describeActivity(item)).toEqual({
      excerpt: 'Họp toàn công ty 9h',
      title: 'Minh yêu cầu bạn xác nhận đã đọc một thông báo trong #thong-bao',
    });
  });

  it('announcement.required không có người thực hiện → "Ai đó", không ném', () => {
    expect(describeActivity(make({ actor: null })).title).toBe(
      'Ai đó yêu cầu bạn xác nhận đã đọc một thông báo trong #thong-bao',
    );
  });

  it('announcement.reminder: nhắc người CHƯA xác nhận, không nêu tên ai (nhắc do hệ thống)', () => {
    expect(describeActivity(make({ actor: null, type: 'announcement.reminder' }))).toEqual({
      excerpt: undefined,
      title: 'Nhắc: bạn chưa xác nhận đã đọc một thông báo trong #thong-bao',
    });
  });

  it('không có tên kênh (BE không cấp) → bỏ đoạn "trong …" thay vì in "undefined"', () => {
    const item = make({ context: { available: true, muted: false } });

    expect(describeActivity(item).title).toBe('Minh yêu cầu bạn xác nhận đã đọc một thông báo');
  });

  it('mất quyền xem kênh → chỉ "Nội dung không còn khả dụng", không lộ tên người/kênh', () => {
    const item = make({
      actor: null,
      actorId: null,
      context: { available: false, muted: false },
      refs: null,
      scopeId: null,
      unavailable: true,
    });

    expect(describeActivity(item)).toEqual({ title: UNAVAILABLE_TITLE });
    expect(describeActivity({ ...item, type: 'announcement.reminder' })).toEqual({
      title: UNAVAILABLE_TITLE,
    });
  });
});

describe('inboxItemTarget → hrefForTarget — announcement.*', () => {
  it('phạm vi kênh + refs.messageId + workspaceId → kênh, mở đúng tin bằng `m`', () => {
    const target = inboxItemTarget(make({}));

    expect(target).toMatchObject({
      messageId: 'm-1',
      scopeId: 'ch-1',
      scopeType: 'CHANNEL',
      type: 'announcement.required',
      workspaceId: 'ws-1',
    });
    expect(hrefForTarget(target)).toEqual({
      params: { chId: 'ch-1', m: 'm-1', wsId: 'ws-1' },
      pathname: '/workspaces/[wsId]/channels/[chId]',
    });
  });

  it('announcement.reminder cùng đích với announcement.required', () => {
    expect(hrefForTarget(inboxItemTarget(make({ type: 'announcement.reminder' })))).toEqual({
      params: { chId: 'ch-1', m: 'm-1', wsId: 'ws-1' },
      pathname: '/workspaces/[wsId]/channels/[chId]',
    });
  });

  it('messageId cấp mục thắng refs.messageId (cùng quy ước với các loại tin nhắn)', () => {
    const target = inboxItemTarget(make({ messageId: 'tin-muc' }));

    expect(hrefForTarget(target)).toMatchObject({ params: { m: 'tin-muc' } });
  });

  it('workspaceId cấp mục thiếu → lấy refs.workspaceId (BE ghi cả hai)', () => {
    const item = make({ workspaceId: null });

    expect(hrefForTarget(inboxItemTarget(item))).toEqual({
      params: { chId: 'ch-1', m: 'm-1', wsId: 'ws-1' },
      pathname: '/workspaces/[wsId]/channels/[chId]',
    });
  });

  it('mục mất quyền (BE xoá refs/scopeId) → không dựng đích, nơi gọi hiện thông báo trung tính', () => {
    const item = make({ actorId: null, refs: null, scopeId: null, unavailable: true });

    expect(hrefForTarget(inboxItemTarget(item))).toBeNull();
  });
});
