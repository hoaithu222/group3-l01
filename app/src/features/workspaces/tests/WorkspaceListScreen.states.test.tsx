import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AxiosError } from 'axios';

import { workspacesService } from '../api';
import { WorkspaceListBody } from '../components/WorkspaceListBody';
import { WorkspaceListScreen } from '../screens/WorkspaceListScreen';
import { listItem, renderWithProviders } from './test-utils';

/**
 * Trạng thái của màn "Nhóm" (app.md p1-01 §3): khối "Đang chờ duyệt / Yêu thích / Tất cả", tìm theo tên không dấu, lỗi lần
 * đầu (mất kết nối ≠ lỗi máy chủ) và — lỗi đã sửa — lần tải lại hỏng KHÔNG được giấu danh sách đang có.
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../hooks/useWorkspaceSocket', () => ({ useWorkspaceSocket: jest.fn() }));
jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return { ...actual, workspacesService: { ...actual.workspacesService, list: jest.fn() } };
});

const mockedList = jest.mocked(workspacesService.list);
const networkError = () => new AxiosError('Network Error', 'ERR_NETWORK');
const serverError = () =>
  new AxiosError('HTTP 500', 'ERR_BAD_RESPONSE', undefined, undefined, {
    config: {} as never,
    data: { error: { code: 'SYS_001', message: 'Lỗi hệ thống' }, success: false },
    headers: {},
    status: 500,
    statusText: '',
  });

const ITEMS = [
  listItem({ id: 'p', name: 'Nhóm Hoá 10' }),
  listItem({ id: 'f', isFavorite: true, name: 'Nhóm Toán 12', status: 'ACTIVE' }),
  listItem({ id: 'a', name: 'Nhóm Lý 11', status: 'ACTIVE', unreadCount: 2 }),
];

beforeEach(() => jest.clearAllMocks());

describe('WorkspaceListScreen — khối và tìm kiếm', () => {
  it('chia khối có SỐ thẻ: chờ duyệt · yêu thích · nhóm khác; dòng tóm tắt nói số nhóm đã vào + có tin mới', async () => {
    mockedList.mockResolvedValue(ITEMS);
    await renderWithProviders(<WorkspaceListScreen />);

    expect(await screen.findByText('Đang chờ duyệt (1)')).toBeOnTheScreen();
    expect(screen.getByText('Yêu thích (1)')).toBeOnTheScreen();
    expect(screen.getByText('Nhóm khác (1)')).toBeOnTheScreen();
    expect(screen.getByText('Đang tham gia 2 nhóm · 1 nhóm có tin mới')).toBeOnTheScreen();
    expect(screen.getByText('2 kênh có tin mới')).toBeOnTheScreen();
  });

  it('gõ "toan" (không dấu) ⇒ MỘT khối "Kết quả (1)" chỉ có "Nhóm Toán 12"; không khớp ⇒ "Không có kết quả"', async () => {
    mockedList.mockResolvedValue(ITEMS);
    await renderWithProviders(<WorkspaceListScreen />);
    await screen.findByText('Nhóm Lý 11');

    await fireEvent.changeText(screen.getByPlaceholderText('Tìm nhóm'), 'toan');

    expect(await screen.findByText('Kết quả (1)')).toBeOnTheScreen();
    expect(screen.getByText('Nhóm Toán 12')).toBeOnTheScreen();
    expect(screen.queryByText('Nhóm Lý 11')).toBeNull();
    expect(screen.queryByText('Yêu thích (1)')).toBeNull();

    await fireEvent.changeText(screen.getByPlaceholderText('Tìm nhóm'), 'sinh hoc');
    expect(await screen.findByText('Không có kết quả')).toBeOnTheScreen();
  });

  it('bấm thẻ chờ duyệt mở màn chờ; thẻ thường mở tổng quan nhóm', async () => {
    const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');
    mockedList.mockResolvedValue(ITEMS);
    await renderWithProviders(<WorkspaceListScreen />);

    await fireEvent.press(await screen.findByText('Nhóm Hoá 10'));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/workspaces/pending',
      params: { wsId: 'p' },
    });

    await fireEvent.press(screen.getByText('Nhóm Lý 11'));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/workspaces/[wsId]',
      params: { wsId: 'a' },
    });
  });
});

describe('WorkspaceListScreen — lỗi lần đầu (chưa có bản nào)', () => {
  it('mất mạng ⇒ "Mất kết nối" (không phải app hỏng); "Thử lại" gọi lại API', async () => {
    mockedList.mockRejectedValueOnce(networkError()).mockResolvedValueOnce(ITEMS);
    await renderWithProviders(<WorkspaceListScreen />);

    expect(await screen.findByText('Mất kết nối')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Thử lại'));

    expect(await screen.findByText('Nhóm Lý 11')).toBeOnTheScreen();
    expect(mockedList).toHaveBeenCalledTimes(2);
  });

  it('lỗi máy chủ ⇒ "Không tải được danh sách nhóm"', async () => {
    mockedList.mockRejectedValue(serverError());
    await renderWithProviders(<WorkspaceListScreen />);

    expect(await screen.findByText('Không tải được danh sách nhóm')).toBeOnTheScreen();
  });
});

describe('WorkspaceListBody — tải lại hỏng khi ĐÃ có danh sách', () => {
  it('GIỮ danh sách cũ, chỉ thêm một dòng báo + "Thử lại" (trước đây cả danh sách bị thay bằng khối lỗi)', async () => {
    const onRetry = jest.fn();
    await render(
      <WorkspaceListBody
        items={ITEMS}
        refreshError={networkError()}
        onJoin={jest.fn()}
        onOpen={jest.fn()}
        onRetry={onRetry}
        onScan={jest.fn()}
      />,
    );

    expect(screen.getByText('Nhóm Lý 11')).toBeOnTheScreen();
    expect(screen.getByText('Mất kết nối — đang hiện danh sách đã lưu.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Thử lại'));
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
  });

  it('không lỗi ⇒ không có dòng báo', async () => {
    await render(
      <WorkspaceListBody
        items={ITEMS}
        refreshError={null}
        onJoin={jest.fn()}
        onOpen={jest.fn()}
        onRetry={jest.fn()}
        onScan={jest.fn()}
      />,
    );

    expect(screen.queryByText(/đang hiện/)).toBeNull();
  });
});
