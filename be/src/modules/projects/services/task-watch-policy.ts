import type { TaskWatchState } from "../../../core/constants/project";

/** Hàng theo dõi tối thiểu mà chính sách cần (thực thể `TaskWatcher` thoả cấu trúc này). */
export interface WatchRow {
  userId: string;
  state: TaskWatchState;
}

/** Thông báo bình luận/nhắc hạn đến: người mặc định (người làm/người tạo) ∪ người đang theo dõi, TRỪ người đã tắt (`EXPLICIT_OFF`). Thứ tự ổn định, không trùng. */
export function withWatchers(base: readonly string[], rows: readonly WatchRow[]): string[] {
  const off = new Set(rows.filter((r) => r.state === "EXPLICIT_OFF").map((r) => r.userId));
  const on = rows.filter((r) => r.state !== "EXPLICIT_OFF").map((r) => r.userId);
  return [...new Set([...base, ...on])].filter((id) => !off.has(id));
}

/** Người dùng có đang theo dõi không: có hàng ⇒ theo hàng (`EXPLICIT_OFF` = không); không có hàng ⇒ theo dõi ngầm định khi là người làm/người tạo. */
export function isWatching(userId: string, implicit: readonly string[], row: WatchRow | null | undefined): boolean {
  if (row) return row.state !== "EXPLICIT_OFF";
  return implicit.includes(userId);
}
