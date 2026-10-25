import { Awareness } from "y-protocols/awareness";
import type { SessionFactory, SessionHandlers, SessionOptions, SessionPort, WsStatus } from "../../src/session";

const CLOSE_CODES: Record<string, number> = {
  unauthorized: 4401,
  forbidden: 4403,
  revoked: 4403,
  "not-found": 4404,
  "auth-timeout": 4408,
  archived: 4409,
  "too-many-connections": 4429,
  "rate-limited": 4429,
  unavailable: 4503,
  "unsupported-message": 4400,
  "awareness-invalid": 4400,
};

/**
 * Phiên giả có cùng hình dạng sự kiện với provider thật: từ chối xác thực = `authenticationFailed` RỒI đóng socket thô (mã 44xx);
 * thu hồi = tin CLOSE trong luồng (code 1000) RỒI đóng socket thô. `holdClose` giữ sự kiện `disconnected` tới khi test gọi `flushClose()`
 * (provider thật đóng socket bất đồng bộ).
 */
export class FakeSession implements SessionPort {
  readonly awareness: Awareness;
  readonly awarenessProvider: { awareness: Awareness };
  readonly handlers: SessionHandlers;
  readonly options: SessionOptions;
  connectCalls = 0;
  disconnectCalls = 0;
  destroyed = false;
  unsyncedChanges = 0;
  synced = false;
  holdClose = false;
  status: WsStatus = "disconnected";
  private pendingClose = false;

  constructor(options: SessionOptions) {
    this.options = options;
    this.handlers = options.handlers;
    this.awareness = new Awareness(options.doc);
    this.awarenessProvider = { awareness: this.awareness };
    this.awareness.setLocalStateField("user", { id: options.user.id, name: options.user.name, color: options.user.color });
    // Như HocuspocusProvider: awareness đổi → báo `onAwarenessChange`.
    this.awareness.on("change", () => this.handlers.onAwarenessChange());
  }

  connect(): void {
    this.connectCalls += 1;
    if (this.status === "connected") return; // như socket thật: đang nối thì bỏ qua
    this.setStatus("connecting");
  }

  disconnect(): void {
    this.disconnectCalls += 1;
    if (this.status === "disconnected") return;
    if (this.holdClose) this.pendingClose = true;
    else this.closeNow();
  }

  destroy(): void {
    this.destroyed = true;
    this.awareness.destroy();
  }

  flushClose(): void {
    if (this.pendingClose) {
      this.pendingClose = false;
      this.closeNow();
    }
  }

  // ── điều khiển từ test ─────────────────────────────────────────────────

  /** Server chấp nhận: mở socket, xác thực, đồng bộ xong. */
  open(scope: "read-write" | "readonly" = "read-write"): void {
    this.setStatus("connected");
    this.handlers.onAuthenticated(scope);
    this.synced = true;
    this.handlers.onSynced();
  }

  /** Server từ chối xác thực. */
  denyAuth(reason: string): void {
    this.setStatus("connected");
    this.handlers.onAuthenticationFailed(reason);
    this.rawClose(CLOSE_CODES[reason] ?? 1000, reason);
  }

  /** Server thu hồi/đá kết nối đang chạy: tin CLOSE trong luồng rồi đóng socket thô. */
  kick(reason: string): void {
    this.handlers.onClose({ code: 1000, reason });
    this.rawClose(CLOSE_CODES[reason] ?? 1000, reason);
  }

  /** Mất mạng (không có lý do từ server). */
  dropNetwork(): void {
    this.rawClose(1006, "");
  }

  notice(code: string): void {
    this.handlers.onStateless(JSON.stringify({ v: 1, type: "notice", code }));
  }

  unsynced(count: number): void {
    this.unsyncedChanges = count;
    this.handlers.onUnsyncedChanges(count);
  }

  /** Hàm `token` của provider (gọi lúc mở socket). */
  token(): Promise<string> {
    return this.options.token();
  }

  private rawClose(code: number, reason: string): void {
    this.synced = false;
    this.handlers.onClose({ code, reason });
    if (this.status !== "disconnected") this.setStatus("disconnected");
  }

  private closeNow(): void {
    this.synced = false;
    this.setStatus("disconnected");
  }

  private setStatus(status: WsStatus): void {
    this.status = status;
    this.handlers.onStatus(status);
  }
}

export function createFakeSessionFactory(): { factory: SessionFactory; sessions: FakeSession[]; readonly last: FakeSession } {
  const sessions: FakeSession[] = [];
  return {
    factory: (options) => {
      const session = new FakeSession(options);
      sessions.push(session);
      return session;
    },
    sessions,
    get last() {
      const session = sessions.at(-1);
      if (!session) throw new Error("chưa có phiên nào được tạo");
      return session;
    },
  };
}
