import { registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { ROOM } from "../../../infrastructure/socket";
import { emitToRoom } from "../../../infrastructure/socket/socket.emit";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { RESOURCE_EVENTS_JOB, RESOURCE_EVENTS_QUEUE, type ResourceEventPayload } from "../events/resource.events";

/**
 * `resource.events` (queue `notifications`) — outbox `resource.*`/`folder.*` → socket `resource:changed` tới `ws:{id}`
 * (p3-01 be.md §6). Payload KHÔNG có tên tệp/thư mục; client chỉ cần biết danh sách nào đang mở phải làm mới. Đây cũng là
 * chỗ NỐI tiếp các consumer về sau (`p5-04` chỉ mục tìm kiếm, `p7-05` vân tay quét trùng) — cùng cặp queue/jobName chỉ có 1
 * processor nên chúng mở rộng handler này thay vì đăng ký processor thứ hai.
 *
 * Emit lặp vô hại (client chỉ refetch). Mục phát sinh từ xoá/khôi phục CẢ thư mục (`via: "FOLDER"`) không phát riêng —
 * sự kiện của thư mục đã đủ để làm mới; tránh bão hàng trăm emit cho một thao tác.
 */
registerJob(RESOURCE_EVENTS_QUEUE, RESOURCE_EVENTS_JOB, (job) => {
  const p = job.data as ResourceEventPayload;
  if (p.via === "FOLDER") return Promise.resolve();
  try {
    emitToRoom(ROOM.workspace(p.workspaceId), SocketEvent.RESOURCE_CHANGED, {
      workspaceId: p.workspaceId,
      folderId: p.folderId,
      kind: p.kind,
      // Tệp bị xoá vĩnh viễn đã rời danh sách từ lúc vào thùng rác — báo như một lần xoá để làm mới thùng rác.
      action: p.action === "PURGED" ? "DELETED" : p.action,
      subjectId: p.kind === "RESOURCE" ? p.resourceId : p.subjectId,
    });
  } catch (err) {
    logger.warn("[resource.events] Không phát được resource:changed", {
      workspaceId: p.workspaceId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return Promise.resolve();
});
