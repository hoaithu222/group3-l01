/**
 * @file socket.bridge.client.ts
 * @description Cài đặt cầu nối worker → socket: bọc `@socket.io/redis-emitter` bằng một "client Redis" không bao giờ ném/treo (xem `socket.bridge.ts`
 * cho lý do thiết kế và vòng đời). File LÁ — chỉ import `redis-emitter`, logger và kiểu.
 */
import { Emitter } from "@socket.io/redis-emitter";
import { logger } from "../logger";
import type { BridgePublisher, BroadcastOp, SocketBridge, SocketBridgeStats } from "./socket.bridge.types";

/** Cùng một loại cảnh báo chỉ log tối đa một lần / khoảng này (kèm số lần bị nén). */
const WARN_INTERVAL_MS = 10_000;

/** Ngữ nghĩa JSON y hệt lúc socket.io mã hoá gói gửi client (`undefined` giữ nguyên để không phá đối số vắng mặt). */
function toWire(value: unknown): unknown {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as unknown;
}

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export class SocketBridgeClient implements SocketBridge {
  readonly broadcaster: BroadcastOp;
  private readonly emitter: Emitter;
  private readonly inflight = new Set<Promise<void>>();
  private readonly counters = { published: 0, dropped: 0, failed: 0, timedOut: 0, noSubscribers: 0 };
  private readonly warned = new Map<string, { at: number; suppressed: number }>();
  private closed = false;

  constructor(
    private readonly publisher: BridgePublisher,
    key: string,
    private readonly timeoutMs: number,
    private readonly maxInflight: number,
    private readonly closeTimeoutMs: number
  ) {
    // `Emitter` chỉ cần `publish()` và BỎ QUA giá trị trả về (nếu promise reject sẽ thành unhandled rejection) ⇒ đưa vào một "client" bọc:
    // không bao giờ ném, không bao giờ treo, không rò promise.
    this.emitter = new Emitter({ publish: (channel: string, message: string | Buffer): void => this.publish(channel, message) }, { key });
    this.broadcaster = this.wrap(this.emitter);
  }

  serverSideEmit(event: string, payload: unknown): void {
    this.guard(`serverSideEmit:${event}`, () => this.emitter.serverSideEmit(event, toWire(payload)));
  }

  stats(): SocketBridgeStats {
    return { ...this.counters, inflight: this.inflight.size };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.inflight.size > 0) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, this.closeTimeoutMs);
        timer.unref();
      });
      // Promise trong `inflight` luôn resolve (xem `publish()`), không cần bắt lỗi ở đây.
      await Promise.race([Promise.all([...this.inflight]).then(() => undefined), deadline]);
      clearTimeout(timer);
    }
    // Tổng kết một dòng khi tắt — số sự kiện bỏ/lỗi/không ai nghe cho biết realtime từ worker có khoẻ không (worker không có `/metrics`).
    logger.info("[socket.bridge] Đã đóng cầu nối worker → socket", this.stats());
  }

  private wrap(op: BroadcastOp): BroadcastOp {
    return {
      to: (room) => this.wrap(op.to(room)),
      in: (room) => this.wrap(op.in(room)),
      except: (room) => this.wrap(op.except(room)),
      emit: (event, ...args) => {
        this.guard(`emit:${event}`, () => op.emit(event, ...args.map(toWire)));
        return true;
      },
      socketsJoin: (rooms) => this.guard("socketsJoin", () => op.socketsJoin(rooms)),
      socketsLeave: (rooms) => this.guard("socketsLeave", () => op.socketsLeave(rooms)),
      disconnectSockets: (close) => this.guard("disconnectSockets", () => op.disconnectSockets(close)),
    };
  }

  /** Lỗi ĐỒNG BỘ (payload không tuần tự hoá được, tên sự kiện bị cấm…) là lỗi lập trình — log `error`, KHÔNG ném lên job đang chạy. */
  private guard(what: string, fn: () => unknown): void {
    try {
      fn();
    } catch (err) {
      this.counters.failed += 1;
      logger.error("[socket.bridge] Không phát được sự kiện (bỏ qua, không ném lên job)", { what, error: errorMessage(err) });
    }
  }

  /** "Bắn rồi quên" một lệnh PUBLISH có trần thời gian — không bao giờ ném, không bao giờ để promise mồ côi. */
  private publish(channel: string, message: string | Buffer): void {
    if (this.closed) {
      this.drop("closed", "Cầu nối đã đóng — bỏ sự kiện");
      return;
    }
    if (!this.publisher.isReady()) {
      this.drop("not-ready", "Redis chưa sẵn sàng — bỏ sự kiện realtime (không xếp hàng chờ)");
      return;
    }
    if (this.inflight.size >= this.maxInflight) {
      this.drop("overflow", "Quá nhiều lệnh PUBLISH đang bay — bỏ sự kiện", { maxInflight: this.maxInflight });
      return;
    }

    let pending: Promise<number>;
    try {
      pending = this.publisher.publish(channel, message);
    } catch (err) {
      this.counters.failed += 1;
      this.warn("publish-error", "PUBLISH lỗi (đồng bộ)", { error: errorMessage(err) });
      return;
    }

    let done = false;
    const tracked: Promise<void> = new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        this.counters.timedOut += 1;
        this.warn("timeout", `PUBLISH quá ${this.timeoutMs}ms — bỏ chờ`, { timeoutMs: this.timeoutMs });
        resolve();
      }, this.timeoutMs);
      timer.unref();
      // `try/finally`: dù việc đếm/log có lỗi bất ngờ thì `tracked` vẫn resolve (không kẹt graceful shutdown) và không thành unhandled rejection.
      pending.then(
        (receivers) => {
          clearTimeout(timer);
          try {
            if (!done) {
              done = true;
              this.counters.published += 1;
              if (receivers === 0) {
                this.counters.noSubscribers += 1;
                this.warn("no-subscribers", "Không instance API nào lắng kênh socket.io — sự kiện realtime không tới client (API có gắn Redis adapter chưa? SOCKET_ADAPTER?)");
              }
            }
          } finally {
            resolve();
          }
        },
        (err: unknown) => {
          clearTimeout(timer);
          try {
            if (!done) {
              done = true;
              this.counters.failed += 1;
              this.warn("publish-error", "PUBLISH bị từ chối", { error: errorMessage(err) });
            }
          } finally {
            resolve();
          }
        }
      );
    }).finally(() => {
      this.inflight.delete(tracked);
    });
    this.inflight.add(tracked);
  }

  private drop(kind: string, message: string, meta: Record<string, unknown> = {}): void {
    this.counters.dropped += 1;
    this.warn(kind, message, meta);
  }

  /** Cùng một loại cảnh báo tối đa một lần / `WARN_INTERVAL_MS` — Redis mất kết nối không được làm log ngập theo từng sự kiện. */
  private warn(kind: string, message: string, meta: Record<string, unknown> = {}): void {
    const now = Date.now();
    const last = this.warned.get(kind);
    if (last && now - last.at < WARN_INTERVAL_MS) {
      last.suppressed += 1;
      return;
    }
    this.warned.set(kind, { at: now, suppressed: 0 });
    logger.warn(`[socket.bridge] ${message}`, { ...meta, ...(last && last.suppressed > 0 ? { suppressed: last.suppressed } : {}) });
  }
}
