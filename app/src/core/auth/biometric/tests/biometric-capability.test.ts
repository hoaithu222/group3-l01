import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

import { getBiometricCapability } from '../biometric-capability';

/**
 * `getBiometricCapability()` là điểm quyết định TOÀN BỘ UI sinh trắc học có
 * hiện hay không — sai ở đây là sai khắp app, và ⛔ nó KHÔNG BAO GIỜ được ném
 * lỗi (Expo Go, bản build thiếu module đều phải rơi về "không hỗ trợ").
 *
 * Bảng ánh xạ NHÃN theo nền tảng/loại cảm biến nằm ở
 * `biometric-capability.labels.test.ts` — tách để mỗi file dưới trần 150 dòng.
 */

const mockedHasHardware = jest.mocked(LocalAuthentication.hasHardwareAsync);
const mockedSupportedTypes = jest.mocked(LocalAuthentication.supportedAuthenticationTypesAsync);
const mockedCanUseBiometric = jest.mocked(SecureStore.canUseBiometricAuthentication);

beforeEach(() => {
  mockedHasHardware.mockReset();
  mockedHasHardware.mockResolvedValue(true);
  mockedSupportedTypes.mockReset();
  mockedSupportedTypes.mockResolvedValue([LocalAuthentication.AuthenticationType.FINGERPRINT]);
  mockedCanUseBiometric.mockReset();
  mockedCanUseBiometric.mockReturnValue(true);
});

describe('máy KHÔNG có cảm biến', () => {
  it('hasHardwareAsync=false ⇒ "không hỗ trợ", không hỏi thêm gì khác', async () => {
    mockedHasHardware.mockResolvedValue(false);

    const capability = await getBiometricCapability();

    expect(capability).toEqual({
      hasHardware: false,
      icon: 'lock',
      isUsable: false,
      kind: null,
      label: 'sinh trắc học',
    });
    expect(mockedSupportedTypes).not.toHaveBeenCalled();
  });
});

describe('lỗi native bất kỳ ⇒ luôn quy về "không hỗ trợ", KHÔNG BAO GIỜ ném', () => {
  it('hasHardwareAsync ném lỗi', async () => {
    mockedHasHardware.mockRejectedValue(new Error('Expo Go: module không tồn tại'));

    await expect(getBiometricCapability()).resolves.toMatchObject({
      hasHardware: false,
      isUsable: false,
      kind: null,
    });
  });

  it('supportedAuthenticationTypesAsync ném lỗi', async () => {
    mockedHasHardware.mockResolvedValue(true);
    mockedSupportedTypes.mockRejectedValue(new Error('driver lỗi'));

    await expect(getBiometricCapability()).resolves.toMatchObject({ hasHardware: false });
  });
});

describe('isUsable — từ SecureStore.canUseBiometricAuthentication(), KHÔNG phải isEnrolledAsync', () => {
  it('canUseBiometricAuthentication=false ⇒ isUsable=false dù có cảm biến', async () => {
    mockedHasHardware.mockResolvedValue(true);
    mockedSupportedTypes.mockResolvedValue([LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION]);
    mockedCanUseBiometric.mockReturnValue(false);

    const capability = await getBiometricCapability();

    expect(capability.hasHardware).toBe(true);
    expect(capability.isUsable).toBe(false);
  });
});
