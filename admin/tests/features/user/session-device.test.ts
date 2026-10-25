/**
 * Mã thiết bị của phiên chỉ ra DOM ở dạng đã che. BE trả `deviceIdMasked` cho quản trị viên xem hộ
 * người khác và `deviceId` ĐẦY ĐỦ chỉ khi xem phiên của chính mình — `sessionDeviceLabel` là cổng duy
 * nhất từ hai trường đó ra giao diện.
 */
import { describe, expect, it } from 'vitest';

import { maskDeviceId, sessionDeviceLabel } from '@/features/user/utils/session-device';

describe('maskDeviceId', () => {
  it('che hết trừ 6 ký tự cuối, cùng quy ước với BE', () => {
    expect(maskDeviceId('android-device-FULL-ID-0123456789')).toBe('••••456789');
  });

  it('mã ngắn (≤ 6 ký tự) giữ nguyên phần đuôi, không cắt', () => {
    expect(maskDeviceId('abc')).toBe('••••abc');
    expect(maskDeviceId('abcdef')).toBe('••••abcdef');
  });
});

describe('sessionDeviceLabel', () => {
  it('ưu tiên bản BE đã che', () => {
    expect(sessionDeviceLabel({ deviceIdMasked: '••••a1b2c3', deviceId: 'dev-full-a1b2c3' })).toBe(
      '••••a1b2c3',
    );
  });

  it('chỉ có bản đầy đủ (xem phiên của chính mình) → che lại ở client, không bao giờ trả nguyên văn', () => {
    const label = sessionDeviceLabel({ deviceId: 'session-device-FULL-ID-9876543210' });
    expect(label).toBe('••••543210');
    expect(label).not.toContain('FULL-ID');
  });

  it('không có mã nào (phiên cũ) → null để UI bỏ dòng', () => {
    expect(sessionDeviceLabel({})).toBeNull();
    expect(sessionDeviceLabel({ deviceIdMasked: null, deviceId: null })).toBeNull();
    expect(sessionDeviceLabel({ deviceIdMasked: '  ', deviceId: '  ' })).toBeNull();
  });
});
