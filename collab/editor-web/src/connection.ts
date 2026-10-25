/**
 * Quản lý vòng đời kết nối tới collab: nối/nối lại, xin token, dừng theo lý do server, gom trạng thái.
 * Toàn bộ chính sách ở `close-policy.ts` (thuần); file này là phần có trạng thái + hẹn giờ, chỉ nói chuyện với `SessionPort` (provider) và
 * `ConnectionHost` (bridge). Nguyên tắc (README `collab/` §3.4–3.6):
 *  - provider tự nối lại ~1 s sau MỌI lần đóng ⇒ với `stop`/`refresh-token`/`backoff` phải `disconnect()` NGAY, kẻo dồn dập nối lại;
 *  - cùng một lần đóng có thể tới HAI lần (`authenticationFailed`/tin CLOSE trong luồng, rồi đóng socket thô) ⇒ mọi xử lý idempotent;
 *  - token chỉ kiểm lúc thiết lập kết nối: hàm `token` của provider chờ token mới (≤ `tokenWaitMs`, < 10 s auth-timeout của server) nếu token đã hết hạn.
 */
import type * as Y from "yjs";
import { decodeJwtClaims } from "./bridge-validate";
import type { CollabUser, ConnectionState, EditorErrorCode, NoticeCode } from "./bridge-protocol";
import { backoffDelayMs, decideOnClose, type CloseAction, type CloseInfo } from "./close-policy";
import { parseNotice } from "./notices";
import type { AuthScope, AwarenessProvider, SessionFactory, SessionPort, WsStatus } from "./session";

/** Số lần LIÊN TIẾP xin token mới vì `unauthorized` trước khi báo `AUTH_EXPIRED` (README: "tối đa 1–2 lần liên tiếp rồi báo lỗi"). */
const MAX_TOKEN_REFRESH = 2;
/** Token coi là hết hạn sớm hơn hạn thật chừng này để không mở socket bằng token sắp chết. */
const DEFAULT_EXPIRY_SKEW_MS = 5_000;

export interface ConnectionSnapshot {
  connection: ConnectionState;
  unsynced: boolean;
  saveFailed: boolean;
  /** Server chỉ cho đọc (scope `readonly`, thông báo `READ_ONLY`, tài liệu lưu trữ). */
  serverReadOnly: boolean;
  archived: boolean;
  serverTooLarge: boolean;
  /** Đã đồng bộ ít nhất một lần (có nội dung để hiển thị/sửa). */
  everSynced: boolean;
}

export interface ConnectionHost {
  requestToken(reason: "expired" | "unauthorized", attempt: number): void;
  error(code: EditorErrorCode, fatal: boolean, message: string, detail?: string): void;
  notice(code: NoticeCode): void;
  onChange(snapshot: ConnectionSnapshot): void;
  onPresence(): void;
}

export interface ConnectionOptions {
  createSession: SessionFactory;
  host: ConnectionHost;
  url: string;
  documentName: string;
  doc: Y.Doc;
  user: CollabUser;
  token: string;
  /** Epoch ms hạn token; thiếu thì đọc `exp` của JWT. */
  tokenExpiresAt?: number | undefined;
  now?: () => number;
  random?: () => number;
  /** Token coi là hết hạn sớm hơn hạn thật bấy lâu (mặc định 5 s). */
  expirySkewMs?: number;
  /** Chờ token mới từ app tối đa bấy lâu khi sắp nối mà token đã hết hạn (mặc định 6 s). */
  tokenWaitMs?: number;
  /** Quá bấy lâu chưa đồng bộ lần nào → báo `LOAD_FAILED` (không nghiêm trọng, vẫn thử tiếp; mặc định 20 s). */
  initialSyncTimeoutMs?: number;
  /** Sau `requestToken` mà app không đáp trong bấy lâu → báo `AUTH_EXPIRED` (mặc định 15 s). */
  tokenReplyTimeoutMs?: number;
  WebSocketPolyfill?: unknown;
}

