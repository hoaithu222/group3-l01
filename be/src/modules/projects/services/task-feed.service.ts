import { LIMITS } from "../../../core/constants/limits";
import { ValidationError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import type { TaskDetailDeps } from "./task-detail.deps";
import type { CommentCursorPage } from "./task-comment.service";
import { presentActivities, type TaskActivityDto } from "./task-feed.presenter";
import type { UserSummary } from "../repositories/project-directory.interface";


/** Nhật ký hoạt động của thẻ (cursor mới → cũ) + danh sách người có thể giao việc/nhắc tên của bảng. */
export class TaskFeedService {
  constructor(private readonly d: TaskDetailDeps) {}

  async activity(user: AuthUser, taskId: string, query: { cursor?: string; limit: number }): Promise<CommentCursorPage<TaskActivityDto>> {
    await this.d.access.task(user, taskId, "workspace.board.read");
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (query.cursor && !cursor) throw new ValidationError("Cursor không hợp lệ");

    const page = await this.d.activityRepo.list(taskId, cursor, query.limit);
    const last = page.items[page.items.length - 1];
    return {
      data: await presentActivities(page.items, this.d.directory),
      meta: { nextCursor: page.hasMore && last ? encodeCursor(last.at, last.id) : null, hasMore: page.hasMore, limit: query.limit },
    };
  }

  /** Thành viên ACTIVE MEMBER+ (không GUEST) của nhóm chứa bảng; GUEST gọi → 404 (`workspace.board.read`). */
  async mentionables(user: AuthUser, boardId: string, q: string): Promise<UserSummary[]> {
    const { board } = await this.d.access.board(user, boardId, "workspace.board.read");
    return this.d.directory.searchMentionables(board.workspaceId, q, LIMITS.mention.mentionablesLimit);
  }
}
