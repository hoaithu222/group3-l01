import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import type { useNetworkStatus } from '@/shared/hooks/use-network-status';

import { PrintOrderConfiguratorScreen } from '../screens/PrintOrderConfiguratorScreen';
import { readPin } from '../utils/pin-vault';
import {
  COUNTED,
  countingDone,
  network,
  pressSend,
  resetConfiguratorMocks,
  service,
} from './configurator-test-kit';
import { apiError, makeOrder, renderWithProviders } from './o2o-test-utils';

/** Màn cấu hình đơn in — gửi đơn: PATCH theo `expectedVersion`, cất PIN vào kho khoá TRƯỚC khi sang màn vé, lỗi khi gửi, mất mạng. */
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

describe('gửi đơn', () => {
  it('cấu hình KHÔNG đổi → submit thẳng; PIN cất vào kho khoá TRƯỚC khi sang màn vé; sang vé bằng replace', async () => {
    service.submit.mockResolvedValue({
      order: makeOrder({ status: 'PENDING', version: 4 }),
      pin: '482913',
    });
    const { queryClient } = await renderWithProviders(<PrintOrderConfiguratorScreen />);
    await screen.findByText('Đang đếm trang…');
    await countingDone(queryClient);

    await pressSend('Gửi đơn · 21.600 VND');

    await waitFor(() => expect(service.submit).toHaveBeenCalledWith('ord-1'));
    expect(service.update).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/me/o2o/print/[orderId]',
        params: { orderId: 'ord-1' },
      }),
    );
    expect(await readPin('u1', 'ord-1')).toBe('482913');
  });

  it('cấu hình đã sửa → PATCH với expectedVersion rồi mới submit', async () => {
    service.update.mockResolvedValue({
      ...COUNTED,
      settings: { ...COUNTED.settings, copies: 2 },
      version: 4,
    });
    service.submit.mockResolvedValue({ order: makeOrder({ status: 'PENDING' }), pin: '111222' });
    const { queryClient } = await renderWithProviders(<PrintOrderConfiguratorScreen />);
    await screen.findByText('Đang đếm trang…');
    await countingDone(queryClient);
    await screen.findByText('12 trang × 1 bản');

    await fireEvent.press(screen.getByLabelText('Tăng số bản'));
    await waitFor(() =>
      expect(service.quote).toHaveBeenLastCalledWith(
        'shop-1',
        12,
        expect.objectContaining({ copies: 2 }),
      ),
    );
    await pressSend();

    await waitFor(() => expect(service.submit).toHaveBeenCalled());
    expect(service.update).toHaveBeenCalledWith(
      'ord-1',
      expect.objectContaining({
        expectedVersion: 3,
        settings: expect.objectContaining({ copies: 2 }),
      }),
    );
    const updateOrder = service.update.mock.invocationCallOrder[0] ?? 0;
    const submitOrder = service.submit.mock.invocationCallOrder[0] ?? 0;
    expect(updateOrder).toBeLessThan(submitOrder);
  });

  it('gửi lỗi (tiệm vừa ngưng nhận đơn — O2O_001) → câu hướng dẫn ngay trên form, KHÔNG chuyển màn', async () => {
    service.submit.mockRejectedValue(apiError(409, 'O2O_001'));
    const { queryClient } = await renderWithProviders(<PrintOrderConfiguratorScreen />);
    await screen.findByText('Đang đếm trang…');
    await countingDone(queryClient);

    await pressSend();

    expect(await screen.findByText(/Tiệm đang tạm ngưng nhận đơn/)).toBeOnTheScreen();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('mất mạng → nút đổi thành "Kết nối lại để gửi đơn" và khoá', async () => {
    network.mockReturnValue({ isOnline: false } as ReturnType<typeof useNetworkStatus>);
    const { queryClient } = await renderWithProviders(<PrintOrderConfiguratorScreen />);
    await screen.findByText('Đang đếm trang…');
    await countingDone(queryClient);

    expect(await screen.findByRole('button', { name: 'Kết nối lại để gửi đơn' })).toBeDisabled();
  });
});
