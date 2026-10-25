import type { ChecklistItem, Task } from "../entities/task.interface";

/**
 * Kết quả ghi lên MỘT mục checklist. Mỗi thao tác là MỘT lệnh nguyên tử trên MỘT tài liệu `Task` (Mongo
 * `update` + `arrayFilters`) — KHÔNG mở transaction và KHÔNG đi qua `BoardWriteRunner`, để hai người tick hai mục
 * khác nhau cùng lúc không đụng độ ghi (PM2-21).
 */
export type ChecklistWrite =
  | { status: "changed"; task: Task; /** Chỉ `remove`: mục như trước khi xoá (mục đã biến khỏi `task.checklist`). */ removed?: ChecklistItem }
  /** Mục còn nhưng đã ở đúng trạng thái yêu cầu (tick lặp) — không đổi gì, không tăng `version`/bộ đếm. */
  | { status: "unchanged"; task: Task }
  | { status: "no-item"; task: Task }
  /** Thẻ không còn hoặc đã xoá mềm. */
  | { status: "gone" };

export type ChecklistAddResult =
  | { status: "added"; task: Task }
  | { status: "limit"; task: Task }
  | { status: "gone" };

export interface ITaskChecklistRepository {
  /** `$push` + `checklistTotal +1` + `version +1`, chỉ khi `checklistTotal < max` (nguyên tử ⇒ không vượt trần). */
  add(taskId: string, item: ChecklistItem, max: number): Promise<ChecklistAddResult>;
  /**
   * Đặt `done` cho một mục. Điều kiện khớp CẢ thẻ lẫn trạng thái cũ của mục (`$elemMatch { id, done: !done }`) nên tick
   * lặp không `$inc` hai lần (PM2-22) — điều kiện nằm ở filter chứ không chỉ ở `arrayFilters`, vì `$inc` trong cùng
   * lệnh vẫn chạy khi `arrayFilters` không khớp phần tử nào.
   */
  setDone(taskId: string, itemId: string, done: boolean, by: string, at: Date): Promise<ChecklistWrite>;
  /** Đổi `text` và/hoặc `order` của một mục, `version +1`. */
  edit(taskId: string, itemId: string, set: { text?: string; order?: number }): Promise<ChecklistWrite>;
  /** `$pull` mục + cập nhật `checklistTotal`/`checklistDone` (theo trạng thái `done` của mục lúc xoá) + `version +1`. */
  remove(taskId: string, itemId: string): Promise<ChecklistWrite>;
  /** Đánh lại `order` = 1024, 2048, … khi khoảng cách giữa hai mục cạn độ chính xác. `null` khi thẻ không còn. */
  renumber(taskId: string): Promise<Task | null>;
}
