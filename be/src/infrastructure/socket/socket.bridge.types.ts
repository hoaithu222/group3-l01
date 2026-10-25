/**
 * @file socket.bridge.types.ts
 * @description Hằng số + kiểu của cầu nối worker → socket (`socket.bridge.ts`). File LÁ thuần khai báo (không import gì) — tách ra để
 * `socket.bridge.ts` (vòng đời) và `socket.bridge.client.ts` (cài đặt) cùng dùng mà không import vòng.
 */

/**
 * Khoá kênh Redis dùng CHUNG cho adapter (API, `socket.server.ts`) và emitter (worker) — lệch nhau là worker "nói" vào kênh không ai nghe.
 * Đúng mặc định của cả hai thư viện; đổi ở MỘT chỗ này (và triển khai mọi instance API cùng lúc) nếu muốn tách kênh theo môi trường.
 */
export const SOCKET_IO_REDIS_KEY = "socket.io";

/** Sự kiện `serverSideEmit` (worker → MỌI instance API) cho `emitToScope({ recheck })` — xử lý ở `socket.bridge.listener.ts`. */
export const BRIDGE_RECHECK_EVENT = "socket-bridge:emit-recheck";

/** Trần chờ một lệnh PUBLISH — cùng mốc `outboxSignal` (1 s). */
export const PUBLISH_TIMEOUT_MS = 1000;
/** Trần số lệnh PUBLISH đang bay (vòng lặp fan-out vài nghìn người vẫn lọt, Redis nghẽn kéo dài thì bỏ bớt thay vì phình bộ nhớ). */
export const MAX_INFLIGHT = 20_000;
/** Tắt gọn: chờ tối đa ngần này cho lệnh đang bay trước khi bỏ. */
export const CLOSE_TIMEOUT_MS = 2000;

/**
 * Cấu trúc tối thiểu mà `Server` của socket.io VÀ `Emitter` của redis-emitter cùng thoả — nơi gọi (`socket.emit.ts`) không cần biết đang ở
 * API hay worker. Thêm phương thức mới ở đây chỉ khi CẢ HAI phía đều có.
 */
export interface BroadcastOp {
  to(room: string | string[]): BroadcastOp;
  in(room: string | string[]): BroadcastOp;
  except(room: string | string[]): BroadcastOp;
  emit(event: string, ...args: unknown[]): unknown;
  socketsJoin(rooms: string | string[]): unknown;
  socketsLeave(rooms: string | string[]): unknown;
  disconnectSockets(close?: boolean): unknown;
}

/** Lệnh `emitToScope({ recheck })` từ worker: worker không liệt kê được socket nên uỷ quyền cho MỌI instance API (mỗi instance làm phần socket cục bộ). */
export interface BridgeRecheckCommand {
  room: string;
  event: string;
  /** Đã có envelope `v`/`serverNow`. */
  payload: object;
  scope: { type: string; id: string };
  recheck: string;
  excludeUserId?: string;
}

export interface BridgePublisher {
  /** Redis đã bắt tay xong? `false` ⇒ bỏ lượt phát (KHÔNG xếp hàng chờ). */
  isReady(): boolean;
  /** Trả số subscriber nhận được (đúng ngữ nghĩa lệnh `PUBLISH`). */
  publish(channel: string, message: string | Buffer): Promise<number>;
}

export interface SocketBridgeStats {
  /** Lệnh PUBLISH đã được Redis xác nhận. */
  published: number;
  /** Bỏ vì Redis chưa sẵn sàng / đã đóng / quá nhiều lệnh đang bay. */
  dropped: number;
  /** PUBLISH bị từ chối hoặc payload không tuần tự hoá được. */
  failed: number;
  /** PUBLISH quá `timeoutMs` (lệnh vẫn có thể tới Redis muộn). */
  timedOut: number;
  /** PUBLISH thành công nhưng KHÔNG có subscriber nào (không instance API nào lắng kênh này). */
  noSubscribers: number;
  inflight: number;
}

export interface SocketBridge {
  /** Cùng khuôn `io.to().except().emit()` / `in().socketsJoin|socketsLeave|disconnectSockets()` — nhưng ghi lên Redis. */
  readonly broadcaster: BroadcastOp;
  /** Lệnh cấp cụm tới MỌI instance API (`serverSideEmit`); mỗi instance xử lý đúng MỘT lần. Không ném lỗi. */
  serverSideEmit(event: string, payload: unknown): void;
  stats(): SocketBridgeStats;
  /** Ngừng nhận lệnh mới và chờ (có trần) các lệnh PUBLISH đang bay — gọi trong graceful shutdown của worker, SAU `closeWorkers()`. */
  close(): Promise<void>;
}

export interface SocketBridgeOptions {
  /** Mặc định: client `redis` dùng chung của tiến trình (`REDIS_URL`/`REDIS_PASSWORD` như mọi nơi khác). */
  publisher?: BridgePublisher;
  key?: string;
  timeoutMs?: number;
  maxInflight?: number;
  closeTimeoutMs?: number;
}