export class ConnectionManager {
  private readonly session: SessionPort;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly host: ConnectionHost;

  private token: string;
  private expiresAtMs: number | undefined;
  private tokenWaiters: Array<(token: string) => void> = [];
  private tokenRequestInFlight = false;
  private tokenWaitTimer: ReturnType<typeof setTimeout> | undefined;
  private tokenReplyTimer: ReturnType<typeof setTimeout> | undefined;
  private tokenRequests = 0;

  private wsStatus: WsStatus = "disconnected";
  private authenticated = false;
  private synced = false;
  private everSynced = false;
  private unsyncedCount = 0;
  private saveFailed = false;
  private serverReadOnly = false;
  private archived = false;
  private serverTooLarge = false;
  private loadTimedOut = false;

  private stopped = false;
  private destroyed = false;
  private awaitingToken = false;
  private connectWhenClosed = false;
  private authFailures = 0;
  private backoffAttempts = 0;
  private backoffTimer: ReturnType<typeof setTimeout> | undefined;
  private initialTimer: ReturnType<typeof setTimeout> | undefined;
  private lastEmitted = "";

  constructor(private readonly o: ConnectionOptions) {
    this.host = o.host;
    this.now = o.now ?? (() => Date.now());
    this.random = o.random ?? Math.random;
    this.token = o.token;
    this.expiresAtMs = o.tokenExpiresAt ?? expiryOf(o.token);
    this.session = o.createSession({
      url: o.url,
      documentName: o.documentName,
      doc: o.doc,
      user: o.user,
      token: () => this.tokenForConnect(),
      ...(o.WebSocketPolyfill ? { WebSocketPolyfill: o.WebSocketPolyfill } : {}),
      handlers: {
        onStatus: (status) => this.onStatus(status),
        onAuthenticated: (scope) => this.onAuthenticated(scope),
        onAuthenticationFailed: (reason) => this.handleClosure({ reason }),
        onClose: (info) => this.onClose(info),
        onSynced: () => this.onSynced(),
        onUnsyncedChanges: (count) => {
          this.unsyncedCount = count;
          this.emit();
        },
        onStateless: (payload) => this.onStateless(payload),
        onAwarenessChange: () => this.host.onPresence(),
      },
    });
  }

  get awarenessProvider(): AwarenessProvider {
    return this.session.awarenessProvider;
  }

  /** Bắt đầu nối. Tách khỏi constructor để editor (cần `awarenessProvider`) được dựng trước. */
  connect(): void {
    this.armInitialTimer();
    this.emit();
    this.session.connect();
  }

  /** App gửi token mới (làm mới trước hạn 60 s hoặc đáp `requestToken`). */
  setToken(token: string, expiresAt?: number): void {
    this.token = token;
    this.expiresAtMs = expiresAt ?? expiryOf(token);
    this.tokenRequestInFlight = false;
    clearTimeout(this.tokenWaitTimer);
    clearTimeout(this.tokenReplyTimer);
    const waiters = this.tokenWaiters;
    this.tokenWaiters = [];
    for (const resolve of waiters) resolve(token);
    if (this.awaitingToken && !this.stopped && !this.destroyed) {
      this.awaitingToken = false;
      this.reconnectNow();
      this.emit();
    }
  }

  /** Nối lại thủ công (người dùng bấm "Thử lại"); cũng gỡ trạng thái dừng để xác thực lại từ đầu. */
  retry(): void {
    if (this.destroyed) return;
    this.stopped = false;
    this.awaitingToken = false;
    this.authFailures = 0;
    this.backoffAttempts = 0;
    this.loadTimedOut = false;
    clearTimeout(this.backoffTimer);
    this.backoffTimer = undefined;
    clearTimeout(this.tokenReplyTimer);
    this.armInitialTimer();
    this.reconnectNow();
    this.emit();
  }

