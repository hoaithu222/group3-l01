import { decideOnClose, type CloseAction } from './close-policy';
import type { ControllerHost, ControllerOptions } from './connection-controller.types';
import type { SessionPort } from './hocuspocus-port';
import type { LinkState } from './link-state';
import type { LinkTimers } from './link-timers';
import type { FailureCode } from './session-status';

/** Số lần LIÊN TIẾP xin token mới vì `unauthorized` trước khi báo `AUTH_EXPIRED` (README: "tối đa 1–2 lần liên tiếp rồi báo lỗi"). */
const MAX_TOKEN_REFRESH = 2;

export interface RecoveryDeps {
  classifyTokenError: ControllerOptions['classifyTokenError'];
  emit: () => void;
  host: ControllerHost;
  isDestroyed: () => boolean;
  link: LinkState;
  port: () => SessionPort;
  random?: (() => number) | undefined;
  timers: LinkTimers;
  tokens: ControllerOptions['tokens'];
}

/**
 * Phần CHÍNH SÁCH của bộ điều khiển kết nối: từ một lần đóng/từ chối của server (`CloseAction`) suy ra dừng hẳn, xin token mới, hẹn nối lại
 * hay để provider tự nối. Nguyên tắc (README §3.4): provider tự nối lại ~1 s sau MỌI lần đóng ⇒ với `stop`/`refresh-token`/`backoff` phải
 * `disconnect()` NGAY; một lần đóng có thể tới HAI lần (`authenticationFailed`/tin CLOSE, rồi đóng socket thô) ⇒ mọi xử lý idempotent.
 */
export class Recovery {
  connectWhenClosed = false;
  authFailures = 0;
  private renewing = false;
  private tokenError: unknown = null;

  constructor(private readonly d: RecoveryDeps) {}

  /** Hàm `token` của provider (gọi lúc mở MỖI socket): nhớ lỗi để `onDenied` phân biệt "token hỏng" với "server từ chối". */
  fetchToken = async (): Promise<string> => {
    try {
      return (await this.d.tokens.ensure()).token;
    } catch (error) {
      this.tokenError = error;
      throw error;
    }
  };

  /** Thử lại thủ công: gỡ mọi trạng thái chờ. */
  reset(): void {
    this.renewing = false;
    this.authFailures = 0;
  }

  /** `authenticationFailed`: lý do là xin token LỖI (provider báo "Failed to get token") thì xử theo loại lỗi, không theo `reason`. */
  onDenied(reason: string): void {
    const error = this.tokenError;
    this.tokenError = null;
    if (error === null) this.apply(decideOnClose({ reason }));
    else this.onTokenError(error);
  }

  apply(action: CloseAction): void {
    const { link } = this.d;
    if (link.stopped || this.d.isDestroyed()) return;
    if (action.kind === 'stop') this.stopWith(action.code);
    else if (action.kind === 'refresh-token') this.refreshToken();
    else if (action.kind === 'backoff') this.scheduleBackoff();
    else if (action.kind === 'reconnect') {
      if (action.archived) link.markArchived();
      this.d.emit();
    }
  }

  /** `socket.connect()` chỉ có tác dụng khi socket đã ĐÓNG hẳn: còn đang mở thì đợi sự kiện `disconnected` rồi mới nối. */
  reconnectNow(): void {
    if (this.d.link.wsStatus === 'disconnected') this.d.port().connect();
    else {
      this.connectWhenClosed = true;
      this.d.port().disconnect();
    }
  }

  private onTokenError(error: unknown): void {
    if (this.d.isDestroyed() || this.d.link.stopped) return;
    if (this.d.classifyTokenError(error) === 'forbidden') this.stopWith('FORBIDDEN');
    else {
      this.d.host.onFailure({ code: 'TOKEN_FAILED', fatal: false });
      this.scheduleBackoff();
    }
  }

  private stopWith(code: FailureCode): void {
    this.d.link.stopped = true;
    this.d.timers.clear();
    this.d.port().disconnect();
    this.d.emit();
    this.d.host.onFailure({ code, fatal: true });
  }

  private refreshToken(): void {
    if (this.renewing) return; // lượt thứ hai của cùng một lần đóng
    this.d.port().disconnect();
    this.renewing = true;
    if (++this.authFailures > MAX_TOKEN_REFRESH) {
      this.d.host.onFailure({ code: 'AUTH_EXPIRED', fatal: false });
      return;
    }
    this.d.tokens.refresh().then(
      () => {
        this.renewing = false;
        if (!this.d.link.stopped && !this.d.isDestroyed()) this.reconnectNow();
      },
      (error: unknown) => {
        this.renewing = false;
        this.onTokenError(error);
      },
    );
  }

  private scheduleBackoff(): void {
    if (this.renewing) return;
    const armed = this.d.timers.scheduleBackoff(() => {
      if (!this.d.link.stopped && !this.renewing && !this.d.isDestroyed()) this.reconnectNow();
    }, this.d.random);
    if (armed) this.d.port().disconnect();
  }
}
