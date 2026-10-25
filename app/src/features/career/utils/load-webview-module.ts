import { logger } from '@/shared/utils/logger';

const importWebViewModule = () => import('react-native-webview');

/** Kiểu module — suy từ chính lời gọi `import()`, nên không cần một dòng `import … from 'react-native-webview'` nào. */
export type WebViewModule = Awaited<ReturnType<typeof importWebViewModule>>;

let loaded: WebViewModule | null = null;

/**
 * Nạp LƯỜI `react-native-webview` bằng `import()` động, trong try/catch — trả `null` khi bản dev client chưa có module native (`RNCWebViewModule`).
 *
 * ⛔ KHÔNG viết `import … from 'react-native-webview'` ở đầu file nào được nạp lúc khởi động — kể cả `import type`. Expo Router nạp MỌI file route lúc mở app; gói này gọi
 * `TurboModuleRegistry.getEnforcing('RNCWebViewModule')` khi nạp và NÉM LỖI nếu dev client cài trước đợt thêm gói chưa build lại ⇒ app đỏ màn NGAY LÚC MỞ, kể cả người không vào màn xem trước
 * (`docs/native-libraries.md` "Nạp lười module native"). `tests/WebViewLazy.test.ts` (feature career) quét nguồn để chặn import tĩnh quay lại. Cùng khuôn `members/utils/load-camera-module.ts`.
 *
 * ⚠️ Jest KHÔNG chạy được `import()` động: test của màn xem trước mock CHÍNH file này (`jest.mock('../utils/load-webview-module')`) — đó là lý do hàm nằm ở file riêng.
 */
export async function loadWebViewModule(): Promise<WebViewModule | null> {
  if (loaded) return loaded;
  try {
    loaded = await importWebViewModule();
    return loaded;
  } catch (error) {
    // Cảnh báo (chỉ ở dev) chứ không ném: người phát triển thấy ngay "cần build lại dev client", người dùng cuối thấy màn "chưa hỗ trợ xem trước" kèm đường mở trang bằng trình duyệt.
    if (__DEV__) {
      logger.warn(
        '[portfolio] Không nạp được react-native-webview — bản cài đặt này chưa có module native RNCWebViewModule. Build lại dev client (npm run start:android) để xem trước portfolio.',
        error,
      );
    }
    return null;
  }
}
