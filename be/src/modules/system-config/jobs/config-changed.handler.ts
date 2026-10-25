import type { Job } from "bullmq";
import { registerJob } from "../../../infrastructure/queue";
import { emitToAll } from "../../../infrastructure/socket/socket.emit";
import { configVersion } from "../../../core/config/runtime-config";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";

/**
 * `config.broadcast` (queue `notifications`, p0-07 §7) — outbox relay đẩy job
 * này (delay = `CONFIG_BROADCAST_DEBOUNCE_MS`) sau khi 1+ `PUT/POST reset`
 * `SystemConfig` commit trong cùng cửa sổ debounce (jobId theo cửa sổ nên
 * nhiều thay đổi liên tiếp chỉ tạo 1 job, be.md §7). Payload KHÔNG mang giá
 * trị cấu hình — client luôn `GET /capabilities` lại (tránh lộ cấu hình
 * admin-only qua socket, be.md §6).
 */
registerJob("notifications", "config.broadcast", async (job: Job) => {
  const { keys } = job.data as { keys?: string[] };
  const version = await configVersion();
  emitToAll(SocketEvent.CONFIG_UPDATED, { keys: keys ?? [], configVersion: version });
});
