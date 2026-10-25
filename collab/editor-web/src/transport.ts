import { BRIDGE_VERSION, type EditorMessage } from "./bridge-protocol";

export interface BridgeTransport {
  /** Gửi tin cho app (bỏ qua nếu không có kênh). */
  send(message: EditorMessage): void;
  /** Đăng ký nhận tin thô từ app (chuỗi JSON hoặc object). Trả hàm huỷ đăng ký. */
  subscribe(handler: (raw: unknown) => void): () => void;
}

/** Phần của `window` mà transport dùng (để test bằng đối tượng giả). */
export interface TransportWindow {
  ReactNativeWebView?: { postMessage(data: string): void };
  parent?: { postMessage(data: unknown, targetOrigin: string): void };
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  document?: {
    addEventListener(type: "message", listener: (event: Event) => void): void;
    removeEventListener(type: "message", listener: (event: Event) => void): void;
  };
  __superAppEditor?: SuperAppEditorGlobal;
}

/** Điểm vào cho `injectJavaScript` của app + vết tin đã gửi (gỡ lỗi/kiểm thử ngoài RN). */
export interface SuperAppEditorGlobal {
  protocol: typeof BRIDGE_VERSION;
  receive(raw: unknown): void;
  /** Vòng đệm các tin đã gửi (tối đa `SENT_LOG_MAX`). */
  sent: EditorMessage[];
}

const SENT_LOG_MAX = 200;

/**
 * Transport trong WebView React Native:
 *  - app → web: `webViewRef.postMessage(json)` (sự kiện `message` trên `window` ở iOS, trên `document` ở Android — nghe cả hai, một tin chỉ xử lý MỘT lần)
 *    hoặc `injectJavaScript("window.__superAppEditor.receive(<json>)")`;
 *  - web → app: `window.ReactNativeWebView.postMessage(json)`; ngoài RN (trình duyệt/iframe) rơi về `parent.postMessage`.
 */
export function createWebViewTransport(win: TransportWindow): BridgeTransport {
  const handlers = new Set<(raw: unknown) => void>();
  const seen = new WeakSet<object>();
  const sent: EditorMessage[] = [];

  const dispatch = (raw: unknown): void => {
    for (const handler of [...handlers]) handler(raw);
  };
  const onEvent = (event: Event): void => {
    // Sự kiện phát trên `document` nổi bọt lên `window` — bỏ lượt thứ hai.
    if (seen.has(event)) return;
    seen.add(event);
    dispatch((event as MessageEvent).data);
  };
  win.addEventListener("message", onEvent);
  win.document?.addEventListener("message", onEvent);
  win.__superAppEditor = { protocol: BRIDGE_VERSION, receive: dispatch, sent };

  return {
    send(message) {
      sent.push(message);
      if (sent.length > SENT_LOG_MAX) sent.shift();
      const json = JSON.stringify(message);
      if (win.ReactNativeWebView) win.ReactNativeWebView.postMessage(json);
      // Ngoài RN: chỉ gửi lên khung cha khi thật sự nằm trong iframe (gửi cho chính mình sẽ dội lại thành tin lạ).
      else if (win.parent && (win.parent as unknown) !== (win as unknown)) win.parent.postMessage(json, "*");
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => void handlers.delete(handler);
    },
  };
}
