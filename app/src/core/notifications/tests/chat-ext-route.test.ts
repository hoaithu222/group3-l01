import { hrefForTarget } from '../notification-route';
import { decidePushTap, resolvePushHref } from '../push-router';
import { parsePushPayload } from '../push-payload.types';
import { inboxItemTarget } from '@/features/activity/utils/inbox-target';
import type { InboxItem } from '../inbox.types';

/**
 * p7-04: chạm thông báo `scheduled-message.failed` / `message.reminder` (BE `chat-extensions-notification-types.ts`: `dataKeys` chỉ có id, KHÔNG nội dung tin/tên kênh).
 */
describe('chat-ext-route — hrefForTarget', () => {
  it('scheduled-message.failed → "Tin đã hẹn" kèm ?id= (tab Lỗi, tô đúng dòng); thiếu id → chỉ mở danh sách', () => {
    expect(hrefForTarget({ scheduledMessageId: 's-1', type: 'scheduled-message.failed' })).toEqual({ params: { id: 's-1' }, pathname: '/me/scheduled-messages' });
    expect(hrefForTarget({ type: 'scheduled-message.failed' })).toBe('/me/scheduled-messages');
  });

  it('message.reminder ở HỘI THOẠI → mở đúng tin (?m=)', () => {
    expect(hrefForTarget({ messageId: 'm-1', scopeId: 'cv-1', scopeType: 'CONVERSATION', type: 'message.reminder' })).toEqual({
      params: { conversationId: 'cv-1', m: 'm-1' },
      pathname: '/messages/[conversationId]',
    });
  });

  it('message.reminder ở KÊNH (push không mang workspaceId) → "Nhắc lại của tôi"', () => {
    expect(hrefForTarget({ messageId: 'm-1', scopeId: 'ch-1', scopeType: 'CHANNEL', type: 'message.reminder' })).toBe('/me/reminders');
  });

  it('message.reminder `unavailable` (tin đã gỡ/mất quyền, không có messageId) → "Nhắc lại của tôi", không mở tin', () => {
    expect(hrefForTarget({ scopeId: 'cv-1', scopeType: 'CONVERSATION', type: 'message.reminder', unavailable: true })).toBe('/me/reminders');
    expect(hrefForTarget({ messageId: 'm-1', scopeId: 'cv-1', scopeType: 'CONVERSATION', type: 'message.reminder', unavailable: true })).toBe('/me/reminders');
  });
});

describe('chat-ext-route — đường push', () => {
  it('parsePushPayload giữ reminderId/scheduledMessageId/unavailable; `"true"` (chuỗi FCM) → unavailable', () => {
    const payload = parsePushPayload({ reminderId: 'r-1', scheduledMessageId: 's-1', targetUserId: 'u-1', type: 'message.reminder', unavailable: 'true' });
    expect(payload).toMatchObject({ reminderId: 'r-1', scheduledMessageId: 's-1', unavailable: 'true' });
    expect(resolvePushHref(payload!)).toBe('/me/reminders');
  });

  it('chạm push tin hẹn giờ lỗi → điều hướng tới "Tin đã hẹn"; push của người khác bị bỏ', () => {
    const payload = parsePushPayload({ scheduledMessageId: 's-9', targetUserId: 'u-1', type: 'scheduled-message.failed' });
    expect(decidePushTap(payload, { authenticated: true, userId: 'u-1' })).toEqual({
      href: { params: { id: 's-9' }, pathname: '/me/scheduled-messages' },
      kind: 'navigate',
    });
    expect(decidePushTap(payload, { authenticated: true, userId: 'u-2' })).toMatchObject({ kind: 'ignored', reason: 'other-user' });
  });

  it('push nhắc lại hội thoại còn đọc được → tin đích', () => {
    const payload = parsePushPayload({ messageId: 'm-5', reminderId: 'r-1', scopeId: 'cv-2', scopeType: 'CONVERSATION', targetUserId: 'u-1', type: 'message.reminder' });
    expect(resolvePushHref(payload!)).toEqual({ params: { conversationId: 'cv-2', m: 'm-5' }, pathname: '/messages/[conversationId]' });
  });
});

describe('chat-ext-route — hộp thư Hoạt động (InboxItem.refs)', () => {
  const item = (overrides: Partial<InboxItem>): InboxItem => ({ messageId: null, refs: {}, scopeId: null, scopeType: null, threadId: null, type: 'message.reminder', unavailable: false, workspaceId: null, ...overrides }) as InboxItem;

  it('refs.reminderId/scheduledMessageId/unavailable đi vào đích; unavailable vắng mặt khi không có (không phải false)', () => {
    const target = inboxItemTarget(item({ refs: { reminderId: 'r-1', unavailable: true } }));
    expect(target).toMatchObject({ reminderId: 'r-1', unavailable: true });
    expect(hrefForTarget(target)).toBe('/me/reminders');
    expect(inboxItemTarget(item({ refs: {} })).unavailable).toBeUndefined();
    expect(hrefForTarget(inboxItemTarget(item({ refs: { scheduledMessageId: 's-3' }, type: 'scheduled-message.failed' })))).toEqual({
      params: { id: 's-3' },
      pathname: '/me/scheduled-messages',
    });
  });
});
