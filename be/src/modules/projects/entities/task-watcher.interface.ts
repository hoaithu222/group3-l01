import type { TaskWatchState } from "../../../core/constants/project";

/** Lựa chọn theo dõi thẻ của MỘT người (p3-03 P1). Không có hàng ⇒ theo dõi ngầm định nếu là người làm/người tạo. */
export interface TaskWatcher {
  taskId: string;
  userId: string;
  state: TaskWatchState;
  updatedAt: Date;
}

/** Trạng thái người dùng chủ động chọn (ghi đè mọi trạng thái cũ, kể cả `AUTO_ON`). */
export type ExplicitWatchState = Extract<TaskWatchState, "EXPLICIT_ON" | "EXPLICIT_OFF">;
