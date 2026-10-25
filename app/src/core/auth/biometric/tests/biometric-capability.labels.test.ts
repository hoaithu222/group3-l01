import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { getBiometricCapability } from '../biometric-capability';

/**
 * Bảng ánh xạ NHÃN + `kind` theo nền tảng/loại cảm biến — tách khỏi
 * `biometric-capability.test.ts` (nhánh không có cảm biến/lỗi native/`isUsable`)
 * để mỗi file dưới trần 150 dòng.
 */

const mockedHasHardware = jest.mocked(LocalAuthentication.hasHardwareAsync);
const mockedSupportedTypes = jest.mocked(LocalAuthentication.supportedAuthenticationTypesAsync);
const mockedCanUseBiometric = jest.mocked(SecureStore.canUseBiometricAuthentication);

const originalOS = Platform.OS;

function setPlatform(os: 'android' | 'ios'): void {
  Object.defineProperty(Platform, 'OS', { get: () => os });
}

beforeEach(() => {
  mockedHasHardware.mockReset();
  mockedHasHardware.mockResolvedValue(true);
  mockedSupportedTypes.mockReset();
  mockedCanUseBiometric.mockReset();
  mockedCanUseBiometric.mockReturnValue(true);
});

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { get: () => originalOS });
});

it('iOS + FACIAL_RECOGNITION ⇒ "Face ID", icon faceid', async () => {
  setPlatform('ios');
  mockedSupportedTypes.mockResolvedValue([LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION]);

  const capability = await getBiometricCapability();

  expect(capability.label).toBe('Face ID');
  expect(capability.icon).toBe('faceid');
  expect(capability.kind).toBe('FACE');
});

it('iOS + FINGERPRINT ⇒ "Touch ID"', async () => {
  setPlatform('ios');
  mockedSupportedTypes.mockResolvedValue([LocalAuthentication.AuthenticationType.FINGERPRINT]);

  const capability = await getBiometricCapability();

  expect(capability.label).toBe('Touch ID');
  expect(capability.kind).toBe('FINGERPRINT');
  // Đồng bộ chéo #14: vân tay có icon riêng (`touchid`), không còn rơi về `lock`.
  expect(capability.icon).toBe('touchid');
});

it('Android + chỉ vân tay ⇒ "vân tay"', async () => {
  setPlatform('android');
  mockedSupportedTypes.mockResolvedValue([LocalAuthentication.AuthenticationType.FINGERPRINT]);

  const capability = await getBiometricCapability();

  expect(capability.label).toBe('vân tay');
  expect(capability.kind).toBe('FINGERPRINT');
  expect(capability.icon).toBe('touchid');
});

it('Android + chỉ khuôn mặt ⇒ "khuôn mặt"', async () => {
  setPlatform('android');
  mockedSupportedTypes.mockResolvedValue([LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION]);

  const capability = await getBiometricCapability();

  expect(capability.label).toBe('khuôn mặt');
});

/**
 * ⛔ Ca quan trọng nhất của bảng ưu tiên — Android báo CẢ HAI loại (máy có cả
 * cảm biến vân tay lẫn mở khoá khuôn mặt) phải ưu tiên VÂN TAY, vì mở khoá
 * khuôn mặt trên Android thường chỉ là mức YẾU (`app.md` §2.2).
 */
it('Android + cả vân tay lẫn khuôn mặt ⇒ ưu tiên "vân tay"', async () => {
  setPlatform('android');
  mockedSupportedTypes.mockResolvedValue([
    LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
    LocalAuthentication.AuthenticationType.FINGERPRINT,
  ]);

  const capability = await getBiometricCapability();

  expect(capability.label).toBe('vân tay');
  expect(capability.kind).toBe('FINGERPRINT');
});

it('mống mắt ⇒ "mống mắt"', async () => {
  setPlatform('android');
  mockedSupportedTypes.mockResolvedValue([LocalAuthentication.AuthenticationType.IRIS]);

  const capability = await getBiometricCapability();

  expect(capability.label).toBe('mống mắt');
  expect(capability.kind).toBe('IRIS');
});
