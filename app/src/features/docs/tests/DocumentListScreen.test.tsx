import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { useConnectionState, useSocketEvent } from '@/core/socket';
import { docsService } from '../api/docs.service';
import { DocumentListScreen } from '../screens/DocumentListScreen';
import { apiError, DOC_ID, makeDocView, renderWithProviders, WS_ID } from './docs.harness';

/**
 * app.md p6-01 §3 dòng "Danh sách", §4, §8: rỗng/có dữ liệu/lỗi, tìm ở SERVER (debounce), tab Đang dùng/Lưu trữ, khách và ngoại tuyến không có nút tạo,
 * `document:updated` (socket) vá danh sách.
 */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual('react-native').FlatList,
}));
jest.mock('@/core/socket', () => ({
  SocketEvent: { DOCUMENT_UPDATED: 'document:updated' },
  useConnectionState: jest.fn(() => 'connected'),
  useSocketEvent: jest.fn(),
}));
jest.mock('../api/docs.service', () => ({
  docsService: {
    archive: jest.fn(),
    create: jest.fn(),
    list: jest.fn(),
    unarchive: jest.fn(),
    update: jest.fn(),
    workspaceAccess: jest.fn(),
  },
}));

const service = jest.mocked(docsService);
const page = (...items: ReturnType<typeof makeDocView>[]) => ({ items, nextCursor: null });

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue({ wsId: WS_ID });
  jest.mocked(useConnectionState).mockReturnValue('connected');
  service.workspaceAccess.mockResolvedValue({
    canCreate: true,
    myRole: 'MEMBER',
    status: 'ACTIVE',
  });
  service.list.mockResolvedValue(page());
});

describe('trạng thái', () => {
  it('rỗng → lời mời tạo tài liệu đầu tiên (có nút Tạo khi được phép)', async () => {
    await renderWithProviders(<DocumentListScreen />);
    expect(await screen.findByText('Chưa có tài liệu — tạo báo cáo đầu tiên')).toBeOnTheScreen();
    expect(await screen.findAllByText('Tạo tài liệu')).not.toHaveLength(0);
  });

  it('có dữ liệu → hàng đọc đủ tiêu đề · chế độ · người sửa; chạm mở màn soạn thảo', async () => {
    service.list.mockResolvedValue(
      page(
        makeDocView({ title: 'Kế hoạch quý 4', visibility: 'PRIVATE' }),
        makeDocView({ id: 'd2', myRole: 'VIEWER', title: 'Tài liệu người khác' }),
      ),
    );
    await renderWithProviders(<DocumentListScreen />);

    expect(await screen.findByText('Kế hoạch quý 4')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: /Kế hoạch quý 4\. Chỉ người được mời/ }),
    ).toBeOnTheScreen();
    expect(screen.getAllByText('Chỉ xem')).toHaveLength(1);
    await fireEvent.press(screen.getByRole('button', { name: /^Kế hoạch quý 4./ }));
    expect(router.push).toHaveBeenCalledWith({
      params: { docId: DOC_ID, wsId: WS_ID },
      pathname: '/workspaces/[wsId]/docs/[docId]',
    });
  });

  it('lỗi → khối lỗi + Thử lại tải lại', async () => {
    service.list
      .mockRejectedValueOnce(apiError(500, 'SYS_001'))
      .mockResolvedValueOnce(page(makeDocView()));
    await renderWithProviders(<DocumentListScreen />);
    expect(await screen.findByText('Không tải được danh sách tài liệu')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Báo cáo tuần 3')).toBeOnTheScreen();
  });

  it('khách (canCreate=false) hoặc ngoại tuyến → không có nút "Tạo tài liệu"', async () => {
    service.workspaceAccess.mockResolvedValue({
      canCreate: false,
      myRole: 'GUEST',
      status: 'ACTIVE',
    });
    const view = await renderWithProviders(<DocumentListScreen />);
    await screen.findByText('Chưa có tài liệu — tạo báo cáo đầu tiên');
    expect(screen.queryByText('Tạo tài liệu')).toBeNull();
    await view.unmount();

    service.workspaceAccess.mockResolvedValue({
      canCreate: true,
      myRole: 'MEMBER',
      status: 'ACTIVE',
    });
    jest.mocked(useConnectionState).mockReturnValue('offline');
    await renderWithProviders(<DocumentListScreen />);
    expect(await screen.findByText(/Đang ngoại tuyến/)).toBeOnTheScreen();
    expect(screen.queryByText('Tạo tài liệu')).toBeNull();
  });
});

describe('tìm và lọc (server)', () => {
  it('gõ từ khoá → sau debounce gửi `q` lên server', async () => {
    await renderWithProviders(<DocumentListScreen />);
    await screen.findByText('Chưa có tài liệu — tạo báo cáo đầu tiên');
    await fireEvent.changeText(screen.getByPlaceholderText('Tìm theo tiêu đề'), 'kế hoạch');
    await waitFor(
      () =>
        expect(service.list).toHaveBeenCalledWith(
          WS_ID,
          { q: 'kế hoạch', status: 'ACTIVE' },
          undefined,
        ),
      { timeout: 2000 },
    );
    expect(await screen.findByText('Không tìm thấy tài liệu nào')).toBeOnTheScreen();
  });

  it('tab "Lưu trữ" → status=ARCHIVED, rỗng có câu riêng và KHÔNG có nút tạo', async () => {
    await renderWithProviders(<DocumentListScreen />);
    await screen.findByText('Chưa có tài liệu — tạo báo cáo đầu tiên');
    await fireEvent.press(screen.getByRole('tab', { name: 'Lưu trữ' }));
    expect(await screen.findByText('Chưa có tài liệu lưu trữ')).toBeOnTheScreen();
    expect(service.list).toHaveBeenLastCalledWith(WS_ID, { q: '', status: 'ARCHIVED' }, undefined);
    expect(screen.queryByText('Tạo tài liệu')).toBeNull();
  });
});

describe('socket document:updated', () => {
  it('đổi tên từ máy khác → hàng cập nhật ngay; lưu trữ → hàng biến khỏi tab Đang dùng', async () => {
    service.list.mockResolvedValue(page(makeDocView()));
    await renderWithProviders(<DocumentListScreen />);
    await screen.findByText('Báo cáo tuần 3');
    const handler = jest
      .mocked(useSocketEvent)
      .mock.calls.find(([event]) => event === 'document:updated')?.[1] as (
      payload: unknown,
    ) => void;
    const base = {
      id: DOC_ID,
      lastEditedAt: null,
      status: 'ACTIVE',
      title: 'Báo cáo tuần 4',
      version: 4,
      visibility: 'WORKSPACE',
      workspaceId: WS_ID,
    };

    await act(async () => handler(base));
    expect(await screen.findByText('Báo cáo tuần 4')).toBeOnTheScreen();
    await act(async () => handler({ ...base, status: 'ARCHIVED', version: 5 }));
    await waitFor(() => expect(screen.queryByText('Báo cáo tuần 4')).toBeNull());
  });
});
