/**
 * Mock `expo-notifications` cho Jest (p0-06).
 *
 * Module gọi thẳng xuống code NATIVE (kênh thông báo, quyền, FCM/APNs) — không có bản chạy được
 * trong Node. Đăng ký ở `jest.setup.js` (`jest.mock('expo-notifications')`) để MỌI test dùng chung một
 * bản mock, giống `expo-local-authentication`/`expo-audio`.
 *
 * ⚠️ Hằng số giữ ĐÚNG giá trị số của bản thật (`AndroidImportance.HIGH = 6`, `MAX = 7`,
 * `IosAuthorizationStatus.PROVISIONAL = 3`): `android-channels.ts` và `permission.ts` so khớp/đối
 * chiếu bằng số — lệch số là test XANH GIẢ trong khi logic thật sai.
 *
 * Mặc định "quyền chưa hỏi, hỏi được": test cần trạng thái khác tự `mockResolvedValueOnce`.
 */
export enum AndroidImportance {
  UNKNOWN = 0,
  UNSPECIFIED = 1,
  NONE = 2,
  MIN = 3,
  LOW = 4,
  DEFAULT = 5,
  HIGH = 6,
  MAX = 7,
}

export enum IosAuthorizationStatus {
  NOT_DETERMINED = 0,
  DENIED = 1,
  AUTHORIZED = 2,
  PROVISIONAL = 3,
  EPHEMERAL = 4,
}

export const DEFAULT_ACTION_IDENTIFIER = 'expo.modules.notifications.actions.DEFAULT';

const undetermined = {
  canAskAgain: true,
  expires: 'never',
  granted: false,
  status: 'undetermined',
};

export const getPermissionsAsync = jest.fn(async () => ({ ...undetermined }));
export const requestPermissionsAsync = jest.fn(async () => ({ ...undetermined }));

export const setNotificationChannelAsync = jest.fn(async () => null);
export const setNotificationHandler = jest.fn();

export const getDevicePushTokenAsync = jest.fn(async () => ({
  data: 'fcm-token-for-jest-0123456789',
  type: 'android',
}));
export const addPushTokenListener = jest.fn(() => ({ remove: jest.fn() }));
export const addNotificationResponseReceivedListener = jest.fn(() => ({ remove: jest.fn() }));

export const useLastNotificationResponse = jest.fn((): unknown => null);
export const getLastNotificationResponse = jest.fn((): unknown => null);
export const clearLastNotificationResponse = jest.fn();

export const dismissAllNotificationsAsync = jest.fn(async () => undefined);
export const setBadgeCountAsync = jest.fn(async () => true);
