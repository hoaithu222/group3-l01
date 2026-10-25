import {
  BRIDGE_VERSION,
  type CommandBody,
  type HostMessage,
  type HostMessageType,
} from './doc-editor-bridge.types';

type PayloadOf<T extends HostMessageType> = Extract<HostMessage, { type: T }>['payload'];

/** Dựng tin app → web có kiểu chặt theo `type` (payload sai kiểu là `tsc` đỏ, không phải WebView im lặng bỏ tin). */
export function hostMessage<T extends HostMessageType>(
  type: T,
  payload: PayloadOf<T>,
): HostMessage {
  return { payload, type, v: BRIDGE_VERSION } as HostMessage;
}

/** Trần hàng đợi: tin dồn trước khi có `init` (bấm nút lúc WebView đang nạp) — quá trần thì bỏ tin CŨ NHẤT. */
const QUEUE_MAX = 30;

export type BridgePoster = (json: string) => void;

/**
 * Cầu nối app → WebView: gửi bằng `WebView.postMessage(json)` (sự kiện `message` ở phía trang — KHÔNG `injectJavaScript`, app không
 * chèn mã nào ngoài tin bridge) và XẾP HÀNG mọi tin gửi TRƯỚC `init`.
 *
 * Trình tự bắt buộc (README §10.1): trang gửi `ready` → app xin token mới → gửi `init` → mọi thứ khác. Tin tới trước `init` mà gửi ngay
 * thì editor đáp `not-initialized`/bỏ tin; nên `send` giữ lại đến khi `init` đã đi rồi xả theo thứ tự. `reset()` khi trang nạp lại
 * (`ready` tới lần nữa — WebView chết tiến trình/reload): hàng đợi cũ thuộc phiên trước, bỏ đi.
 */
export class DocEditorBridge {
  private open = false;
  private post: BridgePoster | null;
  private queue: HostMessage[] = [];

  constructor(post: BridgePoster | null = null) {
    this.post = post;
  }

  /**
   * Gắn/gỡ hàm gửi thật (`WebView.postMessage`). Gắn SAU khi dựng (trong effect) chứ không truyền qua constructor: hàm gửi đọc `ref` của WebView,
   * mà `ref.current` không được chạm trong lúc render. Chưa gắn (hoặc đã gỡ lúc rời màn) thì tin đi ra bị bỏ.
   */
  attach(post: BridgePoster | null): void {
    this.post = post;
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Trang nạp mới (hoặc nạp lại): đóng cổng, bỏ hàng đợi của phiên trước. */
  reset(): void {
    this.open = false;
    this.queue = [];
  }

  send(message: HostMessage): void {
    if (message.type === 'init') {
      this.post?.(JSON.stringify(message));
      this.open = true;
      const pending = this.queue;
      this.queue = [];
      pending.forEach((item) => this.post?.(JSON.stringify(item)));
      return;
    }
    if (this.open) {
      this.post?.(JSON.stringify(message));
      return;
    }
    this.queue.push(message);
    if (this.queue.length > QUEUE_MAX) this.queue.shift();
  }

  /** Lệnh toolbar — mọi lệnh đi qua đây để có MỘT chỗ gắn `requestId` khi cần kết quả. */
  command(body: CommandBody, requestId?: string): void {
    this.send(hostMessage('command', requestId ? { ...body, requestId } : body));
  }
}
