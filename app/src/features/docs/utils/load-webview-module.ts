import { logger } from '@/shared/utils/logger';

const importWebViewModule = () => import('react-native-webview');

/** Kiểu module — suy từ chính lời gọi `import()`, nên không cần một dòng `import … from 'react-native-webview'` nào. */
export type WebViewModule = Awaited<ReturnType<typeof importWebViewModule>>;

let loaded: WebViewModule | null = null;

/**
 * Nạp LƯỜI `react-native-webview` bằng `import()` động, trong try/catch — trả `null` khi bản dev client chưa có module native (`RNCWebViewModule`).
 *
 * ⛔ KHÔNG viết `import … from 'react-native-webview'` ở đầu file nào được nạp lúc khởi động — kể cả `import type`. Expo Router nạp MỌI file route lúc mở app; gói này gọi
 * `TurboModuleRegistry.getEnforcing('RNCWebViewModule')` khi nạp và NÉM LỖI nếu dev client cài trước đợt thêm gói chưa build lại ⇒ app đỏ màn NGAY LÚC MỞ, kể cả người không vào màn soạn thảo
 * (`docs/native-libraries.md` "Nạp lười module native"). `tests/docs-webview-lazy.test.ts` quét nguồn để chặn import tĩnh quay lại. Cùng khuôn `career/utils/load-webview-module.ts`.
 *
 * ⚠️ Jest KHÔNG chạy được `import()` động: test màn soạn thảo mock CHÍNH file này (`jest.mock('../utils/load-webview-module')`) — đó là lý do hàm nằm ở file riêng.
 */
export async function loadWebViewModule(): Promise<WebViewModule | null> {
  if (loaded) return loaded;
  try {
    loaded = await importWebViewModule();
    return loaded;
  } catch (error) {
    // Cảnh báo (chỉ ở dev) chứ không ném: người phát triển thấy ngay "cần build lại dev client", người dùng cuối thấy màn "bản cài đặt này chưa hỗ trợ soạn thảo".
    if (__DEV__) {
      logger.warn(
        '[docs] Không nạp được react-native-webview — bản cài đặt này chưa có module native RNCWebViewModule. Build lại dev client (npm run start:android) để soạn tài liệu.',
        error,
      );
    }
    return null;
  }
}

/** Thể hiện `WebView` (có `postMessage`, `requestFocus`…) — để gõ kiểu cho `ref` mà không cần import tĩnh gói. */
export type WebViewHandle = InstanceType<WebViewModule['WebView']>;
