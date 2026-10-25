/**
 * Barrel của module `projects` (Kanban p3-02; p3-03 chi tiết thẻ; p4-04/05/06 mở rộng cùng module).
 *
 * `registerProjectsModule()` — side-effect boot, gọi 1 lần từ `router.ts` NGAY SAU khi `workspaces` đã đăng ký
 * resolver WORKSPACE (cùng nguyên tắc `registerChannelModule()`): resolver scope `BOARD` (+ `children()` cho
 * `revokeScope` cascade) và guard room `board:`. Job/worker tự nối ở `register-jobs.ts`.
 */
import { registerReviewRevokeListener } from "./jobs/review-revoke-listener";
import { registerBoardRoomGuard } from "./realtime/board-room.guard";
import { PrismaBoardRepository } from "./repositories/board.repository.prisma";
import { getProjectsContainer } from "./projects.container";
import { registerBoardScopeResolver } from "./services/board-access.resolver";
import { registerReviewNotificationTypes } from "./services/review/review-notification.types";
import { registerTaskNotificationTypes } from "./services/task-notification.types";
import { registerTaskMoveEffect, registerTaskMovePolicy } from "./services/task-move-policy";
import { TaskCreationPortImpl } from "./services/task-creation.port.impl";
import type { ITaskCreationPort } from "../../shared/ports/task-creation.port";

export { registerTaskMovePolicy, registerTaskMoveEffect } from "./services/task-move-policy";
export type {
  TaskMovePolicy,
  TaskMoveEffect,
  TaskMovePolicyContext,
  TaskMoveEffectContext,
  TaskCompletionMeta,
} from "./services/task-move-policy";
export { prismaTx } from "./repositories/prisma-tx";
export type { TxContext } from "./repositories/unit-of-work";
export { registerTaskEventSink } from "./events/task-event-sinks";
export { TASK_EVENTS } from "./events/project-events";
export type { TaskEventPayload, TaskCompletedPayload } from "./events/project-events";

/**
 * p7-04 `ITaskCreationPort` (`shared/ports/task-creation.port.ts`) — `chat-extensions` tạo thẻ từ tin nhắn qua CHÍNH `TaskService.create` (quyền `workspace.task.create`, hạn mức,
 * vị trí, activity, outbox), KHÔNG import `projects/services/*` trực tiếp.
 */
export function createTaskCreationPort(): ITaskCreationPort {
  const { access, taskService } = getProjectsContainer();
  return new TaskCreationPortImpl(access, taskService);
}

export function registerProjectsModule(): void {
  registerBoardScopeResolver(new PrismaBoardRepository());
  registerBoardRoomGuard();
  // p3-03 — tiến trình API cần biết 4 loại `task.*` để đọc hộp thư (worker đăng ký ở file job).
  registerTaskNotificationTypes();
  // p4-05 — chấm chéo: chính sách chặn DONE + hiệu ứng vào/rời REVIEW đi qua registry (KHÔNG sửa `task-move.service.ts`); loại thông báo REVIEW_*;
  // nối `revokeScope` (người chấm rời nhóm ⇒ giao lại). Job/sink của worker nạp ở `register-jobs.ts`.
  const { review } = getProjectsContainer();
  registerTaskMovePolicy(review.policy);
  registerTaskMoveEffect(review.effect);
  registerReviewNotificationTypes();
  registerReviewRevokeListener();
}
