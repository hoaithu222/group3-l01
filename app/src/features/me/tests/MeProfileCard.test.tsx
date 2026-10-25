import { screen } from '@testing-library/react-native';

import { useAuthStore } from '@/shell/store/slices/auth';

import { MeProfileCard } from '../components/MeProfileCard';
import { renderWithProviders } from './render-with-providers';

/**
 * Thẻ hồ sơ: hàng huy hiệu vai trò gọn — bỏ trùng/rỗng, quá 3 thì gộp "+N" có nhãn đọc được. Quầng sáng/sao là trang trí
 * (ẩn khỏi trình đọc, vòng lặp không chạy trong Jest) nên chỉ kiểm chữ + nhãn.
 */
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

function signIn(roles: string[]) {
  useAuthStore.setState({
    user: { email: 'thu@gmail.com', id: 'u1', name: 'Thu Nguyễn', permissions: [], roles },
  });
}

describe('MeProfileCard', () => {
  it('bỏ vai trùng/rỗng; quá 3 vai thì gộp phần còn lại thành "+N" có nhãn "và N vai trò khác"', async () => {
    signIn(['Sinh viên', 'Sinh viên', ' ', 'Mentor', 'Kiểm duyệt', 'Quản trị', 'Giảng viên']);
    await renderWithProviders(<MeProfileCard />);

    expect(screen.getAllByText('Sinh viên')).toHaveLength(1);
    expect(screen.getByText('Mentor')).toBeOnTheScreen();
    expect(screen.getByText('Kiểm duyệt')).toBeOnTheScreen();
    expect(screen.queryByText('Quản trị')).toBeNull();
    expect(screen.getByLabelText('và 2 vai trò khác')).toBeOnTheScreen();
  });

  it('không có vai trò ⇒ không vẽ hàng huy hiệu; tên + email vẫn hiện', async () => {
    signIn([]);
    await renderWithProviders(<MeProfileCard />);

    expect(screen.getByText('Thu Nguyễn')).toBeOnTheScreen();
    expect(screen.getByText('thu@gmail.com')).toBeOnTheScreen();
    expect(screen.queryByText(/^\+\d+$/)).toBeNull();
  });
});