  /** Dừng hẳn không báo lỗi (lỗi do controller báo, vd nội dung Yjs không hợp lệ với schema). */
  halt(): void {
    if (this.stopped || this.destroyed) return;
    this.stopped = true;
    this.clearTimers();
    this.session.disconnect();
    this.emit();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearTimers();
    const waiters = this.tokenWaiters;
    this.tokenWaiters = [];
    for (const resolve of waiters) resolve(this.token);
    this.session.destroy();
  }

  // ── token ──────────────────────────────────────────────────────────────

  private tokenUsable(): boolean {
    return this.expiresAtMs === undefined || this.now() < this.expiresAtMs - (this.o.expirySkewMs ?? DEFAULT_EXPIRY_SKEW_MS);
  }

  /** Hàm `token` của provider: gọi lúc mở MỖI socket. Hết hạn → xin app token mới và chờ (có trần), hết trần thì dùng token cũ (server sẽ báo `unauthorized`). */
  private tokenForConnect(): Promise<string> {
    if (this.tokenUsable() || this.destroyed) return Promise.resolve(this.token);
    return new Promise<string>((resolve) => {
      this.tokenWaiters.push(resolve);
      if (!this.tokenRequestInFlight) {
        this.tokenRequestInFlight = true;
        this.tokenRequests += 1;
        this.host.requestToken("expired", this.tokenRequests);
        this.tokenWaitTimer = setTimeout(() => {
          this.tokenRequestInFlight = false;
          const waiters = this.tokenWaiters;
          this.tokenWaiters = [];
          for (const r of waiters) r(this.token);
        }, this.o.tokenWaitMs ?? 6_000);
      }
    });
  }

  // ── sự kiện từ provider ────────────────────────────────────────────────

  private onStatus(status: WsStatus): void {
    if (this.destroyed) return;
    this.wsStatus = status;
    if (status === "disconnected") {
      this.authenticated = false;
      this.synced = false;
      if (this.connectWhenClosed && !this.stopped) {
        this.connectWhenClosed = false;
        this.session.connect();
      }
    }
    this.emit();
  }

  private onAuthenticated(scope: AuthScope): void {
    this.authenticated = true;
    this.authFailures = 0;
    this.backoffAttempts = 0;
    this.tokenRequests = 0;
    this.serverReadOnly = scope === "readonly";
    // Chỉ tài liệu được mở lại ở chế độ ghi mới hết "đã lưu trữ".
    if (scope === "read-write") this.archived = false;
    this.emit();
  }

  private onSynced(): void {
    if (this.stopped || this.destroyed) return;
    this.synced = true;
    this.everSynced = true;
    this.loadTimedOut = false;
    clearTimeout(this.initialTimer);
    this.emit();
  }

  private onClose(info: { code: number; reason: string }): void {
    this.synced = false;
    this.authenticated = false;
    this.handleClosure(info);
  }

  private onStateless(payload: string): void {
    const code = parseNotice(payload);
    if (!code) return;
    switch (code) {
      case "SAVE_FAILED":
        this.saveFailed = true;
        break;
      case "SAVE_RECOVERED":
        this.saveFailed = false;
        this.serverTooLarge = false;
        break;
      case "TOO_LARGE":
        this.serverTooLarge = true;
        this.host.error("TOO_LARGE", false, "Tài liệu quá lớn, không lưu thêm được", "server-notice");
        break;
      case "ARCHIVED":
        this.archived = true;
        this.serverReadOnly = true;
        break;
      case "READ_ONLY":
        this.serverReadOnly = true;
        break;
      case "RESTORED":
        break;
    }
    this.host.notice(code);
    this.emit();
  }

  // ── chính sách đóng/từ chối ───────────────────────────────────────────

  private handleClosure(info: CloseInfo): void {
    if (this.destroyed) return;
    this.apply(decideOnClose(info));
  }

