import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { workspacesService } from '../api';
import { WorkspaceListScreen } from '../screens/WorkspaceListScreen';
import { listItem, renderWithProviders } from './test-utils';

/**
 * Lối vào "Tham gia nhóm" trên màn Nhóm: dòng trong menu "⋯" ở AppBar (luôn có), hai nút phụ ở đầu danh sách khi đã có nhóm
 * ("Tham gia bằng mã" + ô "Quét mã QR") và hành động phụ "Tham gia bằng mã" ở trạng thái "Chưa có nhóm nào". AppBar chỉ có
 * HAI khe: "Tạo nhóm" (icon) + menu "⋯" chứa "Tham gia nhóm", "Quét mã QR" và "Lời mời của tôi".
 * Màn đích nằm ở feature `members` — màn Nhóm chỉ điều hướng bằng ĐƯỜNG DẪN (không import chéo).
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../hooks/useWorkspaceSocket', () => ({ useWorkspaceSocket: jest.fn() }));
jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return { ...actual, workspacesService: { ...actual.workspacesService, list: jest.fn() } };
});

const mockedList = jest.mocked(workspacesService.list);
const MENU_LABEL = 'Thêm tuỳ chọn cho danh sách nhóm';

beforeEach(() => jest.clearAllMocks());

describe('WorkspaceListScreen — lối vào tham gia nhóm', () => {
  it('menu "⋯" ở AppBar có "Tham gia nhóm" ngay cả khi đã có nhóm; chọn thì mở màn tham gia', async () => {
    mockedList.mockResolvedValue([listItem({ id: 'ws-1', name: 'Nhóm Lý 11', status: 'ACTIVE' })]);
    await renderWithProviders(<WorkspaceListScreen />);

    expect(await screen.findByText('Nhóm Lý 11')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: MENU_LABEL }));
    await fireEvent.press(await screen.findByText('Tham gia nhóm'));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/workspaces/join'));
    // Đã có nhóm thì trạng thái rỗng không hiện (lối vào phụ chuyển lên đầu danh sách — ca dưới).
    expect(screen.queryByText('Chưa có nhóm nào')).toBeNull();
  });

  it('đã có nhóm: đầu danh sách có "Tham gia bằng mã" + nút "Quét mã QR" luôn nhìn thấy; menu "⋯" cũng có "Quét mã QR"', async () => {
    mockedList.mockResolvedValue([listItem({ id: 'ws-1', name: 'Nhóm Lý 11', status: 'ACTIVE' })]);
    await renderWithProviders(<WorkspaceListScreen />);
    await screen.findByText('Nhóm Lý 11');

    await fireEvent.press(screen.getByRole('button', { name: 'Tham gia bằng mã' }));
    expect(router.push).toHaveBeenLastCalledWith('/workspaces/join');

    await fireEvent.press(screen.getByRole('button', { name: 'Quét mã QR để tham gia nhóm' }));
    expect(router.push).toHaveBeenLastCalledWith('/workspaces/scan');

    await fireEvent.press(screen.getByRole('button', { name: MENU_LABEL }));
    await fireEvent.press(await screen.findByText('Quét mã QR'));
    await waitFor(() => expect(router.push).toHaveBeenCalledTimes(3));
    expect(router.push).toHaveBeenLastCalledWith('/workspaces/scan');
  });

  it('"Chưa có nhóm nào": hành động phụ "Tham gia bằng mã" (đứng TRƯỚC "Tạo nhóm") mở màn tham gia', async () => {
    mockedList.mockResolvedValue([]);
    await renderWithProviders(<WorkspaceListScreen />);

    expect(await screen.findByText('Chưa có nhóm nào')).toBeOnTheScreen();
    const labels = screen.getAllByRole('button').map((button) => button.props.accessibilityLabel);
    expect(labels.slice(-2)).toEqual(['Tham gia bằng mã', 'Tạo nhóm']);

    await fireEvent.press(screen.getByText('Tham gia bằng mã'));
    expect(router.push).toHaveBeenLastCalledWith('/workspaces/join');
  });

  it('"Tạo nhóm" và "Lời mời của tôi" vẫn mở đúng màn của chúng (không bị lối vào mới làm lệch)', async () => {
    mockedList.mockResolvedValue([]);
    await renderWithProviders(<WorkspaceListScreen />);
    await screen.findByText('Chưa có nhóm nào');

    await fireEvent.press(screen.getByText('Tạo nhóm'));
    expect(router.push).toHaveBeenLastCalledWith('/workspaces/new');

    await fireEvent.press(screen.getByRole('button', { name: MENU_LABEL }));
    await fireEvent.press(await screen.findByText('Lời mời của tôi'));
    await waitFor(() =>
      expect(router.push).toHaveBeenLastCalledWith({ pathname: '/workspaces/invitations' }),
    );
  });

  it('AppBar chỉ có HAI điều khiển bên phải: icon "Tạo nhóm" và menu "⋯" (không còn ba icon rời)', async () => {
    mockedList.mockResolvedValue([listItem({ id: 'ws-1', name: 'Nhóm Lý 11', status: 'ACTIVE' })]);
    await renderWithProviders(<WorkspaceListScreen />);
    await screen.findByText('Nhóm Lý 11');

    expect(screen.getByRole('button', { name: 'Tạo nhóm' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: MENU_LABEL })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Lời mời của tôi' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tham gia nhóm' })).toBeNull();
  });
});
