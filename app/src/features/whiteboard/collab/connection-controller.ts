import { decideOnClose } from './close-policy';
import type { ControllerOptions } from './connection-controller.types';
import type { SessionPort } from './hocuspocus-port';
import { LinkState } from './link-state';
import { LinkTimers } from './link-timers';
import { Recovery } from './recovery';
import { parseNotice } from './session-status';

/**
 * Bộ điều khiển kết nối tới collab (bản bảng trắng của `ConnectionManager` ở editor-web, README §3.4–3.6): nhận sự kiện của provider
 * (`SessionPort`), cập nhật `LinkState` rồi báo `SessionSnapshot` ra ngoài — CHÍNH SÁCH nối lại/dừng/xin token nằm ở `Recovery`.
 * Token chỉ kiểm lúc THIẾT LẬP kết nối nên hàm `token` của provider gọi `tokens.ensure()` mỗi lần mở socket.
 */
export class ConnectionController {
  private readonly port: SessionPort;
  private readonly link = new LinkState();
  private readonly timers = new LinkTimers();
  private readonly recovery: Recovery;
  private destroyed = false;
  private lastEmitted = '';

  constructor(private readonly o: ControllerOptions) {
    this.recovery = new Recovery({
      classifyTokenError: o.classifyTokenError,
      emit: () => this.emit(),
      host: o.host,
      isDestroyed: () => this.destroyed,
      link: this.link,
      port: () => this.port,
      random: o.random,
      timers: this.timers,
      tokens: o.tokens,
    });
    this.port = o.createPort({
      doc: o.doc,
      documentName: o.documentName,
      handlers: {
        onAuthenticated: (scope) => {
          this.recovery.reset();
          this.timers.attempts = 0;
          this.link.onAuthenticated(scope);
          o.host.onFailure(null);
          this.emit();
        },
        onAuthenticationFailed: (reason) => this.recovery.onDenied(reason),
        onAwarenessChange: () => o.host.onPresence(),
        onClose: (info) => {
          this.link.onSocketClosed();
          this.recovery.apply(decideOnClose(info));
        },
        onStateless: (payload) => this.onStateless(payload),
        onStatus: (status) => this.onStatus(status),
        onSynced: () => {
          if (this.link.stopped || this.destroyed) return;
          this.link.onSynced();
          this.timers.clearInitial();
          this.emit();
        },
        onUnsyncedChanges: (count) => {
          this.link.unsynced = count;
          this.emit();
        },
      },
      token: this.recovery.fetchToken,
      url: o.url,
      user: o.user,
      ...(o.WebSocketPolyfill ? { WebSocketPolyfill: o.WebSocketPolyfill } : {}),
    });
  }

  get awareness(): SessionPort['awareness'] {
    return this.port.awareness;
  }

  connect(): void {
    this.armInitial();
    this.emit();
    this.port.connect();
  }

  /** Nối lại thủ công ("Thử lại"); gỡ trạng thái dừng để xác thực lại từ đầu. */
  retry(): void {
    if (this.destroyed) return;
    this.link.stopped = this.link.loadTimedOut = false;
    this.recovery.reset();
    this.timers.clear();
    this.timers.attempts = 0;
    this.armInitial();
    this.recovery.reconnectNow();
    this.emit();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.timers.clear();
    this.port.destroy();
  }

  private onStatus(status: 'connected' | 'connecting' | 'disconnected'): void {
    if (this.destroyed) return;
    this.link.wsStatus = status;
    if (status === 'disconnected') {
      this.link.onSocketClosed();
      if (this.recovery.connectWhenClosed && !this.link.stopped) {
        this.recovery.connectWhenClosed = false;
        this.port.connect();
      }
    }
    this.emit();
  }

  private onStateless(payload: string): void {
    const code = parseNotice(payload);
    if (!code) return;
    this.link.applyNotice(code);
    this.o.host.onNotice(code);
    this.emit();
  }

  private armInitial(): void {
    if (this.link.everSynced) return;
    this.timers.armInitial(this.o.loadTimeoutMs ?? 20_000, () => {
      if (this.link.everSynced || this.link.stopped || this.destroyed) return;
      this.link.loadTimedOut = true;
      this.emit();
      this.o.host.onFailure({ code: 'LOAD_FAILED', fatal: false });
    });
  }

  private emit(): void {
    if (this.destroyed) return;
    const snapshot = this.link.snapshot();
    const key = JSON.stringify(snapshot);
    if (key === this.lastEmitted) return;
    this.lastEmitted = key;
    this.o.host.onSnapshot(snapshot);
  }
}
