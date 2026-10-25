/**
 * Mock `expo-location` cho Jest.
 *
 * Mọi hàm gọi xuống module native (GPS, hộp thoại xin quyền) — không có bản chạy được trong Node. Đăng ký ở `jest.setup.js`
 * (`jest.mock('expo-location')`) để MỌI test dùng chung một bản.
 *
 * Mặc định: máy BẬT dịch vụ vị trí, quyền "khi đang dùng" ĐÃ CẤP, vị trí = trung tâm Hà Nội. Test nhánh khác tự chỉnh, vd
 *   `requestForegroundPermissionsAsync.mockResolvedValueOnce(deniedPermission)` hoặc `hasServicesEnabledAsync.mockResolvedValueOnce(false)`.
 * `resetLocationMock()` đưa mọi hàm về mặc định — gọi ở `beforeEach` của suite tự chỉnh hành vi.
 *
 * ⚠️ Giá trị enum giữ ĐÚNG số của bản thật (`Accuracy.High = 4`…): mã so khớp/ghi số này lên log/BE thì lệch là test XANH GIẢ.
 */
export enum Accuracy {
  Lowest = 1,
  Low = 2,
  Balanced = 3,
  High = 4,
  Highest = 5,
  BestForNavigation = 6,
}

export enum PermissionStatus {
  UNDETERMINED = 'undetermined',
  GRANTED = 'granted',
  DENIED = 'denied',
}

/** Trung tâm Hà Nội — điểm mặc định của `getCurrentPositionAsync`. */
export const MOCK_COORDS = {
  latitude: 21.0285,
  longitude: 105.8542,
  altitude: null,
  accuracy: 10,
  altitudeAccuracy: null,
  heading: null,
  speed: null,
} as const;

export const grantedPermission = {
  status: PermissionStatus.GRANTED,
  granted: true,
  canAskAgain: true,
  expires: 'never',
} as const;

export const deniedPermission = {
  status: PermissionStatus.DENIED,
  granted: false,
  canAskAgain: false,
  expires: 'never',
} as const;

const position = () => ({ coords: { ...MOCK_COORDS }, timestamp: 1_700_000_000_000 });

export const getForegroundPermissionsAsync = jest.fn(async () => grantedPermission);
export const requestForegroundPermissionsAsync = jest.fn(async () => grantedPermission);
export const hasServicesEnabledAsync = jest.fn(async () => true);
export const getCurrentPositionAsync = jest.fn(async () => position());
export const getLastKnownPositionAsync = jest.fn(async () => position());
export const watchPositionAsync = jest.fn(async () => ({ remove: jest.fn() }));
export const geocodeAsync = jest.fn(async () => []);
export const reverseGeocodeAsync = jest.fn(async () => []);

/** Hook `[quyền, xin quyền, đọc quyền]` — bản mock trả quyền đã cấp và hàm xin/đọc là `jest.fn`. */
export const useForegroundPermissions = jest.fn(() => [
  grantedPermission,
  requestForegroundPermissionsAsync,
  getForegroundPermissionsAsync,
]);

const defaults: [jest.Mock, () => unknown][] = [
  [getForegroundPermissionsAsync, async () => grantedPermission],
  [requestForegroundPermissionsAsync, async () => grantedPermission],
  [hasServicesEnabledAsync, async () => true],
  [getCurrentPositionAsync, async () => position()],
  [getLastKnownPositionAsync, async () => position()],
  [watchPositionAsync, async () => ({ remove: jest.fn() })],
  [geocodeAsync, async () => []],
  [reverseGeocodeAsync, async () => []],
];

/** CHỈ dùng trong test: đặt lại mọi hàm về mặc định "quyền đã cấp, vị trí Hà Nội" và xoá lịch sử gọi. */
export function resetLocationMock() {
  for (const [mock, implementation] of defaults) {
    mock.mockReset();
    mock.mockImplementation(implementation);
  }
}
