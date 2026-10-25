import { defineCron, registerJob } from "../../../infrastructure/queue";
import { registryCountAll } from "../../../infrastructure/socket";
import { emitToRoom } from "../../../infrastructure/socket/socket.emit";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { hasOpsWatchers } from "../../../infrastructure/socket/socket.ops-watch";
import { ROOM } from "../../../infrastructure/socket/socket.rooms";

export const OPS_STATS_JOB = "ops.stats-broadcast";

/**
 * Một lượt phát số liệu vận hành (p0-03 admin.md): CHỈ khi có admin đang ở room `admin:ops` (khoá Redis do `socket.ops-watch.ts` giữ — worker không có `getIO()`
 * nên không `fetchSockets` được) mới quét connection registry (`SCAN conn:*`) rồi phát `ops:stats { socketConnections, onlineUsers }` tới room. Không có ai xem → không tốn
 * lượt quét nào. Payload cùng dạng `realtime` của `GET /admin/overview` để admin `setQueryData` trực tiếp. `emitToRoom` chạy được ở worker (cầu nối Redis) và không ném khi Redis lỗi.
 */
export async function broadcastOpsStats(): Promise<{ sent: boolean }> {
  if (!(await hasOpsWatchers())) return { sent: false };
  const { socketConnections, onlineUsers } = await registryCountAll();
  emitToRoom(ROOM.admin("ops"), SocketEvent.OPS_STATS, { socketConnections, onlineUsers });
  return { sent: true };
}

registerJob("cron", OPS_STATS_JOB, async () => {
  await broadcastOpsStats();
});

/**
 * Cron TĨNH mỗi 30 giây (pattern 6 trường, cùng cách `media.rooms-snapshot`) — KHÔNG tạo scheduler theo-thực-thể (`syncCronSchedulers` xoá mọi scheduler ngoài registry tĩnh).
 * `removeOnComplete` vì mỗi 30 giây một job sẽ làm ngập lịch sử queue `cron`.
 */
defineCron({
  schedulerId: OPS_STATS_JOB,
  queue: "cron",
  jobName: OPS_STATS_JOB,
  pattern: "*/30 * * * * *",
  opts: { attempts: 1, removeOnComplete: true, removeOnFail: 100 },
});
