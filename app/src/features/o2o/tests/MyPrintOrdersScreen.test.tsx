import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { printService } from '../api/print.service';
import { MyPrintOrdersScreen } from '../screens/MyPrintOrdersScreen';
import { apiError, makeOrder, renderWithProviders } from './o2o-test-utils';

/** "Đơn in của tôi": ba nhóm theo trạng thái (mỗi nhóm một danh sách cursor), trạng thái bằng CHỮ, rỗng có lối đi tiếp, lỗi mạng ≠ lỗi khác. */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual('react-native').FlatList,
}));
jest.mock('../api/print.service', () => ({
  ORDERS_PAGE_SIZE: 20,
  printService: { list: jest.fn() },
}));

const service = jest.mocked(printService);
const page = (items: ReturnType<typeof makeOrder>[], nextCursor: string | null = null) => ({
  items,
  meta: { nextCursor, hasMore: nextCursor !== null, limit: 20 },
});

beforeEach(() => {
  jest.clearAllMocks();
  service.list.mockResolvedValue(page([]));
});

describe('MyPrintOrdersScreen', () => {
  it('nhóm "Đang xử lý" mặc định: mã, trạng thái bằng chữ, tiệm, tệp, tổng tiền; chạm → vé đơn', async () => {
    service.list.mockResolvedValue(
      page([
        makeOrder(),
        makeOrder({
          id: 'ord-2',
          code: 'PO-AB12CD',
          status: 'READY',
          fileName: 'de-cuong.pdf',
          quote: null,
        }),
      ]),
    );
    await renderWithProviders(<MyPrintOrdersScreen />);

    expect(await screen.findByText('PO-7K2M9Q')).toBeOnTheScreen();
    expect(service.list).toHaveBeenCalledWith('ACTIVE', undefined);
    expect(screen.getByText('Chờ tiệm nhận')).toBeOnTheScreen();
    expect(screen.getByText('Sẵn sàng nhận')).toBeOnTheScreen();
    expect(screen.getByText('bao-cao.pdf')).toBeOnTheScreen();
    expect(screen.getByText(/21\.600 VND · /)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: /PO-7K2M9Q/ }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/me/o2o/print/[orderId]',
      params: { orderId: 'ord-1' },
    });
  });

  it('đổi tab gọi ĐÚNG nhóm (DONE / CLOSED); mỗi nhóm giữ danh sách riêng', async () => {
    service.list.mockImplementation(async (group) =>
      page(
        group === 'DONE'
          ? [makeOrder({ id: 'ord-3', code: 'PO-DONE01', status: 'PICKED_UP' })]
          : group === 'CLOSED'
            ? [makeOrder({ id: 'ord-4', code: 'PO-CLOSE1', status: 'REJECTED' })]
            : [makeOrder()],
      ),
    );
    await renderWithProviders(<MyPrintOrdersScreen />);
    await screen.findByText('PO-7K2M9Q');

    await fireEvent.press(screen.getByRole('tab', { name: 'Hoàn tất' }));
    expect(await screen.findByText('PO-DONE01')).toBeOnTheScreen();
    expect(service.list).toHaveBeenCalledWith('DONE', undefined);
    expect(screen.getByText('Đã nhận tài liệu')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('tab', { name: 'Đã huỷ' }));
    expect(await screen.findByText('PO-CLOSE1')).toBeOnTheScreen();
    expect(service.list).toHaveBeenCalledWith('CLOSED', undefined);
    expect(screen.getByText('Tiệm từ chối')).toBeOnTheScreen();
  });

  it('rỗng → "Chưa có đơn in" + lối "Tìm tiệm in" sang bản đồ', async () => {
    await renderWithProviders(<MyPrintOrdersScreen />);

    expect(await screen.findByText('Chưa có đơn in')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tìm tiệm in' }));
    expect(router.push).toHaveBeenCalledWith('/me/o2o/map');
  });

  it('nhóm khác rỗng thì không có nút "Tìm tiệm in" (chỉ nhóm đang xử lý mới cần)', async () => {
    await renderWithProviders(<MyPrintOrdersScreen />);
    await screen.findByText('Chưa có đơn in');

    await fireEvent.press(screen.getByRole('tab', { name: 'Hoàn tất' }));
    expect(await screen.findByText('Chưa có đơn hoàn tất')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Tìm tiệm in' })).toBeNull();
  });

  it('cuộn tới cuối → tải trang kế bằng cursor', async () => {
    service.list.mockResolvedValueOnce(page([makeOrder()], 'cursor-2'));
    service.list.mockResolvedValueOnce(page([makeOrder({ id: 'ord-5', code: 'PO-PAGE02' })]));
    await renderWithProviders(<MyPrintOrdersScreen />);
    await screen.findByText('PO-7K2M9Q');

    await fireEvent(
      screen.getByRole('button', { name: /PO-7K2M9Q/ }).parent?.parent as never,
      'endReached',
    );
    await waitFor(() => expect(service.list).toHaveBeenCalledWith('ACTIVE', 'cursor-2'));
  });

  it('lỗi mạng → "Thử lại" tải lại; lỗi 500 cũng có nút thử lại', async () => {
    service.list.mockRejectedValueOnce(
      Object.assign(new Error('Network Error'), { isAxiosError: true }),
    );
    await renderWithProviders(<MyPrintOrdersScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Chưa có đơn in')).toBeOnTheScreen();
    expect(service.list).toHaveBeenCalledTimes(2);
  });

  it('lỗi 500 → hiện lỗi + Thử lại', async () => {
    service.list.mockRejectedValue(apiError(500, 'SYS_500'));
    await renderWithProviders(<MyPrintOrdersScreen />);

    expect(await screen.findByRole('button', { name: 'Thử lại' })).toBeOnTheScreen();
  });
});
