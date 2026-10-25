import { shouldLockOnColdStart } from '../app-lock.policy';

/**
 * `shouldLockOnColdStart` — quyết định lúc MỞ APP LẠNH còn phiên sống, tách
 * khỏi `app-lock.policy.test.ts` (luận lý `checkLock` khi quay lại từ nền) để
 * mỗi file dưới trần 150 dòng.
 */
describe('shouldLockOnColdStart', () => {
  it('có gắn kết + công tắc bật ⇒ true', () => {
    expect(shouldLockOnColdStart({ appLockEnabled: true, hasBiometricBinding: true })).toBe(true);
  });

  it('không có gắn kết ⇒ false dù công tắc bật', () => {
    expect(shouldLockOnColdStart({ appLockEnabled: true, hasBiometricBinding: false })).toBe(false);
  });

  it('công tắc tắt ⇒ false dù có gắn kết', () => {
    expect(shouldLockOnColdStart({ appLockEnabled: false, hasBiometricBinding: true })).toBe(false);
  });
});
