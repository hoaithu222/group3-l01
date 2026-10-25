import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { PrintOrderConfiguratorScreen } from '../screens/PrintOrderConfiguratorScreen';
import { COUNTED, countingDone, resetConfiguratorMocks, service } from './configurator-test-kit';
import { apiError, makeQuote, makeShop, renderWithProviders } from './o2o-test-utils';

/** Màn cấu hình đơn in — cấu hình khoá theo NĂNG LỰC tiệm và báo giá lấy từ SERVER (khoảng trang, `O2O_002`/`O2O_012`). */
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

describe('cấu hình khoá theo năng lực tiệm', () => {
  it('tiệm không in A3/màu/hai mặt → các ô khoá kèm lời giải thích, không giấu', async () => {
    service.shop.mockResolvedValue(
      makeShop({ capabilities: { color: false, duplex: false, a3: false, binding: false } }),
    );
    const { queryClient } = await renderWithProviders(<PrintOrderConfiguratorScreen />);
    await screen.findByText('Đang đếm trang…');
    await countingDone(queryClient, {
      ...COUNTED,
      settings: { ...COUNTED.settings, color: false, duplex: false },
    });

    expect(await screen.findByText('Cấu hình in')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'A3' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'A4' })).toBeEnabled();
    expect(screen.getByText('Tiệm này chỉ in khổ A4.')).toBeOnTheScreen();
    expect(screen.getByText('Tiệm này chỉ in đen trắng.')).toBeOnTheScreen();
    expect(screen.getByText('Tiệm này không in hai mặt.')).toBeOnTheScreen();
    expect(screen.queryByText('Đóng gáy')).toBeNull(); // tiệm không có đóng gáy → không hiện tuỳ chọn
  });

  it('tiệm in được A3 → chọn A3 gửi báo giá thử với khổ A3', async () => {
    const { queryClient } = await renderWithProviders(<PrintOrderConfiguratorScreen />);
    await screen.findByText('Đang đếm trang…');
    await countingDone(queryClient);

    await fireEvent.press(await screen.findByRole('radio', { name: 'A3' }));
    await waitFor(() =>
      expect(service.quote).toHaveBeenLastCalledWith(
        'shop-1',
        12,
        expect.objectContaining({ paper: 'A3' }),
      ),
    );
  });
});

describe('báo giá lấy từ SERVER', () => {
  it('hiện đúng các con số của response (trang × bản, đơn giá, tạm tính, giảm hai mặt, tổng) + "Thanh toán tại quầy"', async () => {
    const { queryClient } = await renderWithProviders(<PrintOrderConfiguratorScreen />);
    await screen.findByText('Đang đếm trang…');
    await countingDone(queryClient);

    expect(await screen.findByText('12 trang × 1 bản')).toBeOnTheScreen();
    expect(screen.getByText('2.000 VND/trang')).toBeOnTheScreen();
    expect(screen.getByText('24.000 VND')).toBeOnTheScreen();
    expect(screen.getByText('-2.400 VND')).toBeOnTheScreen();
    expect(screen.getAllByText('21.600 VND').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Thanh toán tại quầy khi nhận tài liệu/).length).toBeGreaterThan(0);
    expect(service.quote).toHaveBeenCalledWith('shop-1', 12, expect.any(Object));
  });

  it('đổi số bản → báo giá lại (debounce) với số bản mới và hiện số MỚI của server', async () => {
    service.quote.mockImplementation(async (_shop, _pages, settings) =>
      settings.copies === 3
        ? makeQuote({ subtotal: 72_000, duplexDiscount: 7200, total: 64_800 })
        : makeQuote(),
    );
    const { queryClient } = await renderWithProviders(<PrintOrderConfiguratorScreen />);
    await screen.findByText('Đang đếm trang…');
    await countingDone(queryClient);
    await screen.findByText('12 trang × 1 bản');

    const increase = screen.getByLabelText('Tăng số bản');
    await fireEvent.press(increase);
    await fireEvent.press(increase);

    expect(await screen.findByText('64.800 VND', {}, { timeout: 2000 })).toBeOnTheScreen();
    expect(service.quote).toHaveBeenLastCalledWith(
      'shop-1',
      12,
      expect.objectContaining({ copies: 3 }),
    );
  });

  it('khoảng trang sai hình dạng → lỗi ngay dưới ô, KHÔNG gọi báo giá, khoá Gửi', async () => {
    const { queryClient } = await renderWithProviders(<PrintOrderConfiguratorScreen />);
    await screen.findByText('Đang đếm trang…');
    await countingDone(queryClient);
    await screen.findByText('12 trang × 1 bản');
    service.quote.mockClear();

    await fireEvent.changeText(screen.getByPlaceholderText('Ví dụ: 1-3,5'), '5-3');

    expect(
      await screen.findByText(/Khoảng trang không hợp lệ. Ví dụ đúng: 1-3,5/),
    ).toBeOnTheScreen();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    expect(service.quote).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Gửi đơn/ })).toBeDisabled();
  });

  it('khoảng trang vượt tổng số trang (biết 12 trang) → báo "vượt quá tổng 12 trang"', async () => {
    const { queryClient } = await renderWithProviders(<PrintOrderConfiguratorScreen />);
    await screen.findByText('Đang đếm trang…');
    await countingDone(queryClient);
    await screen.findByText('12 trang × 1 bản');

    await fireEvent.changeText(screen.getByPlaceholderText('Ví dụ: 1-3,5'), '1-30');
    expect(await screen.findByText(/vượt quá tổng 12 trang/)).toBeOnTheScreen();
  });

  it('server báo O2O_012 → lỗi hiện dưới ô khoảng trang (cùng câu với lỗi phía app)', async () => {
    service.quote.mockRejectedValue(apiError(400, 'O2O_012', { field: 'pageRange' }));
    const { queryClient } = await renderWithProviders(<PrintOrderConfiguratorScreen />);
    await screen.findByText('Đang đếm trang…');
    await countingDone(queryClient);

    expect(
      await screen.findByText(/Khoảng trang không hợp lệ. Ví dụ đúng: 1-3,5 \(mọi trang/),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /Gửi đơn/ })).toBeDisabled();
  });

  it('server báo O2O_002 (tiệm không hỗ trợ cấu hình) → nói ĐÚNG trường, thay bảng giá, khoá Gửi', async () => {
    service.quote.mockRejectedValue(apiError(400, 'O2O_002', { field: 'color' }));
    const { queryClient } = await renderWithProviders(<PrintOrderConfiguratorScreen />);
    await screen.findByText('Đang đếm trang…');
    await countingDone(queryClient);

    expect(await screen.findByText('Tiệm không in màu. Hãy chọn in đen trắng.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /Gửi đơn/ })).toBeDisabled();
  });
});
