import * as SecureStore from 'expo-secure-store';

import { BiometricError } from '../biometric-error';
import { deleteSecret, readSecret, saveSecret } from '../biometric-vault';

const KEYCHAIN_SERVICE = 'superapp.biometric-login';
const SECRET_KEY = 'secret';

const mockedGetItem = jest.mocked(SecureStore.getItemAsync);
const mockedSetItem = jest.mocked(SecureStore.setItemAsync);
const mockedDeleteItem = jest.mocked(SecureStore.deleteItemAsync);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('saveSecret — luôn XOÁ bản cũ trước khi ghi mới', () => {
  it('gọi deleteItemAsync TRƯỚC setItemAsync, đúng keychainService', async () => {
    const callOrder: string[] = [];
    mockedDeleteItem.mockImplementation(async () => {
      callOrder.push('delete');
    });
    mockedSetItem.mockImplementation(async () => {
      callOrder.push('set');
    });

    await saveSecret('bi-mat-thiet-bi', 'Xác nhận bật đăng nhập bằng Face ID');

    expect(callOrder).toEqual(['delete', 'set']);
    expect(mockedDeleteItem).toHaveBeenCalledWith(
      SECRET_KEY,
      expect.objectContaining({ keychainService: KEYCHAIN_SERVICE }),
    );
    expect(mockedSetItem).toHaveBeenCalledWith(
      SECRET_KEY,
      'bi-mat-thiet-bi',
      expect.objectContaining({
        keychainService: KEYCHAIN_SERVICE,
        requireAuthentication: true,
        authenticationPrompt: 'Xác nhận bật đăng nhập bằng Face ID',
      }),
    );
  });

  it('lỗi xoá KHÔNG chặn việc ghi (deleteSecret không bao giờ ném)', async () => {
    mockedDeleteItem.mockRejectedValue(new Error('mục chưa từng tồn tại'));

    await expect(saveSecret('bi-mat', 'prompt')).resolves.toBeUndefined();
    expect(mockedSetItem).toHaveBeenCalledTimes(1);
  });
});

describe('readSecret — ánh xạ lỗi native → BiometricError', () => {
  it('đọc thành công ⇒ trả về đúng giá trị', async () => {
    mockedGetItem.mockResolvedValue('bi-mat-doc-duoc');

    await expect(readSecret('prompt')).resolves.toBe('bi-mat-doc-duoc');
  });

  it('null ⇒ BiometricError("invalidated") — cấu hình sinh trắc học trên máy đã đổi', async () => {
    mockedGetItem.mockResolvedValue(null);

    const error = await readSecret('prompt').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BiometricError);
    expect((error as BiometricError).code).toBe('invalidated');
  });

  it('lỗi có chữ "cancel" ⇒ BiometricError("cancelled")', async () => {
    mockedGetItem.mockRejectedValue(new Error('UserCancel: user tapped cancel button'));

    const error = await readSecret('prompt').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BiometricError);
    expect((error as BiometricError).code).toBe('cancelled');
  });

  it('lỗi có chữ "lockout" ⇒ BiometricError("lockout")', async () => {
    mockedGetItem.mockRejectedValue(new Error('Lockout: too many attempts'));

    const error = await readSecret('prompt').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BiometricError);
    expect((error as BiometricError).code).toBe('lockout');
  });

  it('lỗi lạ khác ⇒ BiometricError("failed")', async () => {
    mockedGetItem.mockRejectedValue(new Error('driver hỏng bất thường'));

    const error = await readSecret('prompt').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BiometricError);
    expect((error as BiometricError).code).toBe('failed');
  });

  it('So khớp KHÔNG phân biệt hoa/thường ("Cancel", "CANCEL"...)', async () => {
    mockedGetItem.mockRejectedValue(new Error('Authentication was CANCELLED by the user'));

    const error = await readSecret('prompt').catch((e: unknown) => e);

    expect((error as BiometricError).code).toBe('cancelled');
  });

  it('gọi getItemAsync với đúng authenticationPrompt truyền vào', async () => {
    mockedGetItem.mockResolvedValue('x');

    await readSecret('Đăng nhập Super App');

    expect(mockedGetItem).toHaveBeenCalledWith(
      SECRET_KEY,
      expect.objectContaining({ authenticationPrompt: 'Đăng nhập Super App' }),
    );
  });
});

describe('deleteSecret — không bao giờ ném, không hiện hộp quét', () => {
  it('xoá thành công', async () => {
    await expect(deleteSecret()).resolves.toBeUndefined();
    expect(mockedDeleteItem).toHaveBeenCalledWith(
      SECRET_KEY,
      expect.objectContaining({ keychainService: KEYCHAIN_SERVICE }),
    );
  });

  it('lỗi khi xoá ⇒ nuốt êm, KHÔNG ném lại', async () => {
    mockedDeleteItem.mockRejectedValue(new Error('Keystore hỏng'));

    await expect(deleteSecret()).resolves.toBeUndefined();
  });

  it('options KHÔNG có requireAuthentication — xoá không được hiện hộp quét', async () => {
    await deleteSecret();

    const options = mockedDeleteItem.mock.calls[0]?.[1];
    expect(options).not.toHaveProperty('requireAuthentication');
    expect(options).not.toHaveProperty('authenticationPrompt');
  });
});
