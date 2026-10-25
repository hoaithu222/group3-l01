/**
 * Hàm thuần của phân hệ `moderation`: ma trận hành động theo loại đích × quyền, nhãn phạm vi (KHÔNG
 * lộ tên riêng tư) và đích quay lại chỉ nhận đường dẫn nội bộ.
 */
import { describe, expect, it } from 'vitest';

import { availableActions } from '@/features/moderation/utils/report-actions';
import {
  reportDetailPath,
  returnPathFrom,
  scopeLabel,
} from '@/features/moderation/utils/report-links';
import type { AdminReportGroup } from '@/features/moderation/types/moderation.types';

type Target = Pick<AdminReportGroup, 'targetType' | 'scope'>;

const message: Target = { targetType: 'MESSAGE', scope: { type: 'CHANNEL', isPrivate: false } };
const user: Target = { targetType: 'USER', scope: { type: null, isPrivate: false } };
const publicChannel: Target = {
  targetType: 'CHANNEL',
  scope: { type: 'CHANNEL', isPrivate: false },
};
const privateChannel: Target = {
  targetType: 'CHANNEL',
  scope: { type: 'CHANNEL', isPrivate: true },
};
const groupChat: Target = {
  targetType: 'CONVERSATION',
  scope: { type: 'CONVERSATION', isPrivate: true },
};

const FULL = { canUpdate: true, canLockUser: true };

describe('availableActions', () => {
  it('đủ quyền: mỗi loại đích chỉ có hành động hợp lệ, "Bỏ qua" luôn đứng cuối', () => {
    expect(availableActions(message, FULL)).toEqual([
      'REMOVE_CONTENT',
      'WARN_AUTHOR',
      'LOCK_AUTHOR',
      'DISMISS',
    ]);
    expect(availableActions(user, FULL)).toEqual(['WARN_AUTHOR', 'LOCK_AUTHOR', 'DISMISS']);
    expect(availableActions(publicChannel, FULL)).toEqual(['ARCHIVE_CHANNEL', 'DISMISS']);
    expect(availableActions(privateChannel, FULL)).toEqual(['DISMISS']);
    expect(availableActions(groupChat, FULL)).toEqual(['DISSOLVE_CONVERSATION', 'DISMISS']);
  });

  it('thiếu user:update → không bao giờ có LOCK_AUTHOR', () => {
    const noUserUpdate = { canUpdate: true, canLockUser: false };
    for (const target of [message, user, publicChannel, privateChannel, groupChat]) {
      expect(availableActions(target, noUserUpdate)).not.toContain('LOCK_AUTHOR');
    }
    expect(availableActions(message, noUserUpdate)).toContain('WARN_AUTHOR');
  });

  it('thiếu moderation:update → không hành động nào (kể cả có user:update)', () => {
    expect(availableActions(message, { canUpdate: false, canLockUser: true })).toEqual([]);
  });
});

describe('scopeLabel — không lộ tên phạm vi riêng tư', () => {
  it('chỉ kênh public có tên; kênh riêng tư/nhóm chat/1-1 chỉ là nhãn dù payload mang tên', () => {
    const workspace = { id: 'w', name: 'Nhóm Alpha' };
    expect(
      scopeLabel({
        targetType: 'MESSAGE',
        scope: { type: 'CHANNEL', isPrivate: false, name: 'general' },
        workspace,
      }),
    ).toBe('#general');
    expect(
      scopeLabel({
        targetType: 'MESSAGE',
        scope: { type: 'CHANNEL', isPrivate: true, name: 'bí-mật' },
        workspace,
      }),
    ).toBe('Kênh riêng tư');
    expect(
      scopeLabel({
        targetType: 'MESSAGE',
        scope: { type: 'CONVERSATION', isPrivate: true, name: 'nhóm-kín' },
        workspace,
      }),
    ).toBe('Nhóm chat');
    expect(
      scopeLabel({
        targetType: 'MESSAGE',
        scope: { type: 'CONVERSATION', isPrivate: true, name: 'nhóm-kín' },
      }),
    ).toBe('Tin nhắn 1-1');
    expect(scopeLabel({ targetType: 'USER', scope: { type: null, isPrivate: false } })).toBe('—');
  });
});

describe('returnPathFrom / reportDetailPath', () => {
  it('chỉ nhận đường dẫn nội bộ; còn lại về fallback', () => {
    expect(returnPathFrom({ from: '/moderation?status=RESOLVED' }, '/moderation')).toBe(
      '/moderation?status=RESOLVED',
    );
    expect(returnPathFrom({ from: '//evil.example.com' }, '/moderation')).toBe('/moderation');
    expect(returnPathFrom({ from: 'https://evil.example.com' }, '/moderation')).toBe('/moderation');
    expect(returnPathFrom({ from: 42 }, '/moderation')).toBe('/moderation');
    expect(returnPathFrom(null, '/moderation')).toBe('/moderation');
    expect(returnPathFrom(undefined, '/moderation')).toBe('/moderation');
  });

  it('mã hoá id đưa vào đường dẫn', () => {
    expect(reportDetailPath('a/b?c#d')).toBe('/moderation/a%2Fb%3Fc%23d');
  });
});
