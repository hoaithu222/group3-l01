import type { Metrics } from 'react-native-safe-area-context';

import type { AccountNotificationPreference } from '@/core/notifications';

/** Giá trị hiệu lực mặc định của `GET /me/notification-preferences` — dùng chung cho test màn Thông báo. */
export const BASE_PREFERENCE: AccountNotificationPreference = {
  channelMode: 'MENTIONS_AND_THREADS',
  directMode: 'ALL',
  dndUntil: null,
  groupMode: 'MENTIONS_AND_THREADS',
  isDefault: {
    channelMode: true,
    directMode: true,
    groupMode: true,
    lockScreenPreview: true,
    sound: true,
  },
  lockScreenPreview: 'HIDDEN',
  sound: true,
};

/** `Screen`/`AppBar` gọi `useSafeAreaInsets()` — ném lỗi nếu thiếu provider. */
export const SAFE_AREA_METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};
