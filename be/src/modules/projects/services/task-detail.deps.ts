import type { ITaskActivityRepository } from "../repositories/task-activity.repository.interface";
import type { ITaskAttachmentRepository } from "../repositories/task-attachment.repository.interface";
import type { ITaskChecklistRepository } from "../repositories/task-checklist.repository.interface";
import type { ITaskCommentRepository } from "../repositories/task-comment.repository.interface";
import type { ITaskDependencyRepository } from "../repositories/task-dependency.repository.interface";
import type { IProjectsUnitOfWork } from "../repositories/unit-of-work";
import type { KeyedMutex } from "./keyed-mutex";
import type { IReschedulePolicy } from "./reschedule-policy";
import type { ITaskAssetPort } from "./task-asset.port";
import type { TaskServiceDeps } from "./task-service.deps";
import type { ReviewQueryService } from "./review/review-query.service";

/** Cổng ghi audit (cấu trúc tối giản — `AuditService.record()` khớp, giống `AuditRecorder` của admin-jobs). */
export interface IAuditPort {
  record(input: {
    actorId: string;
    actorRole?: string;
    action: string;
    targetType: string;
    targetId: string;
    workspaceId?: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

/** Phụ thuộc chung của các service p3-03 (chi tiết thẻ, checklist, đính kèm, bình luận). */
export interface TaskDetailDeps extends TaskServiceDeps {
  /** Transaction thường (PATCH/đính kèm/bình luận) — KHÔNG `touch(board)`: các thao tác này không đổi thứ tự/số thẻ. */
  uow: IProjectsUnitOfWork;
  checklist: ITaskChecklistRepository;
  activityRepo: ITaskActivityRepository;
  comments: ITaskCommentRepository;
  attachments: ITaskAttachmentRepository;
  assets: ITaskAssetPort;
  audit: IAuditPort;
  /** Đồng hồ (test cửa sổ sửa bình luận 15 phút / hạn khôi phục 30 ngày). */
  clock?: () => Date;
  /** (p4-04) Đọc phụ thuộc cho `TaskDetailDto.dependencies`; vắng → hai danh sách rỗng. */
  dependencies?: ITaskDependencyRepository;
  /** (p4-04) Chặn PATCH lùi hạn khi có thẻ sau bị ảnh hưởng (`TASK_006`); vắng → PATCH chạy như p3-03. */
  reschedulePolicy?: IReschedulePolicy;
  /** (p4-05) Dựng `TaskDetailDto.reviews` (lọc điểm/nhận xét theo người xem); vắng → không có trường `reviews`. */
  reviews?: Pick<ReviewQueryService, "build">;
  /** Hàng đợi trong tiến trình theo thẻ cho các transaction đụng bộ đếm (`attachmentCount`/`commentCount`) — giảm write-conflict. */
  taskMutex?: KeyedMutex;
}

/** Chạy `fn` tuần tự theo `taskId` khi có `taskMutex`. Chỉ giảm tranh chấp trong MỘT tiến trình; đúng đắn vẫn do CAS/điều kiện Mongo. */
export function withTaskLock<T>(d: Pick<TaskDetailDeps, "taskMutex">, taskId: string, fn: () => Promise<T>): Promise<T> {
  return d.taskMutex ? d.taskMutex.run(`task:${taskId}`, fn) : fn();
}
