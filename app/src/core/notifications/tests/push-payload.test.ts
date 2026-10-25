import type { Notification } from 'expo-notifications';

import {
  extractPushData,
  isDataOnlyPushType,
  isScopeSuppressiblePushType,
  parsePushPayload,
} from '../push-payload.types';

/**
 * Payload push là dữ liệu KHÔNG đáng tin (FCM `data` do bất kỳ ai có khoá gửi đều điền được) — parse phải
 * chặt: thiếu `type`/`targetUserId` là bỏ, khoá lạ không lọt xuống router, giá trị không phải chuỗi bị bỏ.
 */

describe('parsePushPayload', () => {
  it('giữ type + targetUserId và các khoá đã biết', () => {
    expect(
      parsePushPayload({
        messageId: 'msg-1',
        scopeId: 'ch-1',
        scopeType: 'CHANNEL',
        targetUserId: 'u-1',
        type: 'mention',
        workspaceId: 'ws-1',
      }),
    ).toEqual({
      messageId: 'msg-1',
      scopeId: 'ch-1',
      scopeType: 'CHANNEL',
      targetUserId: 'u-1',
      type: 'mention',
      workspaceId: 'ws-1',
    });
  });

  it.each([
    ['thiếu type', { targetUserId: 'u-1' }],
    ['thiếu targetUserId', { type: 'mention' }],
    ['type rỗng', { targetUserId: 'u-1', type: '' }],
    ['undefined', undefined],
    ['null', null],
    ['mảng', ['type', 'mention']],
    ['chuỗi không phải JSON', 'không phải json'],
  ])('trả null khi %s', (_name, raw) => {
    expect(parsePushPayload(raw)).toBeNull();
  });

  it('bỏ khoá lạ — không cho payload tuỳ ý chạm tới router', () => {
    const payload = parsePushPayload({
      route: '/me/delete-account',
      targetUserId: 'u-1',
      type: 'message.new',
      url: 'https://evil.example',
    });
    expect(payload).toEqual({ targetUserId: 'u-1', type: 'message.new' });
  });

  it('bỏ giá trị không phải chuỗi (FCM data toàn chuỗi, số/bool là dấu hiệu payload lạ)', () => {
    const payload = parsePushPayload({
      count: 12,
      messageId: 'msg-1',
      targetUserId: 'u-1',
      type: 'message.new',
    });
    expect(payload).toEqual({ messageId: 'msg-1', targetUserId: 'u-1', type: 'message.new' });
  });

  it('nhận payload dạng chuỗi JSON (một số đường native trả `data` đã stringify)', () => {
    expect(parsePushPayload(JSON.stringify({ targetUserId: 'u-1', type: 'mention' }))).toEqual({
      targetUserId: 'u-1',
      type: 'mention',
    });
  });

  it('giữ nguyên loại lạ (Phase 3+) — router tự về /activity', () => {
    expect(parsePushPayload({ targetUserId: 'u-1', type: 'task.assigned' })?.type).toBe(
      'task.assigned',
    );
  });
});

describe('extractPushData', () => {
  function notification(content: unknown, trigger: unknown = null): Notification {
    return { request: { content, identifier: 'n-1', trigger } } as unknown as Notification;
  }

  it('ưu tiên content.data khi có payload của BE', () => {
    const data = { targetUserId: 'u-1', type: 'mention' };
    expect(extractPushData(notification({ data }))).toBe(data);
  });

  it('rơi về trigger.remoteMessage.data khi content.data không mang payload', () => {
    const remoteData = { targetUserId: 'u-1', type: 'mention' };
    const result = extractPushData(
      notification({ data: {} }, { remoteMessage: { data: remoteData }, type: 'push' }),
    );
    expect(result).toBe(remoteData);
  });

  it('rơi về trigger.payload (iOS) khi không có remoteMessage', () => {
    const payload = { targetUserId: 'u-1', type: 'mention' };
    expect(extractPushData(notification({ data: {} }, { payload, type: 'push' }))).toBe(payload);
  });
});

describe('phân loại loại push', () => {
  it('chỉ call.incoming | call.cancelled | call.answered-elsewhere là data-only', () => {
    expect(isDataOnlyPushType('call.incoming')).toBe(true);
    expect(isDataOnlyPushType('call.cancelled')).toBe(true);
    expect(isDataOnlyPushType('call.answered-elsewhere')).toBe(true);
    // call.missed CÓ hiển thị (be.md §6.2).
    expect(isDataOnlyPushType('call.missed')).toBe(false);
  });

  it('chỉ message.new và mention bị ẩn theo scope', () => {
    expect(isScopeSuppressiblePushType('message.new')).toBe(true);
    expect(isScopeSuppressiblePushType('mention')).toBe(true);
    expect(isScopeSuppressiblePushType('thread.reply')).toBe(false);
    expect(isScopeSuppressiblePushType('meeting.reminder')).toBe(false);
  });
});
