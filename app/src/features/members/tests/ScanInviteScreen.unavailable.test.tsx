import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { ScanInviteScreen } from '../screens/ScanInviteScreen';
import { renderWithProviders } from './test-utils';

/**
 * Bản dev client đang cài CHƯA build lại với plugin `expo-camera` ⇒ không có module native `ExpoCamera`, `expo-camera`
 * NÉM LỖI khi nạp, và `loadCameraModule` (bắt lỗi trong try/catch) trả `null`. Màn quét phải rơi về "chưa hỗ trợ quét
 * mã" chứ KHÔNG văng lỗi, và vẫn có lối sang nhập tay. Bản mock dưới đây mô phỏng đúng kết quả `null` đó — chính
 * `loadCameraModule` được test riêng ở `load-camera-module.test.ts`.
 *
 * ⚠️ Chuỗi import của file này (màn → hook → loader) CHẠY THẬT ở dòng `import` phía trên: file nào trong đó import tĩnh
 * `expo-camera` thì cũng bị `tests/expo-camera-lazy.test.ts` bắt.
 */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), dismissTo: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));
jest.mock('../utils/load-camera-module', () => ({ loadCameraModule: () => Promise.resolve(null) }));

beforeEach(() => jest.clearAllMocks());

describe('ScanInviteScreen — thiếu module native ExpoCamera', () => {
  it('KHÔNG văng lỗi: hiện "chưa hỗ trợ quét mã" và vẫn có lối sang nhập tay', async () => {
    await renderWithProviders(<ScanInviteScreen />);

    expect(
      await screen.findByText('Bản cài đặt này chưa hỗ trợ quét mã. Hãy nhập mã thủ công'),
    ).toBeOnTheScreen();
    expect(screen.getByText('Quét mã QR')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Nhập mã thủ công' }));
    expect(router.dismissTo).toHaveBeenCalledWith('/workspaces/join');
    expect(router.replace).not.toHaveBeenCalled();
  });
});
