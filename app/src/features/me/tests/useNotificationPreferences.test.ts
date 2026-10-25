import type { AccountNotificationPreference } from '@/core/notifications';

import { applyPreferencePatch } from '../hooks/useNotificationPreferences';

/**
 * `applyPreferencePatch` — giá trị lạc quan phải khớp cách BE tính `AccountPreferenceView`: trường vừa chọn
 * thôi là "mặc định", trường không đụng giữ nguyên.
 */

const BASE: AccountNotificationPreference = {
  channelMode: 'MENTIONS_AND_THREADS',
  directMode: 'ALL',
  dndUntil: null,
  groupMode: 'MENTIONS_AND_THREADS',
  isDefault: {
    channelMode: true,
    directMode: true,
    groupMode: true,
    lockScreenPreview: true,
    sound: true,
  },
  lockScreenPreview: 'HIDDEN',
  sound: true,
};

describe('applyPreferencePatch', () => {
  it('đổi lockScreenPreview: giá trị mới, isDefault của đúng trường đó thành false', () => {
    const next = applyPreferencePatch(BASE, { lockScreenPreview: 'FULL' });
    expect(next.lockScreenPreview).toBe('FULL');
    expect(next.isDefault.lockScreenPreview).toBe(false);
    expect(next.isDefault.sound).toBe(true);
    expect(next.directMode).toBe('ALL');
  });

  it('không đổi bản gốc (cache React Query không được sửa tại chỗ)', () => {
    applyPreferencePatch(BASE, { lockScreenPreview: 'FULL', sound: false });
    expect(BASE.lockScreenPreview).toBe('HIDDEN');
    expect(BASE.isDefault.lockScreenPreview).toBe(true);
  });

  it('dndUntil: đặt và tắt (null) — null là giá trị hợp lệ, không phải "không đổi"', () => {
    const on = applyPreferencePatch(BASE, { dndUntil: '2026-09-21T10:00:00.000Z' });
    expect(on.dndUntil).toBe('2026-09-21T10:00:00.000Z');

    const off = applyPreferencePatch(on, { dndUntil: null });
    expect(off.dndUntil).toBeNull();
  });

  it('sound: false vẫn được áp (không bị coi là "không gửi")', () => {
    expect(applyPreferencePatch(BASE, { sound: false }).sound).toBe(false);
  });

  it('bản vá rỗng → giữ nguyên giá trị', () => {
    expect(applyPreferencePatch(BASE, {})).toEqual(BASE);
  });
});
