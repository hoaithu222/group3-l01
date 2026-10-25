import { registerLockDeferrer, __resetLockDeferrersForTests } from '../lock-deferrers';
import { checkLock } from '../app-lock.policy';

/**
 * BIO-17 (`app.md` §8): `checkLock` khi có DEFERRER đăng ký "đừng khoá ngay
 * bây giờ" (vd p2-02: đang trong một cuộc gọi). Các nhánh `skip`/`lock` không
 * liên quan deferrer nằm ở `app-lock.policy.test.ts` — tách để mỗi file dưới
 * trần 150 dòng.
 */

beforeEach(() => {
  __resetLockDeferrersForTests();
});

const BASE_NOW = 1_700_000_000_000;
const READY_TO_LOCK = {
  appLockEnabled: true,
  backgroundedAt: BASE_NOW - 300_000,
  hasBiometricBinding: true,
  lockAfterBackgroundSeconds: 300,
  now: BASE_NOW,
};

it('deferrer đăng ký trả true ⇒ defer, KHÔNG khoá', () => {
  registerLockDeferrer('call', () => true);

  expect(checkLock(READY_TO_LOCK)).toBe('defer');
});

it('deferrer trả false ⇒ vẫn lock bình thường', () => {
  registerLockDeferrer('call', () => false);

  expect(checkLock(READY_TO_LOCK)).toBe('lock');
});

it('deferrer huỷ đăng ký (unregister) ⇒ không còn ảnh hưởng', () => {
  const unregister = registerLockDeferrer('call', () => true);
  unregister();

  expect(checkLock(READY_TO_LOCK)).toBe('lock');
});

it('một deferrer NÉM LỖI không được chặn cơ chế khoá — coi như trả false', () => {
  registerLockDeferrer('hong', () => {
    throw new Error('deferrer hỏng');
  });

  expect(checkLock(READY_TO_LOCK)).toBe('lock');
});

it('nhiều deferrer, CHỈ MỘT trả true ⇒ vẫn defer', () => {
  registerLockDeferrer('a', () => false);
  registerLockDeferrer('b', () => true);
  registerLockDeferrer('c', () => false);

  expect(checkLock(READY_TO_LOCK)).toBe('defer');
});
