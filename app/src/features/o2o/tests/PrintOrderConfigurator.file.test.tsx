import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { locationsService } from '../api/locations.service';
import { resourcePickerService } from '../api/resource-picker.service';
import { PrintOrderConfiguratorScreen } from '../screens/PrintOrderConfiguratorScreen';
import {
  COUNTING,
  idleUpload,
  params,
  resetConfiguratorMocks,
  service,
} from './configurator-test-kit';
import { apiError, makeNear, makeShop, renderWithProviders } from './o2o-test-utils';

/** Màn cấu hình đơn in — bước TỆP (Resource Hub / tải lên / picker nhóm), đơn nháp, đếm trang, và trạng thái TIỆM. Số trang tới qua socket — mô phỏng bằng `setQueryData`. */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('@/shared/hooks/use-network-status', () => ({ useNetworkStatus: jest.fn() }));
jest.mock('../hooks/usePrintUpload', () => ({ usePrintUpload: jest.fn() }));
jest.mock('../api/locations.service', () => ({
  REVIEWS_PAGE_SIZE: 10,
  locationsService: { near: jest.fn() },
}));
jest.mock('../api/resource-picker.service', () => ({
  PICKER_MIN_QUERY: 2,
  PICKER_PAGE_SIZE: 30,
  resourcePickerService: { workspaces: jest.fn(), pdfs: jest.fn() },
}));
jest.mock('../api/print.service', () => ({
  ORDERS_PAGE_SIZE: 20,
  printService: {
    shop: jest.fn(),
    quote: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    get: jest.fn(),
    submit: jest.fn(),
    cancel: jest.fn(),
  },
}));

beforeEach(resetConfiguratorMocks);

