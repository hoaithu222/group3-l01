/**
 * Mock `@react-native-firebase/messaging` cho Jest.
 *
 * Thư viện gọi `NativeRNFBTurboApp` (module native của `@react-native-firebase/app`) ngay khi lấy instance — trong Node không có ⇒
 * "Native module NativeRNFBTurboApp is not registered". Đăng ký ở `jest.setup.js` (`jest.mock('@react-native-firebase/messaging')`).
 *
 * ── Phạm vi ─────────────────────────────────────────────────────────────────
 * CHỈ mock `messaging` — KHÔNG mock `@react-native-firebase/app`/`auth` (thuộc luồng đăng nhập Google, test của luồng đó tự mock).
 * RNFB 26 CHỈ còn API MODULAR (`getMessaging()`, `getToken(m)`, `onTokenRefresh(m, cb)`…) — kiểu cũ `messaging().getToken()` (mà `p0-06/app.md` còn
 * viết) KHÔNG còn: không có default export, `tsc` báo TS1192. Mọi hàm modular dẫn về CHUNG một bộ `jest.fn` (`messagingMock`) —
 * `expect(messagingMock.getToken).toHaveBeenCalled()`.
 *
 * Mặc định: có token `mock-fcm-token`, quyền đã cấp, không có thông báo mở app. `resetMessagingMock()` đưa về mặc định — gọi ở `beforeEach`.
 * Test đẩy sự kiện: `messagingMock.emitTokenRefresh('token-moi')`, `messagingMock.emitMessage({ data: {...} })`.
 * ⚠️ `AuthorizationStatus` giữ ĐÚNG số bản thật (`AUTHORIZED = 1`…).
 */
export const AuthorizationStatus = {
  NOT_DETERMINED: -1,
  DENIED: 0,
  AUTHORIZED: 1,
  PROVISIONAL: 2,
  EPHEMERAL: 3,
} as const;
export const NotificationAndroidPriority = {
  PRIORITY_MIN: -2,
  PRIORITY_LOW: -1,
  PRIORITY_DEFAULT: 0,
  PRIORITY_HIGH: 1,
  PRIORITY_MAX: 2,
} as const;
export const NotificationAndroidVisibility = {
  VISIBILITY_SECRET: -1,
  VISIBILITY_PRIVATE: 0,
  VISIBILITY_PUBLIC: 1,
} as const;

type Listener<T> = (value: T) => void;

const tokenListeners = new Set<Listener<string>>();
const messageListeners = new Set<Listener<unknown>>();

const subscribe =
  <T>(set: Set<Listener<T>>) =>
  (listener: Listener<T>) => {
    set.add(listener);
    return () => void set.delete(listener);
  };

export const messagingMock = {
  deleteToken: jest.fn(async () => undefined),
  getAPNSToken: jest.fn(async () => null),
  getInitialNotification: jest.fn(async () => null),
  getToken: jest.fn(async () => 'mock-fcm-token'),
  hasPermission: jest.fn(async () => AuthorizationStatus.AUTHORIZED as number),
  isAutoInitEnabled: true,
  isDeviceRegisteredForRemoteMessages: true,
  isSupported: jest.fn(async () => true),
  onMessage: jest.fn(subscribe(messageListeners)),
  onNotificationOpenedApp: jest.fn((_listener: Listener<unknown>) => () => undefined),
  onTokenRefresh: jest.fn(subscribe(tokenListeners)),
  registerDeviceForRemoteMessages: jest.fn(async () => undefined),
  requestPermission: jest.fn(async () => AuthorizationStatus.AUTHORIZED as number),
  setAutoInitEnabled: jest.fn(async () => undefined),
  setBackgroundMessageHandler: jest.fn(),
  subscribeToTopic: jest.fn(async (_topic: string) => undefined),
  unsubscribeFromTopic: jest.fn(async (_topic: string) => undefined),
  /** CHỈ trong test: bắn sự kiện `onTokenRefresh` tới mọi listener đã đăng ký. */
  emitTokenRefresh: (token: string) => tokenListeners.forEach((listener) => listener(token)),
  /** CHỈ trong test: bắn tin nhắn foreground (`onMessage`) tới mọi listener đã đăng ký. */
  emitMessage: (message: unknown) => messageListeners.forEach((listener) => listener(message)),
};

/** CHỈ trong test: gỡ listener, xoá lịch sử gọi và trả `getToken`/quyền về mặc định. */
export function resetMessagingMock() {
  tokenListeners.clear();
  messageListeners.clear();
  Object.values(messagingMock).forEach((member) => {
    if (typeof member === 'function' && 'mockClear' in member) (member as jest.Mock).mockClear();
  });
  messagingMock.getToken.mockImplementation(async () => 'mock-fcm-token');
  messagingMock.hasPermission.mockImplementation(async () => AuthorizationStatus.AUTHORIZED);
  messagingMock.requestPermission.mockImplementation(async () => AuthorizationStatus.AUTHORIZED);
}

// ── API MODULAR: hàm nhận `messaging` ở đối số đầu — bỏ qua nó, đều dẫn về `messagingMock` ─────────────────────────────────────────────────
export const getMessaging = jest.fn(() => messagingMock);
export const deleteToken = (_messaging?: unknown) => messagingMock.deleteToken();
export const getAPNSToken = (_messaging?: unknown) => messagingMock.getAPNSToken();
export const getInitialNotification = (_messaging?: unknown) =>
  messagingMock.getInitialNotification();
export const getToken = (_messaging?: unknown) => messagingMock.getToken();
export const hasPermission = (_messaging?: unknown) => messagingMock.hasPermission();
export const isSupported = (_messaging?: unknown) => messagingMock.isSupported();
export const onMessage = (_messaging: unknown, listener: Listener<unknown>) =>
  messagingMock.onMessage(listener);
export const onNotificationOpenedApp = (_messaging: unknown, listener: Listener<unknown>) =>
  messagingMock.onNotificationOpenedApp(listener);
export const onTokenRefresh = (_messaging: unknown, listener: Listener<string>) =>
  messagingMock.onTokenRefresh(listener);
export const registerDeviceForRemoteMessages = (_messaging?: unknown) =>
  messagingMock.registerDeviceForRemoteMessages();
export const requestPermission = (_messaging?: unknown) => messagingMock.requestPermission();
export const setBackgroundMessageHandler = (_messaging: unknown, handler: unknown) =>
  messagingMock.setBackgroundMessageHandler(handler);
export const subscribeToTopic = (_messaging: unknown, topic: string) =>
  messagingMock.subscribeToTopic(topic);
export const unsubscribeFromTopic = (_messaging: unknown, topic: string) =>
  messagingMock.unsubscribeFromTopic(topic);
