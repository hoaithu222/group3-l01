import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

import { logger } from '@/shared/utils/logger';

import type { EditorMessage, InitPayload } from '../webview/doc-editor-bridge.types';
import { DocEditorBridge, hostMessage } from '../webview/doc-editor-bridge';
import { parseEditorMessage } from '../webview/parse-editor-message';
import type { WebViewHandle } from '../utils/load-webview-module';

/**
 * `ref` của WebView + cầu nối có hàng đợi, tạo TRƯỚC để các hook khác (ảnh, token…) cầm `bridge` ổn định rồi mới ghép `useEditorHost`.
 * `bridge.post` đi qua `ref` nên WebView dựng lại (đổi `key`) vẫn nhận tin mà không phải tạo cầu mới.
 */
export function useEditorBridge() {
  const webViewRef = useRef<WebViewHandle | null>(null);
  const [bridge] = useState(() => new DocEditorBridge());
  // Gắn hàm gửi trong effect (ref chỉ đọc ngoài render). `webViewRef.current` đọc LÚC GỬI nên WebView dựng lại (đổi `key`) vẫn nhận tin.
  useEffect(() => {
    bridge.attach((json) => webViewRef.current?.postMessage(json));
    return () => bridge.attach(null);
  }, [bridge]);
  return { bridge, webViewRef };
}

export interface EditorHostOptions {
  bridge: DocEditorBridge;
  /** Dựng `init` MỖI lần trang báo `ready` (live: xin token MỚI — lần nối lại nào cũng vậy; snapshot: mang state bản lưu). */
  buildInit: () => Promise<InitPayload>;
  /** Trang gửi `ready` sai giao thức (bundle và app lệch `BRIDGE_VERSION`) — không thể `init`. */
  onIncompatible: () => void;
  onInitError: (error: unknown) => void;
  /** Tin đã kiểm, KHÔNG gồm `ready` (host xử lý). */
  onMessage: (message: EditorMessage) => void;
  /** Trang nạp mới (lần đầu hoặc sau khi dựng lại WebView) — dọn trạng thái của phiên trước. */
  onReady?: () => void;
}

/**
 * Chủ của một WebView soạn thảo: kiểm MỌI tin từ trang bằng `parseEditorMessage` và chạy trình tự `ready` → `init` (README §10.1).
 * Dùng cho cả editor trực tiếp lẫn xem bản lưu (chỉ khác `buildInit`).
 *
 *  · Tin sai/lạ bị BỎ (chỉ log ở dev, không log nội dung — có thể chứa văn bản người dùng).
 *  · `remount()` dựng WebView mới (đổi `key`) — khi tiến trình WebView chết (Android `onRenderProcessGone`, iOS
 *    `onContentProcessDidTerminate`) hoặc người dùng bấm "Thử lại"; trang mới tự gửi `ready` và chạy lại `init` với token mới.
 *  · Rời màn: gửi `dispose` (trang đóng provider gọn — người khác thấy mình rời ngay) trước khi WebView bị huỷ.
 */
export function useEditorHost(options: EditorHostOptions) {
  const { bridge } = options;
  const [instance, setInstance] = useState(0);
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const initSeq = useRef(0);

  const onMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      const parsed = parseEditorMessage(event.nativeEvent.data);
      if (!parsed.ok) {
        if (parsed.type === 'ready') latest.current.onIncompatible();
        else if (__DEV__)
          logger.warn('[docs] Bỏ tin bridge không hợp lệ', parsed.reason, parsed.type);
        return;
      }
      const { message } = parsed;
      if (message.type !== 'ready') {
        latest.current.onMessage(message);
        return;
      }
      bridge.reset();
      latest.current.onReady?.();
      initSeq.current += 1;
      const seq = initSeq.current;
      latest.current.buildInit().then(
        (init) => {
          if (seq === initSeq.current) bridge.send(hostMessage('init', init));
        },
        (error: unknown) => {
          if (seq === initSeq.current) latest.current.onInitError(error);
        },
      );
    },
    [bridge],
  );

  const remount = useCallback(() => {
    bridge.reset();
    initSeq.current += 1;
    setInstance((value) => value + 1);
  }, [bridge]);

  // Layout effect: cleanup của cha chạy TRƯỚC khi ref của WebView (con) bị gỡ, nên `dispose` còn tới được trang.
  useLayoutEffect(() => {
    const seq = initSeq;
    return () => {
      seq.current += 1;
      bridge.send(hostMessage('dispose', {}));
    };
  }, [bridge]);

  return { instance, onMessage, remount };
}

export type EditorWebViewRef = RefObject<WebViewHandle | null>;
