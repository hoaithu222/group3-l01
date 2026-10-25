/**
 * @file permission-ports.ts
 * @description Cài đặt `RealtimePort`/`OutboxPort` (`core/permission/ports.ts`)
 * bằng hạ tầng thật (Socket.IO + BullMQ) — giữ luật 3 tầng: `core/permission`
 * chỉ biết interface, KHÔNG import file này hay ngược lại theo hướng sai.
 *
 * `bindPermissionPorts()` PHẢI được gọi đúng 1 lần lúc khởi động
 * (`server.ts`/`worker.ts`), sớm nhất có thể sau khi Redis kết nối — trước
 * khi bất kỳ resolver/route nào có cơ hội gọi `bumpVersion`/`revokeScope`.
 */
import { registerJob, enqueue } from "./queue";
import { leaveRooms, emitToUsers } from "./socket/socket.emit";
import { logger } from "./logger";
import {
  setPermissionPorts,
  incrVersion,
  type RealtimePort,
  type OutboxPort,
  type ScopeType,
} from "../core/permission";

/**
 * p0-03 §5.6 — đi qua `socket.emit.ts` thay vì `getIO()` trực tiếp, để mọi
 * payload server→client (kể cả `permission:revoked`) đều có `v`/`serverNow`
 * nhất quán. Hành vi fan-out qua Redis Adapter GIỮ NGUYÊN (`socket.emit.ts`
 * cũng chỉ gọi `getIO()` bên trong).
 */
const realtime: RealtimePort = {
  async leaveRooms(userIds, rooms) {
    leaveRooms(userIds, rooms);
  },

  async emitToUsers(userIds, event, payload) {
    emitToUsers(userIds, event, payload as object);
  },
};

/** be.md p0-02 §7 — jobId/queue/attempts cho 2 job mà `core/permission` cần xếp. */
const outbox: OutboxPort = {
  async enqueueNow(jobName, data) {
    switch (jobName) {
      case "permission.bump": {
        const { scopeType, scopeId, eventId } = data as {
          scopeType: string;
          scopeId: string;
          eventId: string;
        };
        // `jobId` custom PHẢI có đúng 0 hoặc 2 dấu `:` (BullMQ `Job.create()`
        // ném "Custom Id cannot contain :" khi có `:` mà `split(':').length !==
        // 3` — phát hiện lúc viết test tích hợp p1-02 gọi `revokeScope()` thật,
        // trước đó `revoke-scope.test.ts` chỉ dùng port giả nên chưa lộ ra).
        // Nối `scopeType`/`scopeId` bằng `-` để giữ đúng 3 phần (2 dấu `:`).
        await enqueue("notifications", "permission.bump", data, {
          jobId: `permission.bump:${scopeType}-${scopeId}:${eventId}`,
          attempts: 5,
        });
        return;
      }
      case "push.cancel-scope": {
        const { scopeType, scopeId, version } = data as {
          scopeType: string;
          scopeId: string;
          version: number;
        };
        // Xem ghi chú ở nhánh "permission.bump" phía trên — cùng ràng buộc jobId.
        await enqueue("push", "push.cancel-scope", data, {
          jobId: `push.cancel-scope:${scopeType}-${scopeId}:${version}`,
          attempts: 3,
        });
        return;
      }
      default:
        logger.warn("[permission-ports] enqueueNow: jobName không nhận diện được", { jobName });
    }
  },
};

export function bindPermissionPorts(): void {
  setPermissionPorts({ realtime, outbox });
}

/**
 * Processor retry cho `permission.bump` (be.md §5.3, §7) — `bumpVersion()`
 * xếp job này khi INCR thất bại lúc Redis down. Đăng ký ở ĐÂY (side-effect
 * module-scope, KHÔNG qua `register-jobs.ts`) vì gắn chặt với cách
 * `permission-ports.ts` đã cài `enqueueNow` cho đúng job này — tách file
 * riêng chỉ để rồi phải đồng bộ 2 nơi cùng biết jobId/queue sẽ dễ lệch hơn.
 * An toàn ở tiến trình `api`-only: `registerJob` chỉ thêm vào Map, không tự
 * khởi Worker — `startWorkers()` (chỉ chạy khi `PROCESS_ROLE !== "api"`) mới
 * thật sự tiêu thụ job.
 */
registerJob("notifications", "permission.bump", async (job) => {
  const { scopeType, scopeId } = job.data as { scopeType: ScopeType; scopeId: string };
  const next = await incrVersion({ type: scopeType, id: scopeId });
  if (next === null) {
    throw new Error("[permission.bump] Redis vẫn chưa khả dụng, sẽ thử lại");
  }
  logger.info("[permission.bump] Đã tăng permver thành công (retry)", { scopeType, scopeId, next });
});
