import { useEffect, useState } from 'react';

import { loadWebViewModule, type WebViewModule } from '../utils/load-webview-module';

export type WebViewModuleState =
  { status: 'loading' } | { status: 'unavailable' } | { module: WebViewModule; status: 'ready' };

/**
 * Trạng thái nạp lười `react-native-webview`: `loading` → `ready` (có `WebView` để dựng) hoặc `unavailable` (dev client chưa build lại với gói
 * native — màn hiện "bản cài đặt này chưa hỗ trợ soạn thảo"). Nạp SAU khi màn mở, không phải lúc khởi động app — lý do ở `load-webview-module.ts`.
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
