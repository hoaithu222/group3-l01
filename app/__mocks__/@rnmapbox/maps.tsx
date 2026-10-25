/**
 * Mock `@rnmapbox/maps` cho Jest.
 *
 * Gói phát hành ES module chưa biên dịch ("Unexpected token 'export'" ngay lúc `require`) và cần module native Mapbox — không chạy được trong Node.
 * Toàn cục qua `jest.setup.js` (`jest.mock('@rnmapbox/maps')`).
 *
 * ── Cái mock làm ────────────────────────────────────────────────────────────
 *  · Mọi tên VIẾT HOA là component (`MapView`, `Camera`, `ShapeSource`, `SymbolLayer`, `PointAnnotation`, `UserLocation`, `MarkerView`…) → `View` giữ
 *    NGUYÊN prop, `testID` mặc định `mapbox-<Tên>`. Đọc được `getByTestId('mapbox-Camera').props.centerCoordinate`, và
 *    `fireEvent(getByTestId('mapbox-MapView'), 'cameraChanged', …)` / `fireEvent.press(...)` gọi đúng handler.
 *  · `MapView` và `Camera` có `ref` với phương thức của bản thật (`getCenter`, `getVisibleBounds`, `getZoom`, `setCamera`, `flyTo`, `fitBounds`…) là
 *    `jest.fn` DÙNG CHUNG — `resetMapboxMock()` ở `beforeEach` nếu suite đếm số lần gọi.
 *  · Enum (`StyleURL`, `UserTrackingMode`…) trả CHÍNH TÊN khoá; `Mapbox.setAccessToken` & bạn bè là `jest.fn`. Hàm/tên viết thường khác → `jest.fn()`.
 *  · Cả `import Mapbox from '@rnmapbox/maps'` lẫn `import { MapView } from '@rnmapbox/maps'` đều dùng được (như bản thật).
 *
 * ⛔ KHÔNG dựng bản đồ/tile; toạ độ, cụm điểm, lớp phủ chỉ kiểm được ở mức PROP truyền xuống. Hiển thị bản đồ thật = kiểm trên máy (dev client).
 */
import { forwardRef, useImperativeHandle } from 'react';
import { View } from 'react-native';
import type { ViewProps } from 'react-native';

type NodeProps = ViewProps & Record<string, unknown>;

const PROBED_KEYS = new Set([
  'then',
  'default',
  'toJSON',
  'asymmetricMatch',
  'nodeType',
  'constructor',
]);

const mapMethods = {
  getCenter: jest.fn(async () => [105.8542, 21.0285]),
  getCoordinateFromView: jest.fn(async () => [105.8542, 21.0285]),
  getPointInView: jest.fn(async () => [0, 0]),
  getVisibleBounds: jest.fn(async () => [
    [105.9, 21.1],
    [105.8, 21.0],
  ]),
  getZoom: jest.fn(async () => 14),
  queryRenderedFeaturesAtPoint: jest.fn(async () => ({ features: [] })),
  queryRenderedFeaturesInRect: jest.fn(async () => ({ features: [] })),
  takeSnap: jest.fn(async () => ''),
};

const cameraMethods = {
  fitBounds: jest.fn(),
  flyTo: jest.fn(),
  moveTo: jest.fn(),
  setCamera: jest.fn(),
  zoomTo: jest.fn(),
};

const mapboxStatics = {
  removeCustomHeader: jest.fn(),
  setAccessToken: jest.fn(async () => undefined),
  setConnected: jest.fn(),
  setTelemetryEnabled: jest.fn(),
  setWellKnownTileServer: jest.fn(),
};

/** Đặt lại mọi hàm dùng chung về trạng thái chưa gọi — gọi ở `beforeEach`. */
export function resetMapboxMock() {
  [mapMethods, cameraMethods, mapboxStatics].forEach((group) =>
    Object.values(group).forEach((method) => method.mockClear()),
  );
}

export { cameraMethods, mapMethods, mapboxStatics };

function nodeWithHandle<Handle extends object>(name: string, handle: Handle) {
  return forwardRef<Handle, NodeProps>(function MapboxNode(props, ref) {
    useImperativeHandle(ref, () => handle, []);
    return <View testID={`mapbox-${name}`} {...props} />;
  });
}

const components = new Map<string, unknown>([
  ['MapView', nodeWithHandle('MapView', mapMethods)],
  ['Camera', nodeWithHandle('Camera', cameraMethods)],
]);

function componentFor(name: string) {
  let component = components.get(name);
  if (!component) {
    component = function MapboxNode(props: NodeProps) {
      return <View testID={`mapbox-${name}`} {...props} />;
    };
    components.set(name, component);
  }
  return component;
}

function enumFor() {
  return new Proxy(
    {},
    { get: (_enum, member) => (typeof member === 'string' ? member : undefined) },
  );
}

const ENUMS = new Set([
  'StyleURL',
  'UserTrackingMode',
  'UserLocationRenderMode',
  'LineJoin',
  'CircleLayerStyle',
]);

// ⚠️ `module.exports = …` ở cuối GHI ĐÈ các `export` ở trên (Babel gán chúng vào `exports` cũ) — nên phải nhét cả phần trợ giúp cho test vào `overrides`
// thì `import { resetMapboxMock } from '…/__mocks__/@rnmapbox/maps'` mới có giá trị lúc chạy (còn `export` chỉ để TypeScript hiểu).
const overrides: Record<string, unknown> = {
  __esModule: true,
  ...mapboxStatics,
  cameraMethods,
  mapMethods,
  mapboxStatics,
  resetMapboxMock,
};

const mockModule: Record<string, unknown> = new Proxy(overrides, {
  get(target, key) {
    if (typeof key !== 'string' || key in target || PROBED_KEYS.has(key))
      return target[key as string];
    if (ENUMS.has(key)) return enumFor();
    return /^[A-Z]/.test(key) ? componentFor(key) : jest.fn();
  },
  has: () => true,
});

// Bản thật xuất MỘT đối tượng `Mapbox` làm default lẫn các thành viên có tên; trỏ `default` về chính mô-đun để cả hai cách nhập cùng chạy.
overrides.default = mockModule;

module.exports = mockModule;