describe('bước tệp → đơn nháp → đếm trang', () => {
  it('vào từ Resource Hub: tạo đơn NHÁP đúng MỘT lần với nguồn RESOURCE + Idempotency-Key; hiện "Đang đếm trang…"', async () => {
    await renderWithProviders(<PrintOrderConfiguratorScreen />);

    expect(await screen.findByText('Slide tuần 3.pdf')).toBeOnTheScreen();
    await waitFor(() => expect(service.create).toHaveBeenCalledTimes(1));
    expect(service.create).toHaveBeenCalledWith(
      { shopId: 'shop-1', source: { kind: 'RESOURCE', resourceId: 'res-1' } },
      expect.stringMatching(/^print-order-.{8,}/),
    );
    expect(await screen.findByText('Đang đếm trang…')).toBeOnTheScreen();
    // Chưa có số trang thì chưa báo giá và nút Gửi khoá.
    expect(screen.getByText('Sẽ có báo giá ngay khi đếm xong số trang.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Gửi đơn' })).toBeDisabled();
    expect(service.quote).not.toHaveBeenCalled();
  });

  it('tệp tải lên (PDF đã READY) → nguồn UPLOAD theo assetId', async () => {
    params.mockReturnValue({ shopId: 'shop-1' });
    idleUpload({
      assetId: 'asset-9',
      item: { name: 'bao-cao.pdf', status: 'ready' } as never,
    });
    await renderWithProviders(<PrintOrderConfiguratorScreen />);

    await waitFor(() => expect(service.create).toHaveBeenCalledTimes(1));
    expect(service.create.mock.calls[0]?.[0]).toEqual({
      shopId: 'shop-1',
      source: { kind: 'UPLOAD', assetId: 'asset-9' },
    });
    expect(await screen.findByText('bao-cao.pdf')).toBeOnTheScreen();
  });

  it('chưa chọn tệp → hai nút "Tải PDF lên" / "Chọn từ tài liệu nhóm"; lỗi chọn tệp (không phải PDF) hiện dưới nút', async () => {
    params.mockReturnValue({ shopId: 'shop-1' });
    const pick = jest.fn();
    idleUpload({
      pick,
      problem: 'Chỉ in được tệp PDF. Hãy xuất tài liệu sang PDF (Lưu dưới dạng PDF) rồi chọn lại.',
    });
    await renderWithProviders(<PrintOrderConfiguratorScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Tải PDF lên' }));
    expect(pick).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Chỉ in được tệp PDF/)).toBeOnTheScreen();
    expect(service.create).not.toHaveBeenCalled();
  });

  it('"Chọn từ tài liệu nhóm" → chọn nhóm → chọn PDF → tạo đơn với nguồn RESOURCE của tài liệu đó', async () => {
    params.mockReturnValue({ shopId: 'shop-1' });
    jest
      .mocked(resourcePickerService.workspaces)
      .mockResolvedValue([{ id: 'ws-1', name: 'Nhóm đồ án' }]);
    jest.mocked(resourcePickerService.pdfs).mockResolvedValue({
      items: [{ id: 'res-7', name: 'Đề cương.pdf', size: 204_800 }],
      meta: { nextCursor: null, hasMore: false, limit: 30 },
    });
    await renderWithProviders(<PrintOrderConfiguratorScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Chọn từ tài liệu nhóm' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Nhóm đồ án' }));
    await fireEvent.press(await screen.findByRole('button', { name: /Đề cương.pdf/ }));

    await waitFor(() => expect(service.create).toHaveBeenCalledTimes(1));
    expect(service.create.mock.calls[0]?.[0]).toEqual({
      shopId: 'shop-1',
      source: { kind: 'RESOURCE', resourceId: 'res-7' },
    });
    expect(await screen.findByText('Đề cương.pdf')).toBeOnTheScreen();
  });

  it('tệp bị job từ chối (O2O_003) → lý do + việc nên làm, nút Gửi khoá, không có báo giá', async () => {
    service.get.mockResolvedValue({ ...COUNTING, pageCountError: 'O2O_003' });
    service.create.mockResolvedValue({ ...COUNTING, pageCountError: 'O2O_003' });
    await renderWithProviders(<PrintOrderConfiguratorScreen />);

    expect(await screen.findByText(/Chỉ nhận PDF: hãy xuất tài liệu sang PDF/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Gửi đơn' })).toBeDisabled();
    expect(service.quote).not.toHaveBeenCalled();
  });

  it('mất quyền tài liệu (404 khi tạo đơn) → "Không còn quyền với tài liệu" + Thử lại', async () => {
    service.create.mockRejectedValue(apiError(404, 'PERM_404'));
    await renderWithProviders(<PrintOrderConfiguratorScreen />);

    expect(await screen.findByText(/Không còn quyền với tài liệu/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeOnTheScreen();
  });

  it('"Đổi tệp" → huỷ đơn nháp cũ và quay về bước chọn tệp (không để đơn rác)', async () => {
    service.cancel.mockResolvedValue({ ...COUNTING, status: 'CANCELLED' });
    await renderWithProviders(<PrintOrderConfiguratorScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Đổi tệp' }));

    await waitFor(() => expect(service.cancel).toHaveBeenCalledWith('ord-1', undefined));
    expect(await screen.findByRole('button', { name: 'Tải PDF lên' })).toBeOnTheScreen();
    expect(service.create).toHaveBeenCalledTimes(1); // không tự tạo lại đơn cho tệp cũ
  });
});

describe('tiệm', () => {
  it('tiệm tạm ngưng nhận đơn → cảnh báo, KHÔNG tạo đơn, nút Gửi khoá', async () => {
    service.shop.mockResolvedValue(makeShop({ acceptingOrders: false }));
    await renderWithProviders(<PrintOrderConfiguratorScreen />);

    expect(await screen.findByText(/Tiệm đang tạm ngưng nhận đơn/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /Gửi đơn/ })).toBeDisabled();
    expect(service.create).not.toHaveBeenCalled();
  });

  it('tiệm không còn (404) → "Tiệm không còn khả dụng" không có Thử lại', async () => {
    service.shop.mockRejectedValue(apiError(404, 'PERM_404'));
    await renderWithProviders(<PrintOrderConfiguratorScreen />);

    expect(await screen.findByText('Tiệm không còn khả dụng')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('vào chỉ với resourceId (không shopId) → chọn tiệm ĐANG NHẬN ĐƠN quanh đó rồi mới tiếp tục', async () => {
    params.mockReturnValue({ resourceId: 'res-1', resourceName: 'Slide tuần 3.pdf' });
    jest.mocked(locationsService.near).mockResolvedValue([
      makeNear({ id: 'loc-a', name: 'Quán không có tiệm', type: 'CAFE' }),
      makeNear({
        id: 'loc-b',
        name: 'Tiệm đang nghỉ',
        type: 'PRINT_SHOP',
        shop: { id: 'shop-off', displayName: 'Tiệm đang nghỉ', acceptingOrders: false },
      }),
      makeNear({
        id: 'loc-c',
        name: 'In nhanh Bách Khoa',
        type: 'PRINT_SHOP',
        shop: { id: 'shop-1', displayName: 'In nhanh Bách Khoa', acceptingOrders: true },
      }),
    ]);
    await renderWithProviders(<PrintOrderConfiguratorScreen />);

    expect(await screen.findByText('Chọn tiệm in')).toBeOnTheScreen();
    expect(screen.queryByText('Quán không có tiệm')).toBeNull();
    expect(screen.queryByText('Tiệm đang nghỉ')).toBeNull();
    expect(locationsService.near).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PRINT_SHOP' }),
    );

    await fireEvent.press(screen.getByRole('button', { name: /In nhanh Bách Khoa/ }));
    await waitFor(() => expect(service.shop).toHaveBeenCalledWith('shop-1'));
    await waitFor(() => expect(service.create).toHaveBeenCalledTimes(1));
  });
});
