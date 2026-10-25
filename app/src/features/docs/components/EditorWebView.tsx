import { type RefObject, useMemo } from 'react';
import { View } from 'react-native';

import type { WebViewHandle, WebViewModule } from '../utils/load-webview-module';

/**
 * Hằng ở MỨC MODULE (không tạo lại mỗi lần vẽ): `source` mới là một prop native đổi — nếu WebView coi là đổi nguồn thì NẠP LẠI trang (mất Y.Doc cục bộ + kết nối)
 * mỗi khi màn vẽ lại, và `originWhitelist` mới làm hàm chặn điều hướng của thư viện dựng lại.
 */
const ORIGIN_WHITELIST = ['about:blank'];
const WEBVIEW_STYLE = { backgroundColor: 'transparent', flex: 1 } as const;
const allowOnlyInitialDocument = (request: { url: string }): boolean =>
  request.url.startsWith('about:');

export interface EditorWebViewProps {
  /** Nội dung `editor.html` (bundle một-file, CSP ghim hash) — nạp bằng `source.html`, KHÔNG `file://`. */
  html: string;
  /** Đổi giá trị này (`key`) để dựng lại WebView — sau khi tiến trình WebView chết hoặc "Thử lại". */
  instance: number;
  /** Module đã nạp lười (`useWebViewModule`) — không import tĩnh `react-native-webview`, xem `utils/load-webview-module.ts`. */
  module: WebViewModule;
  onMessage: (event: { nativeEvent: { data: string } }) => void;
  /** Tiến trình WebView chết (Android `onRenderProcessGone` / iOS `onContentProcessDidTerminate`) — dựng lại. */
  onProcessGone: () => void;
  webViewRef: RefObject<WebViewHandle | null>;
}

/**
 * WebView chạy bundle soạn thảo (p6-01 app.md §4, `docs/rules/webview.md`). Khoá chặt vì trang hiển thị NỘI DUNG DO NGƯỜI KHÁC SOẠN:
 *
 *  · `originWhitelist={['about:blank']}` — trang nạp từ chuỗi `html` nên gốc là `about:blank`; RN-WebView LUÔN thêm `about:blank` vào danh
 *    sách, còn URL ngoài danh sách bị nó tự `Linking.openURL` rồi chặn. Bridge đã lo liên kết (`openLink` → app hỏi rồi mới mở), nên
 *    thực tế không có điều hướng nào chạm tới đây.
 *  · `onShouldStartLoadWithRequest` chỉ cho `about:` — lớp thứ hai; mọi điều hướng khác bị từ chối.
 *  · Không quyền tệp (`allowFileAccess*` = false), không cửa sổ mới (`setSupportMultipleWindows` = false), không nội dung hỗn hợp, không cookie
 *    bên thứ ba, không chia sẻ cookie, `incognito` (không giữ gì lại giữa các lần mở), không định vị.
 *  · KHÔNG `injectedJavaScript`/`injectJavaScript`: app nói chuyện với trang CHỈ bằng `postMessage` (tin `{ v, type, payload }`).
 *  · `textZoom={100}` (Android): cỡ chữ hệ thống đã được bundle tự tính; để WebView phóng thêm là chữ nở hai lần.
 *  · `keyboardDisplayRequiresUserAction={false}` (iOS): nút "Sửa" gửi lệnh `focus` từ ngoài trang — thiếu prop này bàn phím không bật.
 *
 * ⚠️ Chưa kiểm trên máy thật (Android/iOS): nạp `source.html`, `postMessage` hai chiều, bàn phím + IME Telex/VNI.
 */
export function EditorWebView({
  html,
  instance,
  module,
  onMessage,
  onProcessGone,
  webViewRef,
}: EditorWebViewProps) {
  const { WebView } = module;
  const source = useMemo(() => ({ html }), [html]);

  return (
    // Nền do khung ngoài (`bg-bg-1`, token đổi theo sáng/tối) — WebView TRONG SUỐT, nên lúc trang chưa vẽ xong không lộ mảng trắng ở chế độ tối.
    <View className="flex-1 bg-bg-1">
      <WebView
        key={instance}
        ref={webViewRef}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowsLinkPreview={false}
        allowUniversalAccessFromFileURLs={false}
        androidLayerType="hardware"
        automaticallyAdjustContentInsets={false}
        bounces={false}
        geolocationEnabled={false}
        hideKeyboardAccessoryView
        incognito
        javaScriptCanOpenWindowsAutomatically={false}
        javaScriptEnabled
        keyboardDisplayRequiresUserAction={false}
        mixedContentMode="never"
        originWhitelist={ORIGIN_WHITELIST}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        sharedCookiesEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        source={source}
        style={WEBVIEW_STYLE}
        textZoom={100}
        thirdPartyCookiesEnabled={false}
        onContentProcessDidTerminate={onProcessGone}
        onMessage={onMessage}
        onRenderProcessGone={onProcessGone}
        onShouldStartLoadWithRequest={allowOnlyInitialDocument}
      />
    </View>
  );
}
