import RNCallKeep from 'react-native-callkeep';

import { ANDROID_CHANNEL_IDS } from '@/core/notifications';
import { logger } from '@/shared/utils/logger';

/**
 * `RNCallKeep.setup()` — CallKit (iOS) / self-managed `ConnectionService` (Android), p2-02 README §2. Gọi MỘT LẦN cho
 * suốt vòng đời tiến trình JS (module-level guard, cùng mẫu `initNotifications()` — `core/notifications/notifications.setup.ts`):
 * gọi lại nhiều lần vẫn an toàn phía native (RNCallKeep tự no-op), nhưng gác ở đây để tránh gọi lại vô ích qua Fast Refresh.
 *
 * ⚠️ Nuốt MỌI lỗi: app.config.ts (chỗ khai `@config-plugins/react-native-callkeep`) ghi rõ thư viện CHƯA xác nhận
 * tương thích Expo SDK 57/New Architecture qua thiết bị thật (README §10) — một tính năng phụ (đổ chuông kiểu hệ
 * thống) lỡ chưa chạy đúng trên máy nào đó không được kéo sập cả app; không có `setup()` thì cuộc gọi vẫn hoạt động,
 * chỉ là không đổ chuông ngoài UI trong app.
 */
let configured = false;

export async function setupCallKeep(): Promise<void> {
  if (configured) return;
  configured = true;
  try {
    await RNCallKeep.setup({
      android: {
        additionalPermissions: [],
        alertDescription:
          'Super App cần quyền này để hiện cuộc gọi đến kể cả khi màn hình khoá.',
        alertTitle: 'Cho phép quyền gọi điện',
        cancelButton: 'Để sau',
        // Trùng kênh Android đã tạo sẵn ở `core/notifications/android-channels.ts` — id lạ thì thông báo cuộc gọi
        // rơi về kênh mặc định của hệ thống, mất luôn âm chuông/độ ưu tiên đã cấu hình cho kênh `calls`.
        foregroundService: {
          channelId: ANDROID_CHANNEL_IDS.calls,
          channelName: 'Cuộc gọi',
          notificationTitle: 'Super App đang chạy nền cho cuộc gọi',
        },
        okButton: 'Đồng ý',
        selfManaged: true,
      },
      ios: {
        // Không có hằng runtime cho tên app: `APP_NAME` ở `app.config.ts` chỉ tồn tại lúc BUILD (native config),
        // không xuất qua `@/core/config/env.config` cho JS đọc lại — viết cứng chuỗi hiển thị trên CallKit.
        appName: 'Super App',
        maximumCallGroups: '1',
        maximumCallsPerCallGroup: '1',
        supportsVideo: true,
      },
    });
  } catch (error) {
    logger.warn('[callkeep] setup() thất bại — cuộc gọi vẫn hoạt động, chỉ không đổ chuông kiểu hệ thống:', error);
  }
}
