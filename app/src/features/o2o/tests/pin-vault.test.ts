import * as SecureStore from 'expo-secure-store';

import { clearPin, pinKey, readPin, savePin } from '../utils/pin-vault';

/**
 * Két PIN: khoá hợp lệ với SecureStore (chữ, số, `.`, `-`, `_` — KHÔNG có `:`), tách theo người dùng, PIN hỏng bị từ chối, dự phòng trong phiên khi kho khoá
 * từ chối ghi, và xoá sạch cả hai nơi.
 */
const store = jest.mocked(SecureStore);

describe('pin-vault', () => {
  afterEach(() => jest.restoreAllMocks());

  beforeEach(async () => {
    // Kho khoá lỗi được GHI LOG cảnh báo (`secure-storage`) — nuốt ở đây cho đầu ra test sạch; ca dưới kiểm hành vi chứ không kiểm log.
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await clearPin('u1', 'ord-1');
    await clearPin('u2', 'ord-1');
  });

  it('khoá SecureStore CHỈ có ký tự hợp lệ (app.md ghi `o2o:pin:…` — dấu `:` bị SecureStore từ chối)', () => {
    expect(pinKey('u1', 'ord-1')).toBe('o2o.pin.u1.ord-1');
    expect(pinKey('u1', 'ord-1')).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it('id chứa ký tự lạ (`:`, dấu cách, rỗng) bị từ chối — không ghi, không đọc', async () => {
    expect(pinKey('u:1', 'ord-1')).toBeNull();
    expect(pinKey('u1', 'ord 1')).toBeNull();
    expect(pinKey('', 'ord-1')).toBeNull();
    expect(await savePin('u:1', 'ord-1', '482913')).toBe(false);
    expect(await readPin('u:1', 'ord-1')).toBeNull();
  });

  it('cất rồi đọc lại; xoá thì hết', async () => {
    expect(await savePin('u1', 'ord-1', '482913')).toBe(true);
    expect(await readPin('u1', 'ord-1')).toBe('482913');
    await clearPin('u1', 'ord-1');
    expect(await readPin('u1', 'ord-1')).toBeNull();
  });

  it('PIN theo NGƯỜI DÙNG: người khác trên cùng máy không đọc được', async () => {
    await savePin('u1', 'ord-1', '482913');
    expect(await readPin('u2', 'ord-1')).toBeNull();
  });

  it('chỉ nhận đúng 6 chữ số (BE sinh 6 số) — giá trị hỏng không được cất, cũng không được đọc ra', async () => {
    expect(await savePin('u1', 'ord-1', '12345')).toBe(false);
    expect(await savePin('u1', 'ord-1', 'abcdef')).toBe(false);
    store.getItemAsync.mockResolvedValueOnce('không-phải-pin');
    expect(await readPin('u1', 'ord-1')).toBeNull();
  });

  it('kho khoá từ chối ghi → trả false nhưng PIN vẫn còn TRONG PHIÊN (màn vé không hiện "Tạo PIN mới" oan)', async () => {
    store.setItemAsync.mockRejectedValueOnce(new Error('Keystore hỏng'));
    expect(await savePin('u1', 'ord-1', '482913')).toBe(false);
    expect(await readPin('u1', 'ord-1')).toBe('482913'); // đọc từ bản nhớ tạm
    await clearPin('u1', 'ord-1');
    expect(await readPin('u1', 'ord-1')).toBeNull(); // xoá cả bản nhớ tạm
  });

  it('kho khoá không đọc được (ném lỗi) → coi như chưa có, không sập', async () => {
    store.getItemAsync.mockRejectedValueOnce(new Error('Keychain khoá'));
    expect(await readPin('u1', 'ord-9')).toBeNull();
  });
});
