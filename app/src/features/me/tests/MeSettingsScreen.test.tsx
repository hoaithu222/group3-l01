import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useThemeStore } from '@/shell/store/slices/theme';

import { MeSettingsScreen } from '../screens/MeSettingsScreen';
import { renderWithProviders } from './render-with-providers';

/**
 * Cài đặt: nhóm theo chủ đề (Thông báo · Giao diện · Bảo mật · Quyền riêng tư), việc PHÁ HUỶ (xoá tài khoản) tách riêng ở
 * cuối bằng hàng đỏ — không lẫn giữa các hàng bảo mật cùng kiểu. Chỉ test HÀNH VI (NativeWind không có trong Jest).
 */
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));

let mockIntegration = false;
jest.mock('@/shell/capabilities', () => ({
  useCapabilities: () => ({ data: undefined }),
  useFeature: (flag: string) => (flag === 'integration' ? mockIntegration : undefined),
}));
jest.mock('@/shared/hooks/useBiometricCapability', () => ({
  useBiometricCapability: () => ({ data: { hasHardware: false } }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockIntegration = false;
  useThemeStore.setState({ preference: 'system' });
});

describe('MeSettingsScreen', () => {
  it('các thẻ theo chủ đề', async () => {
    await renderWithProviders(<MeSettingsScreen />);

    for (const title of [
      'Thông báo và kết nối',
      'Giao diện',
      'Bảo mật',
      'Quyền riêng tư',
    ]) {
      expect(screen.getByText(title)).toBeOnTheScreen();
    }
    // p0-12: trang `/demo` (thư viện component) đã gỡ — không còn mục "Nhà phát triển".
    expect(screen.queryByText('Nhà phát triển')).toBeNull();
    expect(screen.queryByText('Thư viện component')).toBeNull();
  });

  it('"Người đã chặn" nằm trong thẻ Quyền riêng tư và mở đúng màn', async () => {
    await renderWithProviders(<MeSettingsScreen />);

    await fireEvent.press(screen.getByText('Người đã chặn'));
    expect(router.push).toHaveBeenCalledWith('/me/blocked');
  });

  it('"Xoá tài khoản" là hàng riêng ở cuối (thẻ đỏ tách khỏi các hàng bảo mật), mở màn xoá', async () => {
    await renderWithProviders(<MeSettingsScreen />);

    await fireEvent.press(screen.getByText('Xoá tài khoản'));
    expect(router.push).toHaveBeenCalledWith('/me/delete-account');
  });

  it('Giao diện: ba thẻ chọn Sáng / Tối / Theo hệ thống, chọn thẻ nào thì lưu đúng chế độ', async () => {
    await renderWithProviders(<MeSettingsScreen />);

    for (const name of ['Sáng', 'Tối', 'Theo hệ thống']) {
      expect(screen.getByRole('radio', { name })).toBeOnTheScreen();
    }
    await fireEvent.press(screen.getByRole('radio', { name: 'Tối' }));
    expect(useThemeStore.getState().preference).toBe('dark');
    expect(screen.getByRole('radio', { name: 'Tối' })).toBeSelected();
  });

  it('Google Calendar chỉ hiện khi cờ `integration` bật', async () => {
    await renderWithProviders(<MeSettingsScreen />);
    expect(screen.queryByText('Google Calendar')).toBeNull();
  });

  it('cờ `integration` bật → hàng Google Calendar mở màn tích hợp cá nhân', async () => {
    mockIntegration = true;
    await renderWithProviders(<MeSettingsScreen />);

    await fireEvent.press(screen.getByText('Google Calendar'));
    expect(router.push).toHaveBeenCalledWith('/me/integrations');
  });

  it('"Thông báo" mở màn cài đặt thông báo', async () => {
    await renderWithProviders(<MeSettingsScreen />);

    await fireEvent.press(screen.getByText('Thông báo'));
    expect(router.push).toHaveBeenCalledWith('/me/notifications');
  });
});