  private apply(action: CloseAction): void {
    if (this.stopped) return;
    switch (action.kind) {
      case "ignore":
        return;
      case "stop":
        this.stopped = true;
        this.clearTimers();
        this.session.disconnect();
        this.emit();
        this.host.error(action.code, true, action.message, action.detail);
        return;
      case "refresh-token":
        this.refreshToken();
        return;
      case "backoff":
        this.scheduleBackoff();
        return;
      case "reconnect":
        if (action.archived) {
          this.archived = true;
          this.serverReadOnly = true;
        }
        this.emit();
        return;
    }
  }

  private refreshToken(): void {
    if (this.awaitingToken) return; // lượt thứ hai của cùng một lần đóng
    this.session.disconnect();
    this.authFailures += 1;
    this.awaitingToken = true;
    if (this.authFailures > MAX_TOKEN_REFRESH) {
      // Đã xin đủ lần mà vẫn bị từ chối: chờ app chủ động `setToken` (hoặc thoát) — không xin nữa.
      this.host.error("AUTH_EXPIRED", false, "Phiên làm việc đã hết hạn", "unauthorized");
    } else {
      this.tokenRequests += 1;
      this.host.requestToken("unauthorized", this.authFailures);
      this.tokenReplyTimer = setTimeout(
        () => this.host.error("AUTH_EXPIRED", false, "Không nhận được token mới", "no-token-reply"),
        this.o.tokenReplyTimeoutMs ?? 15_000,
      );
    }
    this.emit();
  }

  private scheduleBackoff(): void {
    if (this.backoffTimer || this.awaitingToken) return;
    this.session.disconnect();
    this.backoffAttempts += 1;
    this.backoffTimer = setTimeout(() => {
      this.backoffTimer = undefined;
      if (!this.stopped && !this.awaitingToken && !this.destroyed) this.reconnectNow();
    }, backoffDelayMs(this.backoffAttempts, this.random));
    this.emit();
  }

  /** `socket.connect()` chỉ có tác dụng khi socket đã ĐÓNG hẳn: nếu còn đang mở thì đợi sự kiện `disconnected` rồi mới nối. */
  private reconnectNow(): void {
    if (this.wsStatus === "disconnected") {
      this.session.connect();
      return;
    }
    this.connectWhenClosed = true;
    this.session.disconnect();
  }

  private armInitialTimer(): void {
    clearTimeout(this.initialTimer);
    if (this.everSynced) return;
    this.initialTimer = setTimeout(() => {
      if (this.everSynced || this.stopped || this.destroyed) return;
      this.loadTimedOut = true;
      this.emit();
      this.host.error("LOAD_FAILED", false, "Chưa kết nối được máy chủ", "initial-sync-timeout");
    }, this.o.initialSyncTimeoutMs ?? 20_000);
  }

  private clearTimers(): void {
    clearTimeout(this.backoffTimer);
    clearTimeout(this.initialTimer);
    clearTimeout(this.tokenWaitTimer);
    clearTimeout(this.tokenReplyTimer);
    this.backoffTimer = undefined;
  }

  // ── trạng thái ─────────────────────────────────────────────────────────

  private snapshot(): ConnectionSnapshot {
    const live = this.wsStatus === "connected" && this.authenticated && this.synced;
    const connection: ConnectionState = this.stopped ? "closed" : live ? "synced" : this.everSynced || this.loadTimedOut ? "offline" : "connecting";
    return {
      connection,
      unsynced: this.unsyncedCount > 0,
      saveFailed: this.saveFailed,
      serverReadOnly: this.serverReadOnly,
      archived: this.archived,
      serverTooLarge: this.serverTooLarge,
      everSynced: this.everSynced,
    };
  }

  private emit(): void {
    if (this.destroyed) return;
    const snap = this.snapshot();
    const key = JSON.stringify(snap);
    if (key === this.lastEmitted) return;
    this.lastEmitted = key;
    this.host.onChange(snap);
  }
}

/** `exp` (giây) của JWT → epoch ms; không đọc được → `undefined` (coi như còn hạn, server là nơi quyết định). */
function expiryOf(token: string): number | undefined {
  const exp = decodeJwtClaims(token)?.["exp"];
  return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : undefined;
}
