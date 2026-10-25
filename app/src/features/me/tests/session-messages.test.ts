import type { SessionSummary } from '@/core/api/auth';

import { maskIpAddress, sessionRevokeAccessibilityLabel } from '../constants/session.messages';

/**
 * IP rút gọn (p0-01 mục 3) + nhãn trợ năng của nút "Thu hồi" (mục 7). Đủ để nhận ra "không phải
 * mạng nhà mình" mà không phơi địa chỉ đầy đủ lên màn hình.
 */

describe('maskIpAddress', () => {
  it.each([
    ['203.0.113.45', '203.0.*.*'],
    ['192.168.1.10', '192.168.*.*'],
    // Express hay trả IPv4 bọc trong IPv6.
    ['::ffff:203.0.113.45', '203.0.*.*'],
    ['2001:db8:85a3::8a2e:370:7334', '2001:db8:…'],
    ['2001:db8:85a3:0:0:8a2e:370:7334', '2001:db8:…'],
    ['  10.1.2.3  ', '10.1.*.*'],
  ])('%s ⇒ %s', (raw, expected) => {
    expect(maskIpAddress(raw)).toBe(expected);
  });

  it.each([[null], [undefined], [''], ['   '], ['::1'], ['khong-phai-ip']])(
    '%p ⇒ null (không hiện, đừng đoán)',
    (raw) => {
      expect(maskIpAddress(raw)).toBeNull();
    },
  );

  it('⛔ kết quả KHÔNG chứa hai đoạn cuối của IPv4', () => {
    expect(maskIpAddress('203.0.113.45')).not.toMatch(/113|45/);
  });
});

describe('sessionRevokeAccessibilityLabel', () => {
  const base: SessionSummary = {
    authMethod: 'PASSWORD',
    createdAt: '2026-09-01T00:00:00.000Z',
    deviceId: 'd1',
    id: 's1',
    ipAddress: null,
    isCurrent: false,
    lastUsedAt: '2026-09-02T00:00:00.000Z',
    userAgent: 'okhttp/4.12.0',
  };

  it('nêu TÊN thiết bị để N nút "Thu hồi" phân biệt được nhau', () => {
    expect(sessionRevokeAccessibilityLabel(base)).toBe('Thu hồi phiên trên okhttp/4.12.0');
  });

  it('không có userAgent ⇒ rơi về nhãn phương thức đăng nhập', () => {
    expect(sessionRevokeAccessibilityLabel({ ...base, userAgent: null })).toBe(
      'Thu hồi phiên trên Mật khẩu',
    );
  });
});
