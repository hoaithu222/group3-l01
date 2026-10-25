import { LIMITS } from "../../../core/constants/limits";
import { AppError, ScopeForbiddenError, ScopeNotFoundError, ValidationError, VersionConflictError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { graphemeLength } from "../../../core/utils/normalize";
import { newObjectId } from "../../../core/utils/object-id";
import type { CreateCommentDto, DeleteCommentDto, PatchCommentDto } from "../dtos";
import type { TaskComment } from "../entities/task-comment.interface";
import { commentCreatedEvent, commentUpdatedEvent } from "../events/task-event.factory";
import { toOutboxEvent } from "../events/project-events";
import { DuplicateCommentError } from "../repositories/task-comment.repository.interface";
import { assertAttachable } from "./task-attachment.rules";
import { withTaskLock, type TaskDetailDeps } from "./task-detail.deps";
import { presentComments, type TaskCommentDto } from "./task-feed.presenter";
import { validateTaskMentions } from "./task-mention.validator";
import { TaskPublisher } from "./task-publisher";

export interface CommentCursorPage<T> {
  data: T[];
  meta: { nextCursor: string | null; hasMore: boolean; limit: number };
}

const forbidden = (): ScopeForbiddenError => new ScopeForbiddenError(ErrorMessages[ErrorCode.PERM_001], ErrorCode.PERM_001);

/**
 * Bình luận thẻ (p3-03 be.md §5): `TaskComment` riêng (không dùng `Message`), idempotent theo `(authorId, clientCommentId)`,
 * nhắc tên bằng token p1-06, sửa trong 15 phút, xoá mềm (của người khác: lý do + audit + activity). Bình luận KHÔNG ghi
 * activity (đã có bản ghi comment) — TRỪ xoá của người khác (`COMMENT_DELETED_BY_ADMIN`).
 */
export class TaskCommentService {
  private readonly publisher: TaskPublisher;

  constructor(private readonly d: TaskDetailDeps) {
    this.publisher = new TaskPublisher(d.emitter, d.directory, d.clock);
  }

  async list(user: AuthUser, taskId: string, query: { cursor?: string; limit: number }): Promise<CommentCursorPage<TaskCommentDto>> {
    await this.d.access.task(user, taskId, "workspace.board.read");
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (query.cursor && !cursor) throw new ValidationError("Cursor không hợp lệ");

    const page = await this.d.comments.list(taskId, cursor, query.limit);
    const last = page.items[page.items.length - 1];
    return {
      data: await this.present(page.items),
      meta: { nextCursor: page.hasMore && last ? encodeCursor(last.createdAt, last.id) : null, hasMore: page.hasMore, limit: query.limit },
    };
  }

  /** `created: false` khi gửi lại cùng `clientCommentId` (trả bản cũ, HTTP 200). */
  async create(user: AuthUser, taskId: string, dto: CreateCommentDto): Promise<{ comment: TaskCommentDto; created: boolean }> {
    const { task, board } = await this.d.access.task(user, taskId, "workspace.task.comment");

    const replay = await this.replayOf(user.id, dto.clientCommentId, taskId);
    if (replay) return { comment: replay, created: false };

    const { mentions } = await validateTaskMentions({ content: dto.content, mentions: dto.mentions, workspaceId: board.workspaceId, directory: this.d.directory });
    await assertAttachable(this.d.assets, user.id, dto.attachmentAssetIds, "TASK_COMMENT", board.workspaceId);
    const mentionIds = mentions.map((m) => m.targetId).filter((id) => id !== user.id);
    const id = newObjectId();

    let created: { comment: TaskComment; task: typeof task };
    try {
      created = await withTaskLock(this.d, taskId, () => this.d.uow.run(async (tx) => {
        const comment = await this.d.comments.create(
          {
            id,
            taskId,
            boardId: task.boardId,
            workspaceId: task.workspaceId,
            authorId: user.id,
            clientCommentId: dto.clientCommentId,
            content: dto.content.trim(),
            mentions,
            attachmentCount: dto.attachmentAssetIds.length,
          },
          tx
        );
        if (dto.attachmentAssetIds.length > 0) {
          await this.d.assets.attach(tx, { assetIds: dto.attachmentAssetIds, targetType: "TASK_COMMENT", targetId: id, workspaceId: task.workspaceId, actorId: user.id });
        }
        const after = await this.d.tasks.bumpCommentCount(taskId, 1, tx);
        if (!after) throw new ScopeNotFoundError(); // thẻ vừa bị xoá giữa lúc kiểm quyền và lúc ghi → huỷ cả giao dịch
        const evt = commentCreatedEvent(after, comment, mentionIds);
        await this.d.outbox.add(tx, toOutboxEvent(evt.payload, evt.dedupeKey));
        return { comment, task: after };
      }));
    } catch (err) {
      // Đua hai lần gửi cùng `clientCommentId`: unique chặn bản thứ hai; transaction đã huỷ nên đọc lại NGOÀI transaction.
      if (err instanceof DuplicateCommentError) {
        const again = await this.replayOf(user.id, dto.clientCommentId, taskId);
        if (again) return { comment: again, created: false };
      }
      throw err;
    }

    const [dtoOut] = await this.present([created.comment]);
    this.publisher.comment(task.boardId, taskId, dtoOut);
    await this.publisher.updated(created.task, user.id, ["commentCount"]);
    return { comment: dtoOut, created: true };
  }

  async update(user: AuthUser, commentId: string, dto: PatchCommentDto): Promise<TaskCommentDto> {
    const comment = await this.mustFind(commentId);
    const { task, board } = await this.d.access.task(user, comment.taskId, "workspace.task.comment");
    if (comment.authorId !== user.id) throw forbidden();

    const now = this.now();
    if (now.getTime() - comment.createdAt.getTime() > LIMITS.task.commentEditWindowSeconds * 1000) {
      throw new AppError(ErrorMessages[ErrorCode.TASK_015], 409, ErrorCode.TASK_015);
    }
    if (comment.version !== dto.expectedVersion) throw new VersionConflictError(comment.version);
    const content = dto.content.trim();
    if (graphemeLength(content) === 0 && comment.attachmentCount === 0) {
      throw new ValidationError("Bình luận trống", { content: ["Bình luận trống"] });
    }

    const { mentions } = await validateTaskMentions({ content, mentions: dto.mentions, workspaceId: board.workspaceId, directory: this.d.directory });
    const before = new Set(comment.mentions.map((m) => m.targetId));
    // Chỉ người MỚI được nhắc trong lần sửa mới nhận thông báo (người đã được nhắc trước đó không báo lại).
    const newMentionIds = mentions.map((m) => m.targetId).filter((id) => id !== user.id && !before.has(id));

    const updated = await this.d.uow.run(async (tx) => {
      const next = await this.d.comments.editCas(commentId, dto.expectedVersion, { content, mentions, editedAt: now }, tx);
      if (!next) {
        const current = await this.d.comments.findById(commentId, tx);
        if (!current || current.deletedAt) throw new ScopeNotFoundError();
        throw new VersionConflictError(current.version);
      }
      if (newMentionIds.length > 0) {
        const evt = commentUpdatedEvent(task, next, newMentionIds);
        await this.d.outbox.add(tx, toOutboxEvent(evt.payload, evt.dedupeKey));
      }
      return next;
    });

    const [out] = await this.present([updated]);
    this.publisher.comment(task.boardId, task.id, out);
    return out;
  }

  /** `204` (không trả nội dung). Của người khác: cần `workspace.task.delete` (OWNER/ADMIN) + `reason` + audit + activity. */
  async remove(user: AuthUser, commentId: string, dto: DeleteCommentDto): Promise<void> {
    const comment = await this.mustFind(commentId);
    const { task, access } = await this.d.access.task(user, comment.taskId, "workspace.task.comment");
    const own = comment.authorId === user.id;
    if (!own) {
      if (!access.actions.has("workspace.task.delete")) throw forbidden();
      if (!dto.reason) throw new ValidationError("Cần nêu lý do khi xoá bình luận của người khác", { reason: ["Lý do bắt buộc (10–500 ký tự)"] });
    }

    const now = this.now();
    const outcome = await withTaskLock(this.d, task.id, () => this.d.uow.run(async (tx) => {
      const gone = await this.d.comments.tombstone(commentId, { deletedAt: now, deletedBy: user.id, deleteReason: dto.reason ?? null }, tx);
      if (!gone) return null; // đã xoá trước đó (idempotent)
      await this.d.assets.detach(tx, { targetType: "TASK_COMMENT", targetId: commentId });
      const after = (await this.d.tasks.bumpCommentCount(task.id, -1, tx)) ?? task;
      const activity = own
        ? null
        : await this.d.activity.record(tx, {
            taskId: task.id,
            boardId: task.boardId,
            workspaceId: task.workspaceId,
            actorId: user.id,
            type: "COMMENT_DELETED_BY_ADMIN",
            before: null,
            after: { commentId, authorId: comment.authorId },
          });
      return { after, activity };
    }));
    if (!outcome) return;

    if (!own) {
      await this.d.audit.record({
        actorId: user.id,
        actorRole: user.role,
        action: "task-comment.remove",
        targetType: "TaskComment",
        targetId: commentId,
        workspaceId: task.workspaceId,
        reason: dto.reason,
        metadata: { taskId: task.id, authorId: comment.authorId },
      });
    }
    await Promise.all([
      this.publisher.updated(outcome.after, user.id, ["commentCount"]),
      outcome.activity ? this.publisher.activities(task.boardId, [outcome.activity]) : Promise.resolve(),
    ]);
  }

  private async mustFind(commentId: string): Promise<TaskComment> {
    const comment = await this.d.comments.findById(commentId);
    if (!comment || comment.deletedAt) throw new ScopeNotFoundError();
    return comment;
  }

  /** Bản cũ khi gửi lại cùng `clientCommentId`; dùng lại id cho THẺ KHÁC là lỗi của client (409). */
  private async replayOf(authorId: string, clientCommentId: string, taskId: string): Promise<TaskCommentDto | null> {
    const existing = await this.d.comments.findByClientId(authorId, clientCommentId);
    if (!existing) return null;
    if (existing.taskId !== taskId) throw new AppError("clientCommentId đã được dùng cho thẻ khác", 409, ErrorCode.RES_002);
    return (await this.present([existing]))[0];
  }

  private present(comments: TaskComment[]): Promise<TaskCommentDto[]> {
    return presentComments(comments, { directory: this.d.directory, attachments: this.d.attachments, assets: this.d.assets });
  }

  private now(): Date {
    return this.d.clock ? this.d.clock() : new Date();
  }
}
