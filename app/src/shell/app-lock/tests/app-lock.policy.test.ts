import { __resetLockDeferrersForTests } from '../lock-deferrers';
import { checkLock } from '../app-lock.policy';

/**
 * `checkLock` — luận lý THUẦN của khoá ứng dụng lúc app quay lại `active` sau
 * khi đã ở `background` (P1), CHƯA tính deferrer. `shouldLockOnColdStart`
 * (mở app lạnh) nằm ở `app-lock.policy.cold-start.test.ts`; các ca DEFERRER
 * (hoãn khoá) nằm ở `app-lock.policy.deferrer.test.ts` — tách để mỗi file
 * dưới trần 150 dòng (`docs/rules/code-style.md`).
 *
 * BIO-16 (`app.md` §8): nền ≥ ngưỡng ⇒ lock; `inactive` bị bỏ qua (chốt ở
 * `AppLockBoundary`, không phải ở đây — file này chỉ nhận `backgroundedAt`,
 * nghĩa là ai gọi nó phải TỰ quyết định có ghi nhận `inactive` hay không);
 * không có gắn kết sinh trắc học ⇒ skip.
 */

beforeEach(() => {
  __resetLockDeferrersForTests();
});

const BASE_NOW = 1_700_000_000_000;

it('không có gắn kết sinh trắc học ⇒ skip, dù đủ mọi điều kiện khác', () => {
  const decision = checkLock({
    appLockEnabled: true,
    backgroundedAt: BASE_NOW - 600_000,
    hasBiometricBinding: false,
    lockAfterBackgroundSeconds: 300,
    now: BASE_NOW,
  });
  expect(decision).toBe('skip');
});

it('appLockEnabled=false ⇒ skip', () => {
  const decision = checkLock({
    appLockEnabled: false,
    backgroundedAt: BASE_NOW - 600_000,
    hasBiometricBinding: true,
    lockAfterBackgroundSeconds: 300,
    now: BASE_NOW,
  });
  expect(decision).toBe('skip');
});

it('chưa từng ở nền (backgroundedAt=null) ⇒ skip', () => {
  const decision = checkLock({
    appLockEnabled: true,
    backgroundedAt: null,
    hasBiometricBinding: true,
    lockAfterBackgroundSeconds: 300,
    now: BASE_NOW,
  });
  expect(decision).toBe('skip');
});

it('nền CHƯA đủ ngưỡng ⇒ skip', () => {
  const decision = checkLock({
    appLockEnabled: true,
    backgroundedAt: BASE_NOW - 100_000, // 100s < 300s
    hasBiometricBinding: true,
    lockAfterBackgroundSeconds: 300,
    now: BASE_NOW,
  });
  expect(decision).toBe('skip');
});

it('nền ĐỦ ngưỡng, không deferrer nào ⇒ lock', () => {
  const decision = checkLock({
    appLockEnabled: true,
    backgroundedAt: BASE_NOW - 300_000, // đúng 300s
    hasBiometricBinding: true,
    lockAfterBackgroundSeconds: 300,
    now: BASE_NOW,
  });
  expect(decision).toBe('lock');
});

it('nền VƯỢT ngưỡng ⇒ lock', () => {
  const decision = checkLock({
    appLockEnabled: true,
    backgroundedAt: BASE_NOW - 3_600_000,
    hasBiometricBinding: true,
    lockAfterBackgroundSeconds: 300,
    now: BASE_NOW,
  });
  expect(decision).toBe('lock');
});

