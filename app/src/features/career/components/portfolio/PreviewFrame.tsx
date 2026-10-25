import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { appConfig } from '@/core/config/env.config';
import { LoadingMore } from '@/shared/ui/progress';

import { PREVIEW_TABLET_WIDTH } from '../../constants/portfolio.constants';
import type { PreviewSource } from '../../hooks/usePreviewSource';
import type { WebViewModule } from '../../utils/load-webview-module';

export type PreviewDevice = 'phone' | 'tablet';

export interface PreviewFrameProps {
  /** Module đã nạp lười (`useWebViewModule`) — không import tĩnh `react-native-webview`, xem `load-webview-module.ts`. */
  module: WebViewModule;
  source: PreviewSource;
  device: PreviewDevice;
  /** Bấm một liên kết trong trang (https) — nơi gọi hỏi rồi mới mở ngoài app. */
  onLink: (url: string) => void;
  /** `statusCode` khi máy chủ trả lỗi HTTP (404 chưa có hồ sơ, 401…); `undefined` khi lỗi mạng/không nạp được. */
  onFailed: (statusCode: number | undefined) => void;
}

/** `https://host:port` của API — chỉ cho phép WebView nạp ĐÚNG nguồn này. Tách bằng regex (không `new URL`: bản `URL` của Hermes thiếu `origin`). */
const API_ORIGIN = /^(https?:\/\/[^/]+)/.exec(appConfig.apiBaseUrl)?.[1] ?? '';

/**
 * Khung WebView xem trước (app.md p6-07 §3, §6; `docs/rules/webview.md`). Trang là HTML tĩnh không có JavaScript ⇒ TẮT `javaScriptEnabled` (đã tắt thì CSP không phải là hàng rào duy nhất), không cho
 * mở cửa sổ mới, `originWhitelist` chỉ nguồn API, và `onShouldStartLoadWithRequest` CHẶN mọi điều hướng khác lượt nạp đầu — bấm liên kết https trong trang chỉ báo lên (`onLink`) để hỏi người dùng rồi mở
 * bằng trình duyệt, không bao giờ nạp trang lạ vào khung đang mang token đăng nhập.
 *
 * "Máy tính bảng" giả lập bằng KHUNG RỘNG `PREVIEW_TABLET_WIDTH` trong `ScrollView` ngang (viewport của trang đi theo bề rộng khung): trên điện thoại thì cuộn ngang để xem hết. Bề rộng số cứng ở đây là
 * kích thước THIẾT BỊ GIẢ LẬP, không phải bố cục của màn hình — ngoại lệ có chủ ý của luật "không `w-[…px]` cho khối bố cục".
 */
export function PreviewFrame({ device, module, onFailed, onLink, source }: PreviewFrameProps) {
  const [loading, setLoading] = useState(true);
  const { WebView } = module;

  const web = (
    <WebView
      javaScriptEnabled={false}
      originWhitelist={[API_ORIGIN]}
      setSupportMultipleWindows={false}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      source={source}
      style={device === 'tablet' ? { width: PREVIEW_TABLET_WIDTH } : { flex: 1 }}
      onError={() => onFailed(undefined)}
      onHttpError={(event) => onFailed(event.nativeEvent.statusCode)}
      onLoadEnd={() => setLoading(false)}
      onLoadStart={() => setLoading(true)}
      onShouldStartLoadWithRequest={(request) => {
        if (request.url === source.uri || request.url.startsWith('about:')) return true;
        if (/^https:\/\//i.test(request.url)) onLink(request.url);
        return false;
      }}
    />
  );

  return (
    <View className="flex-1 overflow-hidden rounded-md bg-bg-1">
      {device === 'tablet' ? (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ width: PREVIEW_TABLET_WIDTH }}
          horizontal
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          {web}
        </ScrollView>
      ) : (
        web
      )}
      {loading ? (
        <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
          <LoadingMore label="Đang tải bản xem trước" />
        </View>
      ) : null}
    </View>
  );
}
