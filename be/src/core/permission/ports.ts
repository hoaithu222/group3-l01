/**
 * Ports mà `core/permission` cần từ hạ tầng (Socket.IO, BullMQ) nhưng KHÔNG
 * được import trực tiếp (luật 3 tầng: core không import infrastructure/module
 * có DI/side-effect — khác với redis/logger/prisma vốn là singleton nền tảng
 * đã dùng trực tiếp trong `core/permission/user-status.ts`).
 *
 * `infrastructure/permission-ports.ts` cài đặt 2 interface này bằng
 * `getIO()`/`enqueue()` thật rồi gọi `setPermissionPorts()` MỘT LẦN lúc
 * khởi động (`bindPermissionPorts()` trong `server.ts`/`worker.ts`).
 */

/** Điều khiển room Socket.IO — cài đặt thật dùng Redis Adapter nên fan-out đúng trên mọi instance. */
export interface RealtimePort {
  /** Buộc mọi socket đang mở của các user này rời khỏi danh sách room (không disconnect). */
  leaveRooms(userIds: string[], rooms: string[]): Promise<void>;
  /** Emit 1 sự kiện tới room riêng của từng user (`user:{id}`). */
  emitToUsers(userIds: string[], event: string, payload: unknown): Promise<void>;
}

/** Đẩy job ngay (không cần bền qua Outbox+DB) — dùng cho việc "nên làm nhưng lỡ mất cũng không sao trong ≤ TTL cache". */
export interface OutboxPort {
  enqueueNow(jobName: string, data: Record<string, unknown>): Promise<void>;
}

export interface PermissionPorts {
  realtime: RealtimePort;
  outbox: OutboxPort;
}

let ports: PermissionPorts | null = null;

/** Gọi đúng 1 lần lúc khởi động (`bindPermissionPorts()`), TRƯỚC khi bất kỳ resolver/route nào có thể gọi `revokeScope`/`bumpVersion` fail-path. */
export function setPermissionPorts(p: PermissionPorts): void {
  ports = p;
}

/** Ném lỗi lập trình rõ ràng nếu gọi trước khi bootstrap — dễ debug hơn `undefined.foo()`. */
export function getPermissionPorts(): PermissionPorts {
  if (!ports) {
    throw new Error(
      "[permission] Ports chưa được gắn — gọi bindPermissionPorts() lúc khởi động server/worker"
    );
  }
  return ports;
}

/** Chỉ dùng trong test để cô lập giữa các case. */
export function resetPermissionPorts(): void {
  ports = null;
}
