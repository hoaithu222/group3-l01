import { checkLock } from '../app-lock.policy';

/**
 * Khoá ứng dụng chỉ bảo vệ một PHIÊN SỐNG. Đăng xuất thường GIỮ gắn kết sinh trắc học (p0-13 §2),
 * nên "đã gắn kết + quá 5 phút ở nền" vẫn đúng khi đã đăng xuất — không kiểm phiên thì lớp phủ
 * "Mở khoá để tiếp tục" đè lên màn Đăng nhập.
 */

const BASE = {
  appLockEnabled: true,
  backgroundedAt: 0,
  hasBiometricBinding: true,
  lockAfterBackgroundSeconds: 300,
  now: 301_000,
} as const;

describe('checkLock — phiên', () => {
  it('có phiên + đủ điều kiện ⇒ lock', () => {
    expect(checkLock({ ...BASE, isAuthenticated: true })).toBe('lock');
  });

  it('CHƯA đăng nhập (đã đăng xuất, còn gắn kết) ⇒ skip dù ở nền quá ngưỡng', () => {
    expect(checkLock({ ...BASE, isAuthenticated: false })).toBe('skip');
  });

  it('không truyền `isAuthenticated` ⇒ giữ hành vi cũ (coi như có phiên)', () => {
    expect(checkLock({ ...BASE })).toBe('lock');
  });
});
