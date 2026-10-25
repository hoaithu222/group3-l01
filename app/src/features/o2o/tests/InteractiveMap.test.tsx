import { fireEvent, render, screen } from '@testing-library/react-native';

import { appConfig } from '@/core/config/env.config';

import { InteractiveMap, type InteractiveMapProps } from '../components/map/InteractiveMap';

/**
 * Lớp bao `@rnmapbox/maps` (`InteractiveMap`) — kiểm được ở mức PROP truyền xuống mock (`__mocks__/@rnmapbox/maps.tsx`: mọi component là `View` giữ nguyên prop).
 * ⚠️ KHÔNG kiểm được bằng Jest: tile, cử chỉ, vị trí ghim trên màn thật — phần đó cần dev client + token Mapbox (xem báo cáo p6-05).
 */
/**
 * ⚠️ Lấy phần trợ giúp của mock qua `jest.requireMock('@rnmapbox/maps')` — ĐÚNG instance mà `require('@rnmapbox/maps')` trong `InteractiveMap` nhận. Import thẳng đường dẫn
 * `__mocks__/@rnmapbox/maps` ở đầu file test nạp mock lần hai như module thường, và `require('@rnmapbox/maps')` sau đó trả về đối tượng KHÔNG có `MapView`/`StyleURL`.
 */
const { cameraMethods, mapboxStatics, resetMapboxMock } = jest.requireMock('@rnmapbox/maps') as {
  cameraMethods: Record<string, jest.Mock>;
  mapboxStatics: Record<string, jest.Mock>;
  resetMapboxMock: () => void;
};

const PINS = [
  {
    id: 'a',
    name: 'Cà phê Góc Học',
    type: 'CAFE' as const,
    coordinate: { lat: 21.0049, lng: 105.8431 },
  },
  {
    id: 'b',
    name: 'In nhanh Bách Khoa',
    type: 'PRINT_SHOP' as const,
    coordinate: { lat: 21.005, lng: 105.843 },
  },
];

function props(over: Partial<InteractiveMapProps> = {}): InteractiveMapProps {
  return {
    camera: { lat: 21.0285, lng: 105.8542, rev: 0 },
    pins: PINS,
    selectedId: null,
    userCoords: null,
    onPinPress: jest.fn(),
    onIdle: jest.fn(),
    onLoadError: jest.fn(),
    ...over,
  };
}

describe('InteractiveMap', () => {
  beforeEach(resetMapboxMock);

  it('đặt token đúng MỘT lần, vẽ mỗi địa điểm một ghim (icon + tên + loại) và tâm khởi đầu vào defaultSettings', async () => {
    jest.replaceProperty(appConfig, 'mapboxToken', 'pk.test-token');
    await render(<InteractiveMap {...props()} />);

    expect(mapboxStatics.setAccessToken).toHaveBeenCalledWith('pk.test-token');
    expect(screen.getAllByTestId('mapbox-MarkerView')).toHaveLength(2);
    // Ghim đọc được bằng CHỮ (loại địa điểm không chỉ là màu/icon).
    expect(screen.getByRole('button', { name: 'Cà phê Góc Học, Quán cà phê' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'In nhanh Bách Khoa, Tiệm in' })).toBeOnTheScreen();
    expect(screen.getByTestId('mapbox-Camera').props.defaultSettings.centerCoordinate).toEqual([
      105.8542, 21.0285,
    ]);
    // Lệnh dời đầu tiên (rev 0) chỉ là tâm khởi đầu — KHÔNG bay.
    expect(cameraMethods.flyTo).not.toHaveBeenCalled();
  });

  it('chạm ghim → onPinPress(id); ghim đang chọn báo selected cho trình đọc màn hình', async () => {
    const onPinPress = jest.fn();
    await render(<InteractiveMap {...props({ onPinPress, selectedId: 'b' })} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Cà phê Góc Học, Quán cà phê' }));
    expect(onPinPress).toHaveBeenCalledWith('a');
    expect(
      screen.getByRole('button', { name: 'In nhanh Bách Khoa, Tiệm in', selected: true }),
    ).toBeOnTheScreen();
  });

  it('camera đổi `rev` → bay tới (lng, lat) ; cùng toạ độ nhưng rev mới vẫn bay lại', async () => {
    const view = await render(<InteractiveMap {...props()} />);

    await view.rerender(
      <InteractiveMap {...props({ camera: { lat: 10.762, lng: 106.66, rev: 1 } })} />,
    );
    expect(cameraMethods.flyTo).toHaveBeenLastCalledWith([106.66, 10.762], 600);

    await view.rerender(
      <InteractiveMap {...props({ camera: { lat: 10.762, lng: 106.66, rev: 2 } })} />,
    );
    expect(cameraMethods.flyTo).toHaveBeenCalledTimes(2);
  });

  it('bản đồ dừng → onIdle nhận tâm {lat, lng} (Mapbox trả [lng, lat]); tile lỗi → onLoadError', async () => {
    const onIdle = jest.fn();
    const onLoadError = jest.fn();
    await render(<InteractiveMap {...props({ onIdle, onLoadError })} />);
    const map = screen.getByTestId('mapbox-MapView');

    await fireEvent(map, 'mapIdle', { properties: { center: [106.66, 10.762] } });
    expect(onIdle).toHaveBeenCalledWith({ lat: 10.762, lng: 106.66 });

    await fireEvent(map, 'mapLoadingError');
    expect(onLoadError).toHaveBeenCalledTimes(1);
  });

  it('có vị trí người dùng → thêm một chấm "Vị trí của bạn"', async () => {
    await render(<InteractiveMap {...props({ userCoords: { lat: 21.03, lng: 105.85 } })} />);

    expect(screen.getAllByTestId('mapbox-MarkerView')).toHaveLength(3);
    expect(screen.getByLabelText('Vị trí của bạn')).toBeOnTheScreen();
  });
});
