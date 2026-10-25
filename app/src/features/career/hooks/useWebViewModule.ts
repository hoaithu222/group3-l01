import { useEffect, useState } from 'react';

import { loadWebViewModule, type WebViewModule } from '../utils/load-webview-module';

export type WebViewModuleState =
  { status: 'loading' } | { status: 'unavailable' } | { status: 'ready'; module: WebViewModule };

/**
 * Trạng thái nạp lười `react-native-webview`: `loading` → `ready` (có `WebView` để dựng) hoặc `unavailable` (dev client chưa build lại với gói native — màn xem trước hiện "bản cài đặt này chưa hỗ trợ").
 * Nạp SAU khi màn mở, không phải lúc khởi động app — xem lý do ở `load-webview-module.ts`.
 */
export function useWebViewModule(): WebViewModuleState {
  const [state, setState] = useState<WebViewModuleState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void loadWebViewModule().then((module) => {
      if (!cancelled) setState(module ? { module, status: 'ready' } : { status: 'unavailable' });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
