import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useNetworkStatus } from '@/shared/hooks/use-network-status';

import { CreateWorkspaceScreen } from '../screens/CreateWorkspaceScreen';
import { CREATED, fillName, mockedCreate, submit } from './create-harness';
import { renderWithProviders } from './test-utils';

/**
 * Form TẠO NHÓM — phần giao diện (app.md p1-01 §3): thẻ xem trước đổi theo từng chữ, câu lỗi riêng cho ô TRỐNG, bộ đếm ký
 * tự, khoá form khi đang gửi và nút "Kết nối lại để tạo" khi mất mạng. Idempotency/mẫu: hai file `CreateWorkspaceScreen.*` kia.
 */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));
jest.mock('@/shell/capabilities', () => ({ useCapabilities: () => ({ data: undefined }) }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/shared/hooks/use-network-status', () => ({ useNetworkStatus: jest.fn() }));
jest.mock('../api/workspaces.service', () => ({ workspacesService: { create: jest.fn() } }));

const mockedNetwork = jest.mocked(useNetworkStatus);

beforeEach(() => {
  jest.clearAllMocks();
  mockedCreate.mockReset().mockResolvedValue(CREATED);
  mockedNetwork.mockReturnValue({ isOnline: true } as ReturnType<typeof useNetworkStatus>);
});

describe('CreateWorkspaceScreen — xem trước + kiểm tra form', () => {
  it('thẻ xem trước đổi theo tên/mô tả đang gõ; bộ đếm ký tự cạnh nhãn', async () => {
    await renderWithProviders(<CreateWorkspaceScreen />);
    expect(screen.getByLabelText('Xem trước thẻ nhóm: chưa có tên')).toBeOnTheScreen();
    expect(screen.getByText('Tên nhóm của bạn')).toBeOnTheScreen();

    await fillName('Lớp 12A1');
    await fireEvent.changeText(
      screen.getByPlaceholderText('Nhóm này dùng để làm gì? (không bắt buộc)'),
      'Trao đổi bài tập',
    );

    expect(screen.getByLabelText('Xem trước thẻ nhóm: Lớp 12A1')).toBeOnTheScreen();
    expect(screen.getByText('Trao đổi bài tập')).toBeOnTheScreen();
    expect(screen.getByText('8/80')).toBeOnTheScreen();
  });

  it('bấm Tạo khi tên TRỐNG ⇒ "Nhập tên nhóm" (không phải "tối thiểu 2 ký tự"), không gọi API', async () => {
    await renderWithProviders(<CreateWorkspaceScreen />);

    await submit();

    expect(await screen.findByText('Nhập tên nhóm')).toBeOnTheScreen();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('tên 1 ký tự ⇒ "Tên nhóm tối thiểu 2 ký tự"', async () => {
    await renderWithProviders(<CreateWorkspaceScreen />);
    await fillName('A');

    await submit();

    expect(await screen.findByText('Tên nhóm tối thiểu 2 ký tự')).toBeOnTheScreen();
  });

  it('mất mạng ⇒ nút "Kết nối lại để tạo" bị khoá, không gửi được', async () => {
    mockedNetwork.mockReturnValue({ isOnline: false } as ReturnType<typeof useNetworkStatus>);
    await renderWithProviders(<CreateWorkspaceScreen />);
    await fillName('Nhóm A');

    const button = screen.getByRole('button', { name: 'Kết nối lại để tạo' });
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('đang gửi ⇒ ô tên bị khoá (sửa giữa chừng là đổi khoá idempotency) và nút báo bận', async () => {
    mockedCreate.mockReturnValue(new Promise(() => undefined));
    await renderWithProviders(<CreateWorkspaceScreen />);
    await fillName('Nhóm A');

    await submit();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Tạo nhóm' })).toBeBusy());
    expect(screen.getByPlaceholderText('Ví dụ: Nhóm dự án A').props.editable).toBe(false);
  });
});
