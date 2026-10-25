import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  isValidScopedUserId,
  readScoped,
  removeAllForUser,
  removeScoped,
  scopedKey,
  scopePrefix,
  writeScoped,
} from '@/core/storage/session-scoped-storage';

/**
 * Kho `AsyncStorage` theo người dùng (`u:<userId>:<khoá>`, p0-12 README §2 "Dọn dữ liệu theo user"): xoá theo người dùng
 * KHÔNG được chạm khoá của người khác hay khoá của máy.
 */

const A = 'a1b2c3d4e5f60718293a4b5c';
const B = 'b1b2c3d4e5f60718293a4b5c';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('tên khoá', () => {
  it('tiền tố kết thúc bằng ":" để `u:ab:` không khớp `u:abc:…`', () => {
    expect(scopePrefix(A)).toBe(`u:${A}:`);
    expect(scopedKey(A, 'draft')).toBe(`u:${A}:draft`);
    expect(scopedKey('ab', 'x').startsWith(scopePrefix('abc'))).toBe(false);
  });

  it.each([
    [A, true],
    ['user_1-x', true],
    ['', false],
    ['a:b', false], // dấu ":" làm tiền tố trùm sang khoá người khác
    ['a b', false],
    ['a'.repeat(65), false],
    [null, false],
    [undefined, false],
  ])('isValidScopedUserId(%p) = %s', (id, expected) => {
    expect(isValidScopedUserId(id as string | null | undefined)).toBe(expected);
  });
});

describe('đọc / ghi / xoá một khoá', () => {
  it('ghi rồi đọc lại đúng người; người khác không thấy', async () => {
    await expect(writeScoped(A, 'draft', { text: 'nháp của A' })).resolves.toBe(true);

    await expect(readScoped(A, 'draft')).resolves.toEqual({ text: 'nháp của A' });
    await expect(readScoped(B, 'draft')).resolves.toBeNull();
  });

  it('id không hợp lệ: đọc null, ghi false, không chạm kho', async () => {
    await expect(writeScoped('a:b', 'x', 1)).resolves.toBe(false);
    await expect(readScoped(null, 'x')).resolves.toBeNull();
    await expect(AsyncStorage.getAllKeys()).resolves.toEqual([]);
  });

  it('removeScoped chỉ xoá đúng khoá', async () => {
    await writeScoped(A, 'one', 1);
    await writeScoped(A, 'two', 2);

    await removeScoped(A, 'one');

    await expect(readScoped(A, 'one')).resolves.toBeNull();
    await expect(readScoped(A, 'two')).resolves.toBe(2);
  });
});

describe('removeAllForUser (NT-07 / SHL-01)', () => {
  it('xoá MỌI khoá u:A:* — giữ khoá của B và khoá của máy', async () => {
    await writeScoped(A, 'draft', 1);
    await writeScoped(A, 'filters', 2);
    await writeScoped(B, 'draft', 3);
    await AsyncStorage.setItem('theme', '"dark"');

    await expect(removeAllForUser(A)).resolves.toBe(2);

    const left = (await AsyncStorage.getAllKeys()).slice().sort();
    expect(left).toEqual([scopedKey(B, 'draft'), 'theme'].sort());
  });

  it('không nhầm khoá của người có id là TIỀN TỐ của id khác', async () => {
    await writeScoped('ab', 'x', 1);
    await writeScoped('abc', 'x', 2);

    await removeAllForUser('ab');

    await expect(readScoped('abc', 'x')).resolves.toBe(2);
  });

  it('id không hợp lệ / null ⇒ 0, không xoá gì; không có khoá nào ⇒ 0', async () => {
    await writeScoped(A, 'draft', 1);

    await expect(removeAllForUser(null)).resolves.toBe(0);
    await expect(removeAllForUser('a:b')).resolves.toBe(0);
    await expect(removeAllForUser(B)).resolves.toBe(0);
    await expect(readScoped(A, 'draft')).resolves.toBe(1);
  });

  it('kho hỏng ⇒ KHÔNG ném (dọn phiên không được chết theo), trả 0', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const spy = jest.spyOn(AsyncStorage, 'getAllKeys').mockRejectedValueOnce(new Error('kho hỏng'));

    await expect(removeAllForUser(A)).resolves.toBe(0);

    spy.mockRestore();
    warn.mockRestore();
  });
});
