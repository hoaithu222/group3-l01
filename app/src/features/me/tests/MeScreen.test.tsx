import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { registerProfileRow, resetProfileRows } from '@/shared/profile';
import { ListItem } from '@/shared/ui/list';
import { useAuthStore } from '@/shell/store/slices/auth';

import { MeScreen } from '../screens/MeScreen';
import { renderWithProviders } from './render-with-providers';

/**
 * Màn "Tôi": hồ sơ → nhóm "Hoạt động của tôi" (các lối vào thường dùng, kể cả hàng do feature khác đăng ký qua khe) → nhóm "Tài khoản" (Cài
 * đặt) → "Đăng xuất" ở CUỐI (khối đỏ rộng hết bề ngang, tách khỏi các lối vào) → phiên bản. Chỉ test HÀNH VI — NativeWind không có
 * trong Jest nên màu/căn lề không kiểm được.
 */
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

let mockFlags: Record<string, boolean> = {};
jest.mock('@/shell/capabilities', () => ({
  useFeature: (flag: string) => mockFlags[flag],
}));

const mockLogout = jest.fn();
jest.mock('@/shell/session/useLogout', () => ({
  useLogout: () => ({ isPending: false, logout: mockLogout }),
}));

jest.mock('@/core/config/env.config', () => ({ appConfig: { authEnabled: true } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.4.2' }));

beforeEach(() => {
  jest.clearAllMocks();
  mockFlags = {};
  resetProfileRows();
  useAuthStore.setState({
    user: {
      email: 'thu@gmail.com',
      id: 'u1',
      name: 'Thu Nguyễn',
      permissions: [],
      roles: ['Sinh viên'],
    },
  });
});

describe('MeScreen', () => {
  it('có hai nhóm có tiêu đề: "Hoạt động của tôi" và "Tài khoản"', async () => {
    await renderWithProviders(<MeScreen />);

    expect(screen.getByText('Hoạt động của tôi')).toBeOnTheScreen();
    expect(screen.getByText('Tài khoản')).toBeOnTheScreen();
    expect(screen.getByText('Thu Nguyễn')).toBeOnTheScreen();
    expect(screen.getByText('thu@gmail.com')).toBeOnTheScreen();
  });

  it('chưa đăng nhập: thẻ hồ sơ hiện "Khách" thay vì để trống', async () => {
    useAuthStore.setState({ user: null });
    await renderWithProviders(<MeScreen />);

    expect(screen.getByText('Khách')).toBeOnTheScreen();
    expect(screen.getByText('Chưa đăng nhập')).toBeOnTheScreen();
  });

  it('"Đã lưu" luôn có; Lịch họp / Học tập / Thành tích chỉ hiện khi cờ phân hệ bật', async () => {
    await renderWithProviders(<MeScreen />);
    expect(screen.getByText('Đã lưu')).toBeOnTheScreen();
    expect(screen.queryByText('Lịch họp')).toBeNull();
    expect(screen.queryByText('Học tập của tôi')).toBeNull();
    expect(screen.queryByText('Thành tích')).toBeNull();
  });

  it('bật cờ phân hệ thì hiện đủ, chạm một hàng thì mở đúng đường dẫn', async () => {
    mockFlags = { gamification: true, meeting: true, study: true };
    await renderWithProviders(<MeScreen />);

    await fireEvent.press(screen.getByText('Thành tích'));
    expect(router.push).toHaveBeenCalledWith('/me/achievements');
    await fireEvent.press(screen.getByText('Cài đặt'));
    expect(router.push).toHaveBeenCalledWith('/me/settings');
  });

  it('hàng do feature khác đăng ký qua khe `ProfileRowsSlot` nằm trong nhóm "Hoạt động của tôi"', async () => {
    registerProfileRow('test.row', () => <ListItem label="Cần chấm" onPress={() => undefined} />);
    await renderWithProviders(<MeScreen />);

    expect(screen.getByText('Cần chấm')).toBeOnTheScreen();
  });

  it('"Đăng xuất" là MỘT nút, gọi logout; phiên bản ứng dụng hiện ở chân màn', async () => {
    await renderWithProviders(<MeScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Phiên bản 1.4.2')).toBeOnTheScreen();
  });

  it('vai trò là nhãn (không bấm được), không phải Chip lọc', async () => {
    await renderWithProviders(<MeScreen />);

    expect(screen.getByText('Sinh viên')).toBeOnTheScreen();
    expect(screen.queryByRole('checkbox', { name: 'Sinh viên' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Sinh viên' })).toBeNull();
  });
});
