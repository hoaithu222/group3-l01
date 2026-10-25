import type { BurnoutSignalPort } from "../../../shared/ports/burnout-signal.port";

/**
 * Sự kiện thẻ (`task.events`) mà NGƯỜI THỰC HIỆN (`actorId`) tự làm — tính là "một hoạt động" của họ trong khe 15 phút hiện tại. Cố ý KHÔNG tính dời lịch hàng loạt/xoá/khôi phục/sửa bình luận (do hệ thống hoặc ít mang
 * ý nghĩa "làm việc"); và KHÔNG lưu loại sự kiện — chỉ đếm số. Tên khớp `TASK_EVENTS` của `modules/projects` (test đối chiếu).
 */
export const TASK_ACTIVITY_EVENTS: ReadonlySet<string> = new Set(["task.created", "task.assigned", "task.due-changed", "task.completed", "task.reopened", "task.comment-created"]);

/**
 * Sink của `task.events`: ghi MỘT sự kiện cho `actorId` nếu người đó ĐÃ BẬT theo dõi (collector tự kiểm — người khác không ghi gì). `jobId` chống đếm trùng khi job được giao lại. Không bao giờ ném lỗi
 * (collector đã nuốt lỗi) để không kéo các sink khác của `task.events` chạy lại.
 */
export async function recordTaskActivity(collector: BurnoutSignalPort, payload: { event: string; actorId: string | null }, jobId: string): Promise<void> {
  if (payload.actorId === null || !TASK_ACTIVITY_EVENTS.has(payload.event)) return;
  await collector.recordEvent(payload.actorId, undefined, jobId);
}
