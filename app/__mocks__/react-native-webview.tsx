/**
 * Mock `react-native-webview` cho Jest.
 *
 * Gói gọi `TurboModuleRegistry.getEnforcing('RNCWebViewModule')` ngay lúc nạp — trong Node không có module native đó nên suite chết ở dòng
 * `import` ("could not be found. Verify that a module by this name is registered in the native binary"), không phải ở chỗ dùng. Đăng ký ở
 * `jest.setup.js` (`jest.mock('react-native-webview')`) để MỌI test dùng chung một bản.
 *
 * ── Cách test dùng ──────────────────────────────────────────────────────────
 *  · `<WebView>` render thành MỘT `View` giữ NGUYÊN mọi prop (`source`, `originWhitelist`, `onMessage`, `onLoadEnd`…) và có `testID`
 *    mặc định `webview` ⇒ `screen.getByTestId('webview').props.source` đọc được nguồn nạp, và
 *    `fireEvent(view, 'message', { nativeEvent: { data: JSON.stringify(msg) } })` gọi đúng `onMessage` (RNTL tìm prop `on<Event>`).
 *  · `ref` cho ra các phương thức của WebView thật (`injectJavaScript`, `postMessage`, `reload`…) là `jest.fn` DÙNG CHUNG toàn module —
 *    `import { webViewMethods } from '../../__mocks__/react-native-webview'` để `expect(webViewMethods.injectJavaScript).toHaveBeenCalledWith(…)`.
 *    ⚠️ Là hàm dùng chung nên PHẢI `resetWebViewMock()` ở `beforeEach` của suite kiểm số lần gọi.
 *
 * ⛔ Không có trình duyệt thật: JS trong trang KHÔNG chạy. Bridge app ↔ trang (docs editor, preview portfolio) chỉ kiểm được PHÍA APP
 * (tin gửi đi, cách xử lý tin nhận về); phía trang test riêng ở `collab/editor-web`.
 */
import { forwardRef, useImperativeHandle } from 'react';
import { View } from 'react-native';
import type { ViewProps } from 'react-native';

export const webViewMethods = {
  clearCache: jest.fn(),
  clearFormData: jest.fn(),
  clearHistory: jest.fn(),
  goBack: jest.fn(),
  goForward: jest.fn(),
  injectJavaScript: jest.fn(),
  postMessage: jest.fn(),
  reload: jest.fn(),
  requestFocus: jest.fn(),
  stopLoading: jest.fn(),
};

/** Đặt lại mọi phương thức dùng chung về trạng thái chưa gọi — gọi ở `beforeEach`. */
export function resetWebViewMock() {
  Object.values(webViewMethods).forEach((method) => method.mockClear());
}

export type MockWebViewHandle = typeof webViewMethods;

// Prop của WebView thật (`source`, `onMessage`…) không có trong `ViewProps` — nới kiểu để mock nhận hết mà vẫn không dùng `any`.
type MockWebViewProps = ViewProps & Record<string, unknown>;

export const WebView = forwardRef<MockWebViewHandle, MockWebViewProps>(
  function WebView(props, ref) {
    useImperativeHandle(ref, () => webViewMethods, []);
    return <View testID="webview" {...props} />;
  },
);

export default WebView;
