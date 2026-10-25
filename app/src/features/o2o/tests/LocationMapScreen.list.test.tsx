import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { LocationMapScreen } from '../screens/LocationMapScreen';
import { near, resetMapMocks, restoreMapMocks } from './map-test-kit';
import { apiError, renderWithProviders } from './o2o-test-utils';

/** Màn "Địa điểm & in ấn" — chế độ danh sách (thiếu token), bộ lọc gửi lên server, trạng thái rỗng/lỗi. */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual('react-native').FlatList,
}));
jest.mock('@/shared/theme', () => ({
  ...jest.requireActual('@/shared/theme'),
  useBreakpoint: jest.fn(),
}));
jest.mock('../api/locations.service', () => ({
  REVIEWS_PAGE_SIZE: 10,
  locationsService: { near: jest.fn() },
}));

beforeEach(resetMapMocks);
afterEach(restoreMapMocks);

describe('chế độ danh sách (không có token Mapbox)', () => {
  it('nói rõ vì sao không có bản đồ, KHÔNG dựng bản đồ, danh sách đủ chữ (khoảng cách · sao · độ ồn · đang mở · loại)', async () => {
    await renderWithProviders(<LocationMapScreen />);

    expect(await screen.findByText('Cà phê Góc Học')).toBeOnTheScreen();
    expect(
      screen.getByText('Bản đồ chưa được cấu hình nên đang hiện dạng danh sách.'),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('mapbox-MapView')).toBeNull();
    expect(screen.queryByText('Bản đồ')).toBeNull(); // không có tab chuyển chế độ

    expect(screen.getByText(/Quán cà phê · 350 m/)).toBeOnTheScreen();
    expect(screen.getByText('4,5 sao (12) · Yên tĩnh')).toBeOnTheScreen();
    expect(screen.getAllByText('Chưa có đánh giá').length).toBeGreaterThan(0);
    expect(screen.getByText('Nhận đơn in')).toBeOnTheScreen();
    expect(screen.getByText('2 địa điểm trong bán kính 2 km')).toBeOnTheScreen();
  });

  it('chạm một dòng → mở chi tiết địa điểm', async () => {
    await renderWithProviders(<LocationMapScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: /Cà phê Góc Học/ }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/me/o2o/locations/[locationId]',
      params: { locationId: 'loc-1' },
    });
  });
});

describe('bộ lọc gửi lên server', () => {
  it('loại · "Đang mở" · tiện ích đều đi vào truy vấn (mỗi lần đổi là một khoá cache khác)', async () => {
    await renderWithProviders(<LocationMapScreen />);
    await screen.findByText('Cà phê Góc Học');

    await fireEvent.press(screen.getByRole('radio', { name: 'Tiệm in' }));
    await waitFor(() =>
      expect(near).toHaveBeenCalledWith(expect.objectContaining({ type: 'PRINT_SHOP' })),
    );

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Đang mở' }));
    await waitFor(() =>
      expect(near).toHaveBeenCalledWith(expect.objectContaining({ openNow: true })),
    );

    await fireEvent.press(screen.getByText('Tiện ích'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Wi-Fi nhanh' }));
    await waitFor(() =>
      expect(near).toHaveBeenCalledWith(expect.objectContaining({ amenities: ['wifi_fast'] })),
    );
  });
});

describe('trạng thái rỗng / lỗi', () => {
  it('rỗng → "Không có địa điểm trong 2 km" + "Mở rộng bán kính" tìm ở 5 km', async () => {
    near.mockResolvedValue([]);
    await renderWithProviders(<LocationMapScreen />);

    expect(await screen.findByText('Không có địa điểm trong 2 km')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Mở rộng bán kính' }));

    await waitFor(() =>
      expect(near).toHaveBeenCalledWith(expect.objectContaining({ radiusM: 5000 })),
    );
    expect(await screen.findByText('Không có địa điểm trong 5 km')).toBeOnTheScreen();
  });

  it('có bộ lọc mà rỗng → gợi ý "Xoá bộ lọc"', async () => {
    near.mockResolvedValue([]);
    await renderWithProviders(<LocationMapScreen />);
    await screen.findByText('Không có địa điểm trong 2 km');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Đang mở' }));

    expect(await screen.findByRole('button', { name: 'Xoá bộ lọc' })).toBeOnTheScreen();
  });

  it('lỗi mạng → "Thử lại" gọi lại; lỗi khác cũng có nút thử lại', async () => {
    near.mockRejectedValueOnce(Object.assign(new Error('Network Error'), { isAxiosError: true }));
    await renderWithProviders(<LocationMapScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Cà phê Góc Học')).toBeOnTheScreen();
    expect(near).toHaveBeenCalledTimes(2);
  });

  it('lỗi 500 → hiện lỗi + Thử lại (không phải màn trắng)', async () => {
    near.mockRejectedValue(apiError(500, 'SYS_500'));
    await renderWithProviders(<LocationMapScreen />);

    expect(await screen.findByRole('button', { name: 'Thử lại' })).toBeOnTheScreen();
  });
});
