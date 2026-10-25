import { logger } from '@/shared/utils/logger';

import { appConfig } from './env.config';

/**
 * Cảnh báo khi cấu hình mâu thuẫn.
 *
 * Tách khỏi `env.config.ts` (đúng luật `check:file-size`: file đó chỉ còn
 * `RAW` + `appConfig`, và file này chỉ còn các nhánh cảnh báo — tách theo
 * ĐÚNG ranh giới "đọc biến" so với "diễn giải rủi ro giữa các biến").
 *
 * ⛔ Là HÀM, không phải khối chạy ở tầm module. Chạy tự động lúc nạp module thì
 * MỌI file test có import gián tiếp tới `appConfig` — tức gần như mọi test —
 * đều in ra cảnh báo này, và người đọc kết quả test sẽ quen mắt bỏ qua. Cảnh
 * báo mà bị bỏ qua thì không còn là cảnh báo.
 *
 * Gọi MỘT lần lúc khởi động app: xem `src/shell/providers/AppProviders.tsx`.
 *
 * Không `throw`: app vẫn phải chạy được khi chưa có backend (đó là trạng thái
 * xuất xưởng của base). Nhưng phải NÓI RA, vì cả ba ca dưới đây đều dẫn tới
 * triệu chứng "app hỏng" mà không có lỗi nào chỉ về nguyên nhân.
 */
export function warnOnRiskyConfig(): void {
  if (!__DEV__) return;

  if (appConfig.authEnabled && !appConfig.apiBaseUrl) {
    logger.warn(
      '⚠️ EXPO_PUBLIC_AUTH_ENABLED=true nhưng EXPO_PUBLIC_API_BASE_URL còn trống.\n' +
        '   Mọi lượt đăng nhập sẽ hỏng vì không biết gọi đi đâu. Điền URL vào `.env` ' +
        'rồi chạy lại `npm run start:clear`.',
    );
  }
  if (!appConfig.authEnabled) {
    logger.warn(
      '⚠️ EXPO_PUBLIC_AUTH_ENABLED=false — MỌI màn hình đang mở cho người chưa đăng nhập.\n' +
        '   Đúng cho lúc dựng giao diện. ⛔ PHẢI đặt `true` trước khi phát hành.',
    );
  }
  if (appConfig.authEnabled && !appConfig.socketUrl) {
    logger.warn(
      '⚠️ EXPO_PUBLIC_AUTH_ENABLED=true nhưng không suy ra được socketUrl (EXPO_PUBLIC_SOCKET_URL ' +
        'và EXPO_PUBLIC_API_BASE_URL đều trống).\n' +
        '   Socket sẽ không kết nối được — realtime (tin nhắn, thông báo, thu hồi quyền) im lặng ' +
        'không hoạt động. Điền một trong hai biến vào `.env` rồi chạy lại `npm run start:clear`.',
    );
  }
}
