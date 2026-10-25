import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { LocationMapScreen } from '../screens/LocationMapScreen';
import {
  SAIGON,
  UNDETERMINED,
  location,
  mapbox,
  near,
  phone,
  resetMapMocks,
  restoreMapMocks,
  withMapbox,
} from './map-test-kit';
import { renderWithProviders } from './o2o-test-utils';

/** Màn "Địa điểm & in ấn" — vị trí người dùng (xin đúng lúc, từ chối vẫn dùng được) và chế độ bản đồ (mock — chỉ kiểm được prop, không tile/cử chỉ). */
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

describe('vị trí người dùng — xin đúng lúc, từ chối vẫn dùng được (app.md §7)', () => {
  beforeEach(() => {
    location.getForegroundPermissionsAsync.mockResolvedValue(UNDETERMINED);
  });

  it('mở màn KHÔNG xin quyền; tìm quanh tâm mặc định (khuôn viên) với toạ độ làm tròn', async () => {
    await renderWithProviders(<LocationMapScreen />);
    await screen.findByText('Cà phê Góc Học');

    expect(location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(near).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 21.029, lng: 105.854, radiusM: 2000 }),
    );
  });

  it('bấm "Gần tôi" → giải thích TRƯỚC, đồng ý mới hiện hộp thoại hệ thống; từ chối → tâm mặc định + banner, danh sách vẫn dùng', async () => {
    location.requestForegroundPermissionsAsync.mockResolvedValue(location.deniedPermission);
    await renderWithProviders(<LocationMapScreen />);
    await screen.findByText('Cà phê Góc Học');

    await fireEvent.press(screen.getByRole('button', { name: /Gần tôi/ }));
    expect(await screen.findByText('Dùng vị trí của bạn?')).toBeOnTheScreen();
    expect(location.requestForegroundPermissionsAsync).not.toHaveBeenCalled(); // mới giải thích, chưa hỏi hệ thống

    await fireEvent.press(screen.getByText('Cho phép'));
    await waitFor(() =>
      expect(location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1),
    );
    expect(await screen.findByText(/chưa cho phép dùng vị trí/)).toBeOnTheScreen();
    expect(screen.getByText('Cà phê Góc Học')).toBeOnTheScreen();
    expect(near).not.toHaveBeenCalledWith(expect.objectContaining({ lat: 10.762 }));
  });

  it('từ chối vĩnh viễn (canAskAgain=false) → có nút "Mở cài đặt"', async () => {
    location.getForegroundPermissionsAsync.mockResolvedValue({
      ...(location.deniedPermission as object),
      canAskAgain: false,
    });
    location.requestForegroundPermissionsAsync.mockResolvedValue({
      ...(location.deniedPermission as object),
      canAskAgain: false,
    });
    await renderWithProviders(<LocationMapScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: /Gần tôi/ }));
    await fireEvent.press(await screen.findByText('Cho phép'));

    expect(await screen.findByRole('button', { name: /Mở cài đặt/ })).toBeOnTheScreen();
  });

  it('cho phép → tìm quanh vị trí của tôi', async () => {
    location.requestForegroundPermissionsAsync.mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });
    location.getCurrentPositionAsync.mockResolvedValue(SAIGON);
    await renderWithProviders(<LocationMapScreen />);
    await screen.findByText('Cà phê Góc Học');

    await fireEvent.press(screen.getByRole('button', { name: /Gần tôi/ }));
    await fireEvent.press(await screen.findByText('Cho phép'));

    await waitFor(() =>
      expect(near).toHaveBeenCalledWith(expect.objectContaining({ lat: 10.762, lng: 106.66 })),
    );
  });

  it('quyền ĐÃ cấp từ trước → lấy vị trí lặng lẽ lúc mở, không hộp thoại nào', async () => {
    location.getForegroundPermissionsAsync.mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });
    location.getCurrentPositionAsync.mockResolvedValue(SAIGON);
    await renderWithProviders(<LocationMapScreen />);

    await waitFor(() =>
      expect(near).toHaveBeenCalledWith(expect.objectContaining({ lat: 10.762, lng: 106.66 })),
    );
    expect(location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(screen.queryByText('Dùng vị trí của bạn?')).toBeNull();
  });
});

describe('chế độ bản đồ (có token + module native — bản mock)', () => {
  // Mặc định mock vị trí là "quyền đã cấp" ⇒ có thêm chấm vị trí của tôi; các ca dưới đếm ghim nên đặt chưa cấp quyền.
  beforeEach(() => {
    location.getForegroundPermissionsAsync.mockResolvedValue(UNDETERMINED);
  });

  it('điện thoại: tab Bản đồ | Danh sách; ghim theo địa điểm; chạm ghim → chọn + camera bay tới; tab Danh sách hiện danh sách', async () => {
    withMapbox();
    await renderWithProviders(<LocationMapScreen />);
    await waitFor(() => expect(screen.getAllByTestId('mapbox-MarkerView')).toHaveLength(2));

    expect(
      screen.queryByText('Bản đồ chưa được cấu hình nên đang hiện dạng danh sách.'),
    ).toBeNull();
    // Bản đồ đang hiện → danh sách CHƯA hiện (điện thoại chỉ một trong hai).
    expect(screen.queryByText('2 địa điểm trong bán kính 2 km')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'In nhanh Bách Khoa, Tiệm in' }));
    await waitFor(() =>
      expect(mapbox.cameraMethods.flyTo).toHaveBeenLastCalledWith([105.8431, 21.0049], 600),
    );
    // Thẻ tóm tắt của địa điểm đang chọn hiện ngay dưới bản đồ.
    expect(
      await screen.findByRole('button', { name: /In nhanh Bách Khoa, Tiệm in, cách 1,2 km/ }),
    ).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('tab', { name: 'Danh sách' }));
    expect(await screen.findByText('2 địa điểm trong bán kính 2 km')).toBeOnTheScreen();
    expect(screen.queryByTestId('mapbox-MapView')).toBeNull();
  });

  it('máy tính bảng: bản đồ TRÁI + danh sách PHẢI cùng lúc, không có tab', async () => {
    withMapbox();
    phone(true);
    await renderWithProviders(<LocationMapScreen />);

    expect(await screen.findByText('2 địa điểm trong bán kính 2 km')).toBeOnTheScreen();
    expect(screen.getByTestId('mapbox-MapView')).toBeOnTheScreen();
    expect(screen.queryByRole('tab', { name: 'Danh sách' })).toBeNull();
  });

  it('tile lỗi → báo một dòng, danh sách địa điểm vẫn dùng được (app.md §3 "Lỗi tile → vẫn hiện danh sách")', async () => {
    withMapbox();
    await renderWithProviders(<LocationMapScreen />);
    await waitFor(() => expect(screen.getByTestId('mapbox-MapView')).toBeOnTheScreen());

    await fireEvent(screen.getByTestId('mapbox-MapView'), 'mapLoadingError');
    expect(await screen.findByText(/Bản đồ chưa tải được nền/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('tab', { name: 'Danh sách' }));
    expect(await screen.findByText('Cà phê Góc Học')).toBeOnTheScreen();
  });
});
