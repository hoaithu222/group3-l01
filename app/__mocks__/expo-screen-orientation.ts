/**
 * Mock `expo-screen-orientation` cho Jest.
 *
 * `lockAsync`/`unlockAsync`/… gọi xuống module native (Activity/ViewController) — không có bản chạy được trong Node. Đăng ký ở `jest.setup.js`
 * (`jest.mock('expo-screen-orientation')`) để MỌI test dùng chung một bản.
 *
 * Mặc định: máy đang DỌC (`Orientation.PORTRAIT_UP`), khoá hiện tại `DEFAULT`. `lockAsync(x)` GHI NHỚ khoá để `getOrientationLockAsync()` trả lại đúng
 * cái vừa đặt — test "vào màn ngang rồi rời màn phải trả lại dọc" kiểm được bằng `getOrientationLockAsync`, không cần soi số lần gọi.
 * `resetScreenOrientationMock()` đưa về mặc định — gọi ở `beforeEach`.
 *
 * ⚠️ Giá trị enum giữ ĐÚNG số của bản thật (`OrientationLock.PORTRAIT_UP = 3`…): lệch số là test XANH GIẢ.
 */
export enum Orientation {
  UNKNOWN = 0,
  PORTRAIT_UP = 1,
  PORTRAIT_DOWN = 2,
  LANDSCAPE_LEFT = 3,
  LANDSCAPE_RIGHT = 4,
}

export enum OrientationLock {
  DEFAULT = 0,
  ALL = 1,
  PORTRAIT = 2,
  PORTRAIT_UP = 3,
  PORTRAIT_DOWN = 4,
  LANDSCAPE = 5,
  LANDSCAPE_LEFT = 6,
  LANDSCAPE_RIGHT = 7,
  OTHER = 8,
  UNKNOWN = 9,
}

export enum SizeClassIOS {
  UNKNOWN = 0,
  COMPACT = 1,
  REGULAR = 2,
}

let currentLock: OrientationLock = OrientationLock.DEFAULT;

export const lockAsync = jest.fn(async (lock: OrientationLock) => {
  currentLock = lock;
});
export const lockPlatformAsync = jest.fn(async () => undefined);
export const unlockAsync = jest.fn(async () => {
  currentLock = OrientationLock.DEFAULT;
});
export const getOrientationAsync = jest.fn(async () => Orientation.PORTRAIT_UP);
export const getOrientationLockAsync = jest.fn(async () => currentLock);
export const getPlatformOrientationLockAsync = jest.fn(async () => ({}));
export const supportsOrientationLockAsync = jest.fn(async () => true);
export const addOrientationChangeListener = jest.fn(() => ({ remove: jest.fn() }));
export const removeOrientationChangeListener = jest.fn();
export const removeOrientationChangeListeners = jest.fn();

/** CHỈ dùng trong test: đặt lại khoá về `DEFAULT` và xoá lịch sử gọi. */
export function resetScreenOrientationMock() {
  currentLock = OrientationLock.DEFAULT;
  [lockAsync, unlockAsync, lockPlatformAsync, addOrientationChangeListener].forEach((mock) =>
    mock.mockClear(),
  );
}
