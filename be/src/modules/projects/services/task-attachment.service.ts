import { LIMITS } from "../../../core/constants/limits";
import { AppError, NotFoundError, ScopeForbiddenError, ScopeNotFoundError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { AttachDto } from "../dtos";
import type { Task, TaskActivity } from "../entities/task.interface";
import type { TxContext } from "../repositories/unit-of-work";
import { assertAttachable } from "./task-attachment.rules";
import { withTaskLock, type TaskDetailDeps } from "./task-detail.deps";
import { presentAttachments, type AttachmentDto } from "./task-feed.presenter";
import { TaskPublisher } from "./task-publisher";

const limitError = (): AppError => new AppError(ErrorMessages[ErrorCode.TASK_012], 409, ErrorCode.TASK_012);

/**
 * Đính kèm thẻ qua `AssetLink { TASK }` (scope WORKSPACE → quyền đọc theo `workspace.board.read`, PM2-24) + đếm
 * `Task.attachmentCount` (tối đa `LIMITS.task.attachmentsMax`). Gắn/gỡ + đếm + activity nằm trong MỘT transaction.
 */
export class TaskAttachmentService {
  private readonly publisher: TaskPublisher;

  constructor(private readonly d: TaskDetailDeps) {
    this.publisher = new TaskPublisher(d.emitter, d.directory, d.clock);
  }

  async list(user: AuthUser, taskId: string): Promise<AttachmentDto[]> {
    await this.d.access.task(user, taskId, "workspace.board.read");
    return presentAttachments(await this.d.attachments.listForTask(taskId), this.d.assets);
  }

  async attach(user: AuthUser, taskId: string, dto: AttachDto): Promise<{ attachment: AttachmentDto; attachmentCount: number }> {
    const { task, board } = await this.d.access.task(user, taskId, "workspace.task.update");
    if (task.attachmentCount >= LIMITS.task.attachmentsMax) throw limitError();
    const [asset] = await assertAttachable(this.d.assets, user.id, [dto.assetId], "TASK", board.workspaceId);

    const { after, activity } = await withTaskLock(this.d, taskId, () => this.d.uow.run(async (tx) => {
      // Đếm nguyên tử `< max` — hai lần gắn đồng thời không vượt trần.
      const after = await this.d.tasks.bumpAttachmentCount(taskId, 1, LIMITS.task.attachmentsMax, tx);
      if (!after) {
        const current = await this.d.tasks.findById(taskId, tx);
        if (!current || current.deletedAt) throw new ScopeNotFoundError();
        throw limitError();
      }
      await this.d.assets.attach(tx, { assetIds: [dto.assetId], targetType: "TASK", targetId: taskId, workspaceId: task.workspaceId, actorId: user.id });
      const activity = await this.record(tx, after, user.id, "ATTACHMENT_ADDED", null, { assetId: dto.assetId, name: asset.originalName });
      return { after, activity };
    }));

    await this.announce(after, user.id, activity);
    const row = (await this.d.attachments.listForTask(taskId)).find((r) => r.assetId === dto.assetId);
    if (!row) throw new NotFoundError("Không tìm thấy tệp đính kèm");
    const [attachment] = await presentAttachments([row], this.d.assets);
    return { attachment, attachmentCount: after.attachmentCount };
  }

  /** Người gắn hoặc OWNER/ADMIN (`workspace.task.delete`) mới gỡ được. */
  async detach(user: AuthUser, taskId: string, assetId: string): Promise<void> {
    const { task, access } = await this.d.access.task(user, taskId, "workspace.task.update");
    const link = await this.d.attachments.findTaskLink(taskId, assetId);
    if (!link) throw new ScopeNotFoundError();
    if (link.createdBy !== user.id && !access.actions.has("workspace.task.delete")) {
      throw new ScopeForbiddenError(ErrorMessages[ErrorCode.PERM_001], ErrorCode.PERM_001);
    }
    const name = (await this.d.attachments.listForTask(taskId)).find((r) => r.assetId === assetId)?.originalName ?? "";

    const { after, activity } = await withTaskLock(this.d, taskId, () => this.d.uow.run(async (tx) => {
      await this.d.assets.detach(tx, { targetType: "TASK", targetId: taskId, assetIds: [assetId] });
      const after = (await this.d.tasks.bumpAttachmentCount(taskId, -1, LIMITS.task.attachmentsMax, tx)) ?? task;
      const activity = await this.record(tx, after, user.id, "ATTACHMENT_REMOVED", { assetId, name }, null);
      return { after, activity };
    }));
    await this.announce(after, user.id, activity);
  }

  private record(
    tx: TxContext,
    task: Task,
    actorId: string,
    type: "ATTACHMENT_ADDED" | "ATTACHMENT_REMOVED",
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null
  ): Promise<TaskActivity> {
    return this.d.activity.record(tx, { taskId: task.id, boardId: task.boardId, workspaceId: task.workspaceId, actorId, type, before, after });
  }

  private async announce(task: Task, actorId: string, activity: TaskActivity): Promise<void> {
    await Promise.all([
      this.publisher.updated(task, actorId, ["attachments", "attachmentCount"]),
      this.publisher.activities(task.boardId, [activity]),
    ]);
  }
}
